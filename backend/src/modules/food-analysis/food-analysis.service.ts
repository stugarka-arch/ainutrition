import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';

import { MealAnalysisResultDto } from './dto/meal-analysis-result.dto';
import {
    DailyNutritionSummaryDto,
    NutritionGoalsDto,
    NutritionMicronutrientDto,
    NutritionMealDto,
    NutritionSummaryDto,
    NutritionTotalsDto,
} from './dto/nutrition-summary.dto';
import { DietRecommendationDto } from './dto/diet-recommendation.dto';
import { GeminiVisionService } from './services/gpt-vision.service';
import type { FoodAnalysisResult } from './services/gpt-vision.service';

@Injectable()
export class FoodAnalysisService {
    constructor(
        private readonly geminiVision: GeminiVisionService,
        private readonly prisma: PrismaService,
    ) { }

    async getNutritionSummary(
        userId: string,
        startDateValue?: string,
        endDateValue?: string,
    ): Promise<NutritionSummaryDto> {
        const startDate = this.parseDate(startDateValue, 'startDate');
        const endDate = this.parseDate(
            endDateValue ?? startDateValue,
            'endDate',
        );

        if (endDate < startDate) {
            throw new BadRequestException(
                'endDate must be on or after startDate',
            );
        }

        const endExclusive = new Date(endDate);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

        const [user, meals] = await Promise.all([
            this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    dailyCalorieGoal: true,
                    proteinGoal: true,
                    fatGoal: true,
                    carbGoal: true,
                },
            }),
            this.prisma.meal.findMany({
                where: {
                    userId,
                    date: { gte: startDate, lt: endExclusive },
                },
                select: {
                    id: true,
                    mealName: true,
                    mealType: true,
                    date: true,
                    calories: true,
                    protein: true,
                    fat: true,
                    carbs: true,
                    fiber: true,
                    sugar: true,
                    sodium: true,
                    micronutrients: {
                        select: {
                            name: true,
                            value: true,
                            unit: true,
                            percentageDailyValue: true,
                        },
                    },
                },
                orderBy: { date: 'asc' },
            }),
        ]);

        if (!user) {
            throw new BadRequestException('User not found');
        }

        const totals = this.createEmptyTotals();
        const dailyMap = new Map<string, DailyNutritionSummaryDto>();
        const micronutrientMap = new Map<string, NutritionMicronutrientDto>();

        for (const meal of meals) {
            this.addMealToTotals(totals, meal);

            const date = meal.date.toISOString().slice(0, 10);
            const daily = dailyMap.get(date) ?? {
                date,
                mealsCount: 0,
                totals: this.createEmptyTotals(),
            };
            daily.mealsCount += 1;
            this.addMealToTotals(daily.totals, meal);
            dailyMap.set(date, daily);

            for (const micronutrient of meal.micronutrients) {
                const key = `${micronutrient.name}:${micronutrient.unit}`;
                const current = micronutrientMap.get(key) ?? {
                    name: micronutrient.name,
                    unit: micronutrient.unit,
                    value: 0,
                    percentageDailyValue: null,
                };
                current.value += micronutrient.value;
                if (micronutrient.percentageDailyValue !== null) {
                    current.percentageDailyValue =
                        (current.percentageDailyValue ?? 0) +
                        micronutrient.percentageDailyValue;
                }
                micronutrientMap.set(key, current);
            }
        }

        const days = Math.round(
            (endDate.getTime() - startDate.getTime()) / 86_400_000,
        ) + 1;
        const goals: NutritionGoalsDto = {
            calories: user.dailyCalorieGoal * days,
            protein: user.proteinGoal * days,
            fat: user.fatGoal * days,
            carbohydrates: user.carbGoal * days,
        };

        return {
            startDate: startDate.toISOString().slice(0, 10),
            endDate: endDate.toISOString().slice(0, 10),
            days,
            mealsCount: meals.length,
            totals: this.roundTotals(totals),
            goals,
            micronutrients: Array.from(micronutrientMap.values())
                .map((nutrient) => ({
                    ...nutrient,
                    value: this.round(nutrient.value),
                    percentageDailyValue: nutrient.percentageDailyValue === null
                        ? null
                        : this.round(nutrient.percentageDailyValue),
                }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            daily: Array.from(dailyMap.values()).map((day) => ({
                ...day,
                totals: this.roundTotals(day.totals),
            })),
            meals: meals.map<NutritionMealDto>((meal) => ({
                id: meal.id,
                mealName: meal.mealName,
                mealType: meal.mealType,
                calories: this.round(meal.calories),
            })),
        };
    }

    async getDietRecommendations(
        userId: string,
        startDate?: string,
        endDate?: string,
    ): Promise<DietRecommendationDto> {
        const summary = await this.getNutritionSummary(
            userId,
            startDate,
            endDate,
        );

        return this.geminiVision.generateDietRecommendations(summary);
    }

    async analyzeMealWithContext(
        userId: string,
        imageBuffer: Buffer | undefined,
        plateDiameter: number,
        plateHeight: number,
        fillPercentage: number,
        sauces?: Array<{
            name: string;
            quantity: number;
            unit: string;
        }>,
        notes?: string,
        mimeType?: string,
    ): Promise<MealAnalysisResultDto> {
        const startTime = Date.now();

        try {
            const context = {
                plateDiameterCm: plateDiameter,
                plateHeightCm: plateHeight,
                fillPercentage,
                sauces,
                notes,
            };

            const aiResponse = imageBuffer
                ? await this.geminiVision.analyzeFood(
                    imageBuffer,
                    context,
                    mimeType,
                )
                : await this.geminiVision.analyzeFoodFromDescription(
                    context,
                    notes!,
                );

            this.validateAiResponse(aiResponse);

            const processingTime =
                Date.now() - startTime;

            /*
             * Створюємо всі записи в одній транзакції.
             *
             * Якщо будь-яка операція впаде,
             * Prisma відкотить усі попередні записи.
             */
            await this.prisma.$transaction(
                async (tx) => {
                    const meal =
                        await tx.meal.create({
                            data: {
                                userId,

                                mealType:
                                    aiResponse.mealType,

                                mealName:
                                    aiResponse.mealName,

                                calories:
                                    aiResponse.totalCalories,

                                protein:
                                    aiResponse.protein.grams,

                                fat:
                                    aiResponse.fat.grams,

                                carbs:
                                    aiResponse
                                        .carbohydrates
                                        .grams,

                                glycemicIndex:
                                    aiResponse.glycemicIndex,

                                insulinResistanceLevel:
                                    aiResponse
                                        .insulinResistanceLevel,

                                macroBalance:
                                    aiResponse.macroBalance,

                                overallConfidence:
                                    aiResponse
                                        .overallConfidence,

                                plateDiameterCm:
                                    plateDiameter,

                                plateHeightCm:
                                    plateHeight,

                                fillPercentage,

                                notes:
                                    notes?.trim() ||
                                    null,

                                aiGenerated: true,

                                userCorrected: false,

                                date: this.getToday(),
                            },
                        });

                    /*
                     * Зберігаємо всі продукти.
                     */
                    if (
                        aiResponse.foodItems.length >
                        0
                    ) {
                        await tx.mealFoodItem.createMany(
                            {
                                data:
                                    aiResponse.foodItems.map(
                                        (item) => ({
                                            mealId:
                                                meal.id,

                                            name:
                                                item.name,

                                            estimatedGrams:
                                                item.estimatedGrams,

                                            confidence:
                                                item.confidence,

                                            description:
                                                item.description,
                                        }),
                                    ),
                            },
                        );
                    }

                    /*
                     * Зберігаємо мікронутрієнти.
                     */
                    if (
                        aiResponse
                            .microNutrients.length > 0
                    ) {
                        await tx.mealMicronutrient.createMany(
                            {
                                data:
                                    aiResponse.microNutrients.map(
                                        (nutrient) => ({
                                            mealId:
                                                meal.id,

                                            name:
                                                nutrient.name,

                                            value:
                                                nutrient.value,

                                            unit:
                                                nutrient.unit,

                                            percentageDailyValue:
                                                nutrient.percentageDailyValue,
                                        }),
                                    ),
                            },
                        );
                    }

                    /*
                     * Зберігаємо рекомендації.
                     */
                    if (
                        aiResponse.insights.length >
                        0
                    ) {
                        await tx.mealInsight.createMany(
                            {
                                data:
                                    aiResponse.insights.map(
                                        (insight) => ({
                                            mealId:
                                                meal.id,

                                            text:
                                                insight,
                                        }),
                                    ),
                            },
                        );
                    }
                },
            );

            /*
             * Frontend отримує той самий результат,
             * який прийшов від Gemini.
             *
             * Ми не повертаємо Prisma Meal,
             * оскільки frontend вже очікує
             * IMealAnalysisResult.
             */
            return {
                ...aiResponse,

                plateDiameter,
                plateHeight,
                fillPercentage,
                processingTime,
            };
        } catch (error: unknown) {
            if (
                error instanceof BadRequestException
            ) {
                throw error;
            }

            if (error instanceof Error) {
                console.error(
                    'Food analysis error:',
                    error,
                );

                throw new BadRequestException(
                    error.message,
                );
            }

            throw new BadRequestException(
                'Не вдалося проаналізувати їжу',
            );
        }
    }

    private getToday(): Date {
        const today = new Date();

        today.setHours(
            0,
            0,
            0,
            0,
        );

        return today;
    }

    private parseDate(value: string | undefined, field: string): Date {
        if (!value) {
            return this.getToday();
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
        }

        const date = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
            throw new BadRequestException(`${field} must be a valid date`);
        }

        return date;
    }

    private createEmptyTotals(): NutritionTotalsDto {
        return {
            calories: 0,
            protein: 0,
            fat: 0,
            carbohydrates: 0,
            fiber: 0,
            sugar: 0,
            sodium: 0,
        };
    }

    private addMealToTotals(
        totals: NutritionTotalsDto,
        meal: {
            calories: number;
            protein: number;
            fat: number;
            carbs: number;
            fiber: number | null;
            sugar: number | null;
            sodium: number | null;
        },
    ): void {
        totals.calories += meal.calories;
        totals.protein += meal.protein;
        totals.fat += meal.fat;
        totals.carbohydrates += meal.carbs;
        totals.fiber += meal.fiber ?? 0;
        totals.sugar += meal.sugar ?? 0;
        totals.sodium += meal.sodium ?? 0;
    }

    private roundTotals(totals: NutritionTotalsDto): NutritionTotalsDto {
        return {
            calories: this.round(totals.calories),
            protein: this.round(totals.protein),
            fat: this.round(totals.fat),
            carbohydrates: this.round(totals.carbohydrates),
            fiber: this.round(totals.fiber),
            sugar: this.round(totals.sugar),
            sodium: this.round(totals.sodium),
        };
    }

    private round(value: number): number {
        return Math.round(value * 100) / 100;
    }

    private validateAiResponse(
        response: FoodAnalysisResult,
    ): void {
        if (!response.mealName) {
            throw new BadRequestException(
                'Invalid AI response: missing mealName',
            );
        }

        if (!response.mealType) {
            throw new BadRequestException(
                'Invalid AI response: missing mealType',
            );
        }

        if (
            !Array.isArray(
                response.foodItems,
            ) ||
            response.foodItems.length === 0
        ) {
            throw new BadRequestException(
                'No food items detected',
            );
        }

        if (!response.protein) {
            throw new BadRequestException(
                'Invalid AI response: missing protein',
            );
        }

        if (!response.fat) {
            throw new BadRequestException(
                'Invalid AI response: missing fat',
            );
        }

        if (!response.carbohydrates) {
            throw new BadRequestException(
                'Invalid AI response: missing carbohydrates',
            );
        }

        if (
            typeof response.totalCalories !==
            'number'
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing totalCalories',
            );
        }

        if (
            typeof response.glycemicIndex !==
            'number'
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing glycemicIndex',
            );
        }

        if (
            typeof response.macroBalance !==
            'number'
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing macroBalance',
            );
        }

        if (
            typeof response.overallConfidence !==
            'number'
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing overallConfidence',
            );
        }

        if (
            !Array.isArray(
                response.microNutrients,
            )
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing microNutrients',
            );
        }

        if (
            !Array.isArray(
                response.insights,
            )
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing insights',
            );
        }
    }
}
