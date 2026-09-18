
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

    // Формує загальну статистику харчування користувача за вибраний період.
    async getNutritionSummary(
        userId: string,
        startDateValue?: string,
        endDateValue?: string,
    ): Promise<NutritionSummaryDto> {

        // Перевіряємо та перетворюємо передані дати у Date.
        const startDate = this.parseDate(startDateValue, 'startDate');
        const endDate = this.parseDate(
            endDateValue ?? startDateValue,
            'endDate',
        );

        // Перевіряємо, щоб кінцева дата не була раніше початкової.
        if (endDate < startDate) {
            throw new BadRequestException(
                'endDate must be on or after startDate',
            );
        }

        // Робимо кінцеву дату виключною, щоб включити весь останній день.
        const endExclusive = new Date(endDate);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

        // Одночасно отримуємо цілі користувача та його прийоми їжі з бази.
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

        // Перевіряємо, що користувач існує.
        if (!user) {
            throw new BadRequestException('User not found');
        }

        // Створюємо початкові структури для підрахунку загальних і щоденних показників.
        const totals = this.createEmptyTotals();
        const dailyMap = new Map<string, DailyNutritionSummaryDto>();
        const micronutrientMap = new Map<string, NutritionMicronutrientDto>();

        // Обробляємо кожен прийом їжі та додаємо його показники до статистики.
        for (const meal of meals) {
            this.addMealToTotals(totals, meal);

            // Групуємо прийоми їжі за календарною датою.
            const date = meal.date.toISOString().slice(0, 10);
            const daily = dailyMap.get(date) ?? {
                date,
                mealsCount: 0,
                totals: this.createEmptyTotals(),
            };
            daily.mealsCount += 1;
            this.addMealToTotals(daily.totals, meal);
            dailyMap.set(date, daily);

            // Об'єднуємо однакові мікронутрієнти з усіх прийомів їжі.
            for (const micronutrient of meal.micronutrients) {
                const key = `${ micronutrient.name }:${ micronutrient.unit } `;
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

        // Розраховуємо кількість днів і загальні цілі користувача за весь період.
        const days = Math.round(
            (endDate.getTime() - startDate.getTime()) / 86_400_000,
        ) + 1;
        const goals: NutritionGoalsDto = {
            calories: user.dailyCalorieGoal * days,
            protein: user.proteinGoal * days,
            fat: user.fatGoal * days,
            carbohydrates: user.carbGoal * days,
        };

        // Формуємо та повертаємо готовий об'єкт статистики для frontend.
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

    // Отримує статистику харчування та передає її AI для генерації рекомендацій.
    async getDietRecommendations(
        userId: string,
        startDate?: string,
        endDate?: string,
    ): Promise<DietRecommendationDto> {

        // Спочатку отримуємо статистику харчування за потрібний період.
        const summary = await this.getNutritionSummary(
            userId,
            startDate,
            endDate,
        );

        // Передаємо статистику Gemini для формування персональних рекомендацій.
        return this.geminiVision.generateDietRecommendations(summary);
    }

    // Аналізує їжу через AI та зберігає результат аналізу в базі даних.
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

        // Запам'ятовуємо час початку аналізу для розрахунку тривалості.
        const startTime = Date.now();

        try {
            // Об'єднуємо всю додаткову інформацію про їжу в один контекст для AI.
            const context = {
                plateDiameterCm: plateDiameter,
                plateHeightCm: plateHeight,
                fillPercentage,
                sauces,
                notes,
            };

            // Якщо є фото — аналізуємо його, інакше аналізуємо текстовий опис.
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

            // Перевіряємо, що AI повернув усі необхідні дані.
            this.validateAiResponse(aiResponse);

            // Розраховуємо час виконання AI-аналізу.
            const processingTime =
                Date.now() - startTime;

            /*
             * Зберігаємо Meal та всі пов'язані дані
             * в одній транзакції бази даних.
             */
            await this.prisma.$transaction(
                async (tx) => {

                    // Створюємо основний запис прийому їжі.
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
                     * Зберігаємо визначені AI продукти,
                     * якщо хоча б один продукт був знайдений.
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
                     * Зберігаємо мікронутрієнти,
                     * які AI визначив для цього прийому їжі.
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
                     * Зберігаємо AI-рекомендації та інсайти для цього прийому їжі.
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
             * Повертаємо frontend результат AI
             * разом із параметрами тарілки та часом обробки.
             */
            return {
                ...aiResponse,

                plateDiameter,
                plateHeight,
                fillPercentage,
                processingTime,
            };
        } catch (error: unknown) {

            // Повторно передаємо помилки BadRequestException без змін.
            if (
                error instanceof BadRequestException
            ) {
                throw error;
            }

            // Інші помилки перетворюємо на зрозумілу HTTP-помилку.
            if (error instanceof Error) {
                console.error(
                    'Food analysis error:',
                    error,
                );

                throw new BadRequestException(
                    error.message,
                );
            }

            // Обробляємо помилки невідомого типу.
            throw new BadRequestException(
                'Не вдалося проаналізувати їжу',
            );
        }
    }

    // Повертає поточну дату з обнуленим часом.
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

    // Перевіряє формат дати та перетворює рядок YYYY-MM-DD у Date.
    private parseDate(value: string | undefined, field: string): Date {
        if (!value) {
            return this.getToday();
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new BadRequestException(`${ field } must use YYYY - MM - DD format`);
        }

        const date = new Date(`${ value } T00:00:00.000Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
            throw new BadRequestException(`${ field } must be a valid date`);
        }

        return date;
    }

    // Створює порожню структуру для накопичення харчових показників.
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

    // Додає показники одного прийому їжі до загальних підсумків.
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

    // Округлює всі основні харчові показники до двох знаків після коми.
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

    // Округлює число до двох знаків після коми.
    private round(value: number): number {
        return Math.round(value * 100) / 100;
    }

    // Перевіряє, чи AI повернув усі обов'язкові поля та коректні типи даних.
    private validateAiResponse(
        response: FoodAnalysisResult,
    ): void {

        // Перевіряємо наявність назви страви.
        if (!response.mealName) {
            throw new BadRequestException(
                'Invalid AI response: missing mealName',
            );
        }

        // Перевіряємо наявність типу прийому їжі.
        if (!response.mealType) {
            throw new BadRequestException(
                'Invalid AI response: missing mealType',
            );
        }

        // Перевіряємо, що AI визначив хоча б один продукт.
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

        // Перевіряємо наявність білків.
        if (!response.protein) {
            throw new BadRequestException(
                'Invalid AI response: missing protein',
            );
        }

        // Перевіряємо наявність жирів.
        if (!response.fat) {
            throw new BadRequestException(
                'Invalid AI response: missing fat',
            );
        }

        // Перевіряємо наявність вуглеводів.
        if (!response.carbohydrates) {
            throw new BadRequestException(
                'Invalid AI response: missing carbohydrates',
            );
        }

        // Перевіряємо, що загальна калорійність має числове значення.
        if (
            typeof response.totalCalories !==
            'number'
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing totalCalories',
            );
        }

        // Перевіряємо, що AI повернув глікемічний індекс як число.
        if (
            typeof response.glycemicIndex !==
            'number'
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing glycemicIndex',
            );
        }

        // Перевіряємо, що AI повернув числовий баланс макронутрієнтів.
        if (
            typeof response.macroBalance !==
            'number'
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing macroBalance',
            );
        }

        // Перевіряємо, що AI повернув рівень впевненості як число.
        if (
            typeof response.overallConfidence !==
            'number'
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing overallConfidence',
            );
        }

        // Перевіряємо, що мікронутрієнти представлені масивом.
        if (
            !Array.isArray(
                response.microNutrients,
            )
        ) {
            throw new BadRequestException(
                'Invalid AI response: missing microNutrients',
            );
        }

        // Перевіряємо, що рекомендації/інсайти представлені масивом.
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

