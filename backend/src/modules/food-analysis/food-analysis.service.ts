import { FoodKnowledgeService } from './../food-knowledge/food-knowledge.service';
import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';

import {
    MealAnalysisResultDto,
    MicroNutrientDto,
    FoodItemAnalysisDto,
} from './dto/meal-analysis-result.dto';

import {
    DailyNutritionSummaryDto,
    NutritionSummaryDto,
    NutritionMicronutrientDto,
    NutritionMealDto,
    NutritionTotalsDto,
    NutritionGoalsDto,
} from './dto/nutrition-summary.dto';

import { DietRecommendationDto } from './dto/diet-recommendation.dto';

import { GeminiVisionService } from './services/gpt-vision.service';
import type { FoodAnalysisResult } from './services/gpt-vision.service';

import { FoodDataCentralService } from '../food-knowledge/food-data-central.service';

import { SauceIngredientDto } from './dto/analyze-meal-with-context.dto';
import { MacroCalculatorService } from './services/macro-calculator.service';

@Injectable()
export class FoodAnalysisService {
    constructor(
        private readonly geminiVision: GeminiVisionService,
        private readonly prisma: PrismaService,
        private readonly foodKnowledge: FoodKnowledgeService,
        private readonly foodDataCentral: FoodDataCentralService,
        private readonly macroCalculator: MacroCalculatorService,
    ) { }

    async getNutritionSummary(
        userId: string,
        startDateValue?: string,
        endDateValue?: string,
    ): Promise<NutritionSummaryDto> {
        const startDate = this.parseDate(
            startDateValue,
            'startDate',
        );

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

        endExclusive.setUTCDate(
            endExclusive.getUTCDate() + 1,
        );

        const [user, meals] = await Promise.all([
            this.prisma.user.findUnique({
                where: {
                    id: userId,
                },

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

                    date: {
                        gte: startDate,
                        lt: endExclusive,
                    },
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

                orderBy: {
                    date: 'asc',
                },
            }),
        ]);

        if (!user) {
            throw new BadRequestException(
                'User not found',
            );
        }

        const totals = this.createEmptyTotals();

        const dailyMap =
            new Map<
                string,
                DailyNutritionSummaryDto
            >();

        const micronutrientMap =
            new Map<
                string,
                NutritionMicronutrientDto
            >();

        for (const meal of meals) {
            this.addMealToTotals(
                totals,
                meal,
            );

            const date =
                meal.date
                    .toISOString()
                    .slice(0, 10);

            const daily =
                dailyMap.get(date) ??
                {
                    date,
                    mealsCount: 0,
                    totals:
                        this.createEmptyTotals(),
                };

            daily.mealsCount += 1;

            this.addMealToTotals(
                daily.totals,
                meal,
            );

            dailyMap.set(
                date,
                daily,
            );

            for (
                const micronutrient
                of meal.micronutrients
            ) {
                const key =
                    micronutrient.name +
                    ':' +
                    micronutrient.unit;

                const current =
                    micronutrientMap.get(key) ??
                    {
                        name:
                            micronutrient.name,

                        unit:
                            micronutrient.unit,

                        value: 0,

                        percentageDailyValue:
                            null,
                    };

                current.value +=
                    micronutrient.value;

                if (
                    micronutrient.percentageDailyValue !==
                    null
                ) {
                    current.percentageDailyValue =
                        (
                            current.percentageDailyValue ??
                            0
                        ) +
                        micronutrient.percentageDailyValue;
                }

                micronutrientMap.set(
                    key,
                    current,
                );
            }
        }

        const days =
            Math.round(
                (
                    endDate.getTime() -
                    startDate.getTime()
                ) /
                86_400_000,
            ) + 1;

        const goals: NutritionGoalsDto = {
            calories:
                user.dailyCalorieGoal *
                days,

            protein:
                user.proteinGoal *
                days,

            fat:
                user.fatGoal *
                days,

            carbohydrates:
                user.carbGoal *
                days,
        };

        return {
            startDate:
                startDate
                    .toISOString()
                    .slice(0, 10),

            endDate:
                endDate
                    .toISOString()
                    .slice(0, 10),

            days,

            mealsCount:
                meals.length,

            totals:
                this.roundTotals(
                    totals,
                ),

            goals,

            micronutrients:
                Array.from(
                    micronutrientMap.values(),
                )
                    .map(
                        (nutrient) => ({
                            ...nutrient,

                            value:
                                this.round(
                                    nutrient.value,
                                ),

                            percentageDailyValue:
                                nutrient.percentageDailyValue ===
                                    null
                                    ? null
                                    : this.round(
                                        nutrient.percentageDailyValue,
                                    ),
                        }),
                    )
                    .sort(
                        (a, b) =>
                            a.name.localeCompare(
                                b.name,
                            ),
                    ),

            daily:
                Array.from(
                    dailyMap.values(),
                ).map(
                    (day) => ({
                        ...day,

                        totals:
                            this.roundTotals(
                                day.totals,
                            ),
                    }),
                ),

            meals:
                meals.map<NutritionMealDto>(
                    (meal) => ({
                        id:
                            meal.id,

                        mealName:
                            meal.mealName,

                        mealType:
                            meal.mealType,

                        calories:
                            this.round(
                                meal.calories,
                            ),
                    }),
                ),
        };
    }

    async getDietRecommendations(
        userId: string,
        startDate?: string,
        endDate?: string,
    ): Promise<DietRecommendationDto> {
        const summary =
            await this.getNutritionSummary(
                userId,
                startDate,
                endDate,
            );

        return this.geminiVision
            .generateDietRecommendations(
                summary,
            );
    }

    /*
     * Аналізує фото або текстовий опис страви,
     * отримує поживні дані через FoodKnowledge / USDA
     * та зберігає результат у Meal.
     */

    async analyzeMealWithContext(
        userId: string,
        photoBuffer: Buffer | undefined,
        plateDiameterCm: number,
        plateHeightCm: number,
        fillPercentage: number,
        sauces?: SauceIngredientDto[],
        notes?: string,
        photoMimetype?: string,
    ): Promise<MealAnalysisResultDto> {
        const startTime = Date.now();

        const plateInfo = {
            diameterCm: plateDiameterCm,
            heightCm: plateHeightCm,
            fillPercentage,
        };

        console.log('');
        console.log('=================================================');
        console.log('🍎 🍎 🍎 STEP 1: STARTING FOOD ANALYSIS');
        console.log('=================================================');

        console.log('STEP 1.1: Plate context:', plateInfo);

        // =========================================================
        // STEP 2. Gemini визначає продукти та приблизну вагу
        // =========================================================

        console.log('');
        console.log('=================================================');
        console.log('STEP 2: ANALYZING PHOTO WITH GEMINI');
        console.log('=================================================');

        const saucesText = sauces?.length
            ? sauces
                .map(
                    sauce =>
                        `${sauce.name}: ${sauce.quantity} ${sauce.unit}`,
                )
                .join(', ')
            : undefined;

        console.log('STEP 2.1: Sauce context:', saucesText ?? 'none');
        console.log('STEP 2.2: Notes:', notes ?? 'none');


        let aiResponse: FoodAnalysisResult;

        if (photoBuffer) {
            console.log(
                'STEP 2.3: Analyzing food from PHOTO',
            );

            aiResponse =
                await this.geminiVision.analyzeFood(
                    photoBuffer,
                    {
                        plateDiameterCm:
                            plateInfo.diameterCm,

                        plateHeightCm:
                            plateInfo.heightCm,

                        fillPercentage:
                            plateInfo.fillPercentage,
                    },
                    photoMimetype ?? 'image/jpeg',
                );
        } else {
            console.log(
                'STEP 2.3: No photo provided - analyzing food from DESCRIPTION',
            );

            if (!notes?.trim()) {
                throw new BadRequestException(
                    'Вкажіть опис страви, якщо фото не завантажено.',
                );
            }

            aiResponse =
                await this.geminiVision.analyzeFoodFromDescription(
                    {
                        plateDiameterCm:
                            plateInfo.diameterCm,

                        plateHeightCm:
                            plateInfo.heightCm,

                        fillPercentage:
                            plateInfo.fillPercentage,
                    },
                    notes.trim(),
                );
        }

        console.log('STEP 2.3: Gemini response received');

        console.log(
            '========== GEMINI RAW RESULT ==========',
        );

        console.log(
            JSON.stringify(
                aiResponse,
                null,
                2,
            ),
        );

        console.log(
            '========================================',
        );

        const validatedResponse =
            this.validateAiResponse(aiResponse);

        console.log('STEP 2.4: AI response validated');

        console.log(
            'STEP 2.5: Gemini meal totals:',
            {
                calories: validatedResponse.totalCalories,

                protein:
                    validatedResponse.protein.grams,

                fat:
                    validatedResponse.fat.grams,

                carbohydrates:
                    validatedResponse.carbohydrates.grams,

                fiber:
                    validatedResponse.fiber,

                sugar:
                    validatedResponse.sugar,

                sodium:
                    validatedResponse.sodium,
            },
        );

        // =========================================================
        // STEP 3. Отримуємо FoodKnowledge для кожного продукту
        // =========================================================

        console.log('');
        console.log('=================================================');
        console.log('STEP 3: RESOLVING FOOD KNOWLEDGE');
        console.log('=================================================');

        type FoodKnowledgeRecord = NonNullable<
            Awaited<
                ReturnType<
                    FoodKnowledgeService['findOrCreateFood']
                >
            >
        >;

        const foodKnowledgeResults: Array<{
            item: FoodItemAnalysisDto;
            knowledge: FoodKnowledgeRecord;
        }> = [];

        let hasFoodKnowledgeFallback = false;

        for (
            const item
            of validatedResponse.foodItems
        ) {
            console.log('');
            console.log(
                '-------------------------------------------------',
            );

            console.log(
                `STEP 3.1: Resolving food "${item.name}"`,
            );

            console.log(
                'STEP 3.1 INPUT:',
                {
                    name: item.name,
                    estimatedGrams: item.estimatedGrams,
                    confidence: item.confidence,
                    description: item.description,
                },
            );

            try {
                const knowledge =
                    await this.foodKnowledge.findOrCreateFood(
                        item.name,
                        item.description,
                        item.aliasesUk,
                        item.aliasesEn,
                    );

                if (!knowledge) {
                    console.warn(
                        `STEP 3.2: Food knowledge NOT FOUND for "${item.name}"`,
                    );

                    hasFoodKnowledgeFallback = true;

                    continue;
                }

                console.log(
                    'STEP 3.2: Food knowledge FOUND:',
                    {
                        id: knowledge.id,

                        name: knowledge.name,

                        nameUk: knowledge.nameUk,

                        nameEn: knowledge.nameEn,

                        source: knowledge.source,

                        calories:
                            knowledge.calories,

                        protein:
                            knowledge.protein,

                        fat:
                            knowledge.fat,

                        carbohydrates:
                            knowledge.carbohydrates,

                        fiber:
                            knowledge.fiber,

                        sugar:
                            knowledge.sugar,

                        sodium:
                            knowledge.sodium,
                    },
                );

                foodKnowledgeResults.push({
                    item,
                    knowledge,
                });
            } catch (error) {
                console.error(
                    `STEP 3.ERROR: Failed to resolve "${item.name}"`,
                    error,
                );

                hasFoodKnowledgeFallback = true;
            }
        }

        console.log('');
        console.log(
            '=================================================',
        );

        console.log(
            'STEP 3.3: Food knowledge resolution completed',
        );

        console.log(
            'STEP 3.3 SUMMARY:',
            {
                geminiFoodItems:
                    validatedResponse.foodItems.length,

                foodKnowledgeFound:
                    foodKnowledgeResults.length,

                hasFoodKnowledgeFallback,
            },
        );

        console.log(
            '=================================================',
        );

        // =========================================================
        // STEP 4. Розрахунок фінальної харчової цінності
        // =========================================================

        console.log('');
        console.log('=================================================');
        console.log('STEP 4: CALCULATING FINAL NUTRITION');
        console.log('=================================================');

        let finalCalories: number;
        let finalProtein: number;
        let finalFat: number;
        let finalCarbs: number;
        let finalFiber: number;
        let finalSugar: number;
        let finalSodium: number;

        let proteinCalories: number;
        let fatCalories: number;
        let carbsCalories: number;

        let proteinPercentage: number;
        let fatPercentage: number;
        let carbsPercentage: number;

        let macroBalance: number;

        const allFoodsFound =
            !hasFoodKnowledgeFallback &&
            foodKnowledgeResults.length ===
            validatedResponse.foodItems.length;

        console.log(
            'STEP 4.1: allFoodsFound =',
            allFoodsFound,
        );

        // =========================================================
        // STEP 4A. FoodKnowledge + MacroCalculator
        // =========================================================

        if (allFoodsFound) {
            console.log(
                'STEP 4.2: Using FoodKnowledge as source of truth',
            );

            console.log('');
            console.log(
                '========== FOOD KNOWLEDGE NUTRITION ==========',
            );

            let debugCaloriesTotal = 0;
            let debugProteinTotal = 0;
            let debugFatTotal = 0;
            let debugCarbsTotal = 0;
            let debugFiberTotal = 0;
            let debugSugarTotal = 0;
            let debugSodiumTotal = 0;

            for (
                const { item, knowledge }
                of foodKnowledgeResults
            ) {
                const grams =
                    Number(item.estimatedGrams);

                const multiplier =
                    grams / 100;

                const calories =
                    (knowledge.calories ?? 0) *
                    multiplier;

                const protein =
                    (knowledge.protein ?? 0) *
                    multiplier;

                const fat =
                    (knowledge.fat ?? 0) *
                    multiplier;

                const carbohydrates =
                    (knowledge.carbohydrates ?? 0) *
                    multiplier;

                const fiber =
                    (knowledge.fiber ?? 0) *
                    multiplier;

                const sugar =
                    (knowledge.sugar ?? 0) *
                    multiplier;

                const sodium =
                    (knowledge.sodium ?? 0) *
                    multiplier;

                debugCaloriesTotal += calories;
                debugProteinTotal += protein;
                debugFatTotal += fat;
                debugCarbsTotal += carbohydrates;
                debugFiberTotal += fiber;
                debugSugarTotal += sugar;
                debugSodiumTotal += sodium;

                console.log('');
                console.log(
                    '---------- FOOD ITEM ----------',
                );

                console.log({
                    itemName: item.name,

                    grams,

                    confidence:
                        item.confidence,

                    description:
                        item.description,

                    knowledgeId:
                        knowledge.id,

                    knowledgeName:
                        knowledge.name,

                    nameUk:
                        knowledge.nameUk,

                    nameEn:
                        knowledge.nameEn,

                    source:
                        knowledge.source,

                    caloriesPer100g:
                        knowledge.calories,

                    proteinPer100g:
                        knowledge.protein,

                    fatPer100g:
                        knowledge.fat,

                    carbohydratesPer100g:
                        knowledge.carbohydrates,

                    fiberPer100g:
                        knowledge.fiber,

                    sugarPer100g:
                        knowledge.sugar,

                    sodiumPer100g:
                        knowledge.sodium,

                    calculatedCalories:
                        this.macroCalculator.round(
                            calories,
                        ),

                    calculatedProtein:
                        this.macroCalculator.round(
                            protein,
                        ),

                    calculatedFat:
                        this.macroCalculator.round(
                            fat,
                        ),

                    calculatedCarbohydrates:
                        this.macroCalculator.round(
                            carbohydrates,
                        ),

                    calculatedFiber:
                        this.macroCalculator.round(
                            fiber,
                        ),

                    calculatedSugar:
                        this.macroCalculator.round(
                            sugar,
                        ),

                    calculatedSodium:
                        this.macroCalculator.round(
                            sodium,
                        ),
                });
            }

            console.log('');
            console.log(
                '========== FOOD KNOWLEDGE MANUAL TOTAL ==========',
            );

            console.log({
                calories:
                    this.macroCalculator.round(
                        debugCaloriesTotal,
                    ),

                protein:
                    this.macroCalculator.round(
                        debugProteinTotal,
                    ),

                fat:
                    this.macroCalculator.round(
                        debugFatTotal,
                    ),

                carbohydrates:
                    this.macroCalculator.round(
                        debugCarbsTotal,
                    ),

                fiber:
                    this.macroCalculator.round(
                        debugFiberTotal,
                    ),

                sugar:
                    this.macroCalculator.round(
                        debugSugarTotal,
                    ),

                sodium:
                    this.macroCalculator.round(
                        debugSodiumTotal,
                    ),
            });

            console.log(
                '=================================================',
            );

            // =====================================================
            // STEP 4.3. Передаємо дані в MacroCalculator
            // =====================================================

            const nutritionInputs =
                foodKnowledgeResults.map(
                    ({ item, knowledge }) => ({
                        grams:
                            item.estimatedGrams,

                        nutrition: {
                            calories:
                                knowledge.calories,

                            protein:
                                knowledge.protein,

                            fat:
                                knowledge.fat,

                            carbohydrates:
                                knowledge.carbohydrates,

                            fiber:
                                knowledge.fiber,

                            sugar:
                                knowledge.sugar,

                            sodium:
                                knowledge.sodium,
                        },
                    }),
                );

            console.log('');
            console.log(
                'STEP 4.3: MacroCalculator INPUT',
            );

            console.log(
                JSON.stringify(
                    nutritionInputs,
                    null,
                    2,
                ),
            );

            // =====================================================
            // STEP 4.4. Виконуємо розрахунок
            // =====================================================

            const calculatedNutrition =
                this.macroCalculator.calculateNutrition(
                    nutritionInputs,
                );

            console.log('');
            console.log(
                'STEP 4.4: MacroCalculator OUTPUT',
            );

            console.log(
                JSON.stringify(
                    calculatedNutrition,
                    null,
                    2,
                ),
            );

            // =====================================================
            // STEP 4.5. Записуємо результат у фінальні змінні
            // =====================================================

            finalCalories =
                calculatedNutrition.calories;

            finalProtein =
                calculatedNutrition.protein;

            finalFat =
                calculatedNutrition.fat;

            finalCarbs =
                calculatedNutrition.carbohydrates;

            finalFiber =
                calculatedNutrition.fiber;

            finalSugar =
                calculatedNutrition.sugar;

            finalSodium =
                calculatedNutrition.sodium;

            proteinCalories =
                calculatedNutrition.proteinCalories;

            fatCalories =
                calculatedNutrition.fatCalories;

            carbsCalories =
                calculatedNutrition.carbohydratesCalories;

            proteinPercentage =
                calculatedNutrition.proteinPercentage;

            fatPercentage =
                calculatedNutrition.fatPercentage;

            carbsPercentage =
                calculatedNutrition.carbohydratesPercentage;

            macroBalance =
                calculatedNutrition.macroBalance;

            console.log('');
            console.log(
                'STEP 4.5: FINAL FOOD KNOWLEDGE NUTRITION',
            );

            console.log({
                calories:
                    finalCalories,

                protein:
                    finalProtein,

                fat:
                    finalFat,

                carbohydrates:
                    finalCarbs,

                fiber:
                    finalFiber,

                sugar:
                    finalSugar,

                sodium:
                    finalSodium,

                proteinCalories,

                fatCalories,

                carbohydratesCalories:
                    carbsCalories,

                proteinPercentage,

                fatPercentage,

                carbohydratesPercentage:
                    carbsPercentage,

                macroBalance,
            });
        }

        // =========================================================
        // STEP 4B. Gemini fallback
        // =========================================================

        else {
            console.warn('');
            console.warn(
                'STEP 4.2: FoodKnowledge incomplete',
            );

            console.warn(
                'STEP 4.2: USING GEMINI FALLBACK',
            );

            finalCalories =
                validatedResponse.totalCalories;

            finalProtein =
                validatedResponse.protein.grams;

            finalFat =
                validatedResponse.fat.grams;

            finalCarbs =
                validatedResponse.carbohydrates.grams;

            finalFiber =
                validatedResponse.fiber;

            finalSugar =
                validatedResponse.sugar;

            finalSodium =
                validatedResponse.sodium;

            proteinCalories =
                finalProtein * 4;

            fatCalories =
                finalFat * 9;

            carbsCalories =
                finalCarbs * 4;

            const totalMacroCalories =
                proteinCalories +
                fatCalories +
                carbsCalories;

            proteinPercentage =
                totalMacroCalories > 0
                    ? (
                        proteinCalories /
                        totalMacroCalories
                    ) * 100
                    : 0;

            fatPercentage =
                totalMacroCalories > 0
                    ? (
                        fatCalories /
                        totalMacroCalories
                    ) * 100
                    : 0;

            carbsPercentage =
                totalMacroCalories > 0
                    ? (
                        carbsCalories /
                        totalMacroCalories
                    ) * 100
                    : 0;

            macroBalance =
                this.macroCalculator.calculateMacroBalance(
                    finalProtein,
                    finalFat,
                    finalCarbs,
                );

            console.warn(
                'STEP 4.3: Gemini fallback nutrition:',
                {
                    calories: finalCalories,
                    protein: finalProtein,
                    fat: finalFat,
                    carbohydrates: finalCarbs,
                    fiber: finalFiber,
                    sugar: finalSugar,
                    sodium: finalSodium,
                },
            );
        }

        // =========================================================
        // STEP 5. Додаткові показники
        // =========================================================

        console.log('');
        console.log('=================================================');
        console.log('STEP 5: CALCULATING ADDITIONAL NUTRITION DATA');
        console.log('=================================================');

        const glycemicIndex =
            this.macroCalculator.calculateGlycemicIndex(
                validatedResponse.foodItems.map(
                    item => ({
                        name: item.name,
                        grams: item.estimatedGrams,
                    }),
                ),
            );

        const insulinResistanceLevel =
            this.macroCalculator.calculateInsulinResistanceLevel(
                finalCarbs,
                glycemicIndex,
                finalFiber,
            );

        console.log(
            'STEP 5.1: Additional nutrition:',
            {
                glycemicIndex,
                insulinResistanceLevel,
            },
        );

        // =========================================================
        // STEP 6. Округлення
        // =========================================================

        console.log('');
        console.log('=================================================');
        console.log('STEP 6: ROUNDING FINAL VALUES');
        console.log('=================================================');

        const roundedCalories =
            this.macroCalculator.round(
                finalCalories,
            );

        const roundedProtein =
            this.macroCalculator.round(
                finalProtein,
            );

        const roundedFat =
            this.macroCalculator.round(
                finalFat,
            );

        const roundedCarbs =
            this.macroCalculator.round(
                finalCarbs,
            );

        const roundedFiber =
            this.macroCalculator.round(
                finalFiber,
            );

        const roundedSugar =
            this.macroCalculator.round(
                finalSugar,
            );

        const roundedSodium =
            this.macroCalculator.round(
                finalSodium,
            );

        const roundedProteinCalories =
            this.macroCalculator.round(
                proteinCalories,
            );

        const roundedFatCalories =
            this.macroCalculator.round(
                fatCalories,
            );

        const roundedCarbsCalories =
            this.macroCalculator.round(
                carbsCalories,
            );

        const roundedProteinPercentage =
            this.macroCalculator.round(
                proteinPercentage,
                1,
            );

        const roundedFatPercentage =
            this.macroCalculator.round(
                fatPercentage,
                1,
            );

        const roundedCarbsPercentage =
            this.macroCalculator.round(
                carbsPercentage,
                1,
            );

        const roundedMacroBalance =
            this.macroCalculator.round(
                macroBalance,
                2,
            );

        console.log(
            'STEP 6.1: FINAL NUTRITION AFTER ROUNDING:',
            {
                calories:
                    roundedCalories,

                protein:
                    roundedProtein,

                fat:
                    roundedFat,

                carbohydrates:
                    roundedCarbs,

                fiber:
                    roundedFiber,

                sugar:
                    roundedSugar,

                sodium:
                    roundedSodium,

                proteinCalories:
                    roundedProteinCalories,

                fatCalories:
                    roundedFatCalories,

                carbohydratesCalories:
                    roundedCarbsCalories,

                proteinPercentage:
                    roundedProteinPercentage,

                fatPercentage:
                    roundedFatPercentage,

                carbohydratesPercentage:
                    roundedCarbsPercentage,

                macroBalance:
                    roundedMacroBalance,

                glycemicIndex,

                insulinResistanceLevel,
            },
        );

        // =========================================================
        // STEP 7. Зберігаємо Meal
        // =========================================================

        console.log('');
        console.log('=================================================');
        console.log('STEP 7: SAVING MEAL TO DATABASE');
        console.log('=================================================');

        const meal =
            await this.prisma.meal.create({
                data: {
                    userId,

                    mealType:
                        validatedResponse.mealType,

                    mealName:
                        validatedResponse.mealName,

                    calories:
                        roundedCalories,

                    protein:
                        roundedProtein,

                    fat:
                        roundedFat,

                    carbs:
                        roundedCarbs,

                    fiber:
                        roundedFiber,

                    sugar:
                        roundedSugar,

                    sodium:
                        roundedSodium,

                    glycemicIndex,

                    insulinResistanceLevel,

                    macroBalance:
                        roundedMacroBalance,

                    overallConfidence:
                        validatedResponse.overallConfidence,

                    plateDiameterCm:
                        plateInfo.diameterCm,

                    plateHeightCm:
                        plateInfo.heightCm,

                    fillPercentage:
                        plateInfo.fillPercentage,

                    notes:
                        notes ?? null,

                    date:
                        new Date(),

                    foodItems: {
                        create:
                            validatedResponse.foodItems.map(
                                item => ({
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

                    micronutrients: {
                        create:
                            validatedResponse.microNutrients.map(
                                nutrient => ({
                                    name:
                                        nutrient.name,

                                    value:
                                        nutrient.value,

                                    unit:
                                        nutrient.unit,
                                }),
                            ),
                    },

                    insights: {
                        create:
                            validatedResponse.insights.map(
                                insight => ({
                                    text:
                                        insight,
                                }),
                            ),
                    },
                },

                include: {
                    foodItems: true,
                    micronutrients: true,
                    insights: true,
                },
            });

        console.log(
            'STEP 7.1: Meal saved:',
            meal.id,
        );

        console.log(
            'STEP 7.2: Saved meal nutrition:',
            {
                calories: meal.calories,
                protein: meal.protein,
                fat: meal.fat,
                carbs: meal.carbs,
                fiber: meal.fiber,
                sugar: meal.sugar,
                sodium: meal.sodium,
            },
        );

        // =========================================================
        // STEP 8. Формуємо відповідь
        // =========================================================

        console.log('');
        console.log('=================================================');
        console.log('STEP 8: CREATING FINAL DTO');
        console.log('=================================================');

        const processingTime =
            Date.now() - startTime;

        const result: MealAnalysisResultDto = {
            mealName:
                validatedResponse.mealName,

            mealType:
                validatedResponse.mealType,

            plateDiameter:
                plateInfo.diameterCm,

            plateHeight:
                plateInfo.heightCm,

            fillPercentage:
                plateInfo.fillPercentage,

            foodItems:
                validatedResponse.foodItems,

            totalCalories:
                roundedCalories,

            protein: {
                grams:
                    roundedProtein,

                calories:
                    roundedProteinCalories,

                percentage:
                    roundedProteinPercentage,
            },

            fat: {
                grams:
                    roundedFat,

                calories:
                    roundedFatCalories,

                percentage:
                    roundedFatPercentage,
            },

            carbohydrates: {
                grams:
                    roundedCarbs,

                calories:
                    roundedCarbsCalories,

                percentage:
                    roundedCarbsPercentage,
            },

            fiber:
                roundedFiber,

            sugar:
                roundedSugar,

            sodium:
                roundedSodium,

            microNutrients:
                validatedResponse.microNutrients,

            glycemicIndex,

            insulinResistanceLevel,

            macroBalance:
                roundedMacroBalance,

            insights:
                validatedResponse.insights,

            overallConfidence:
                validatedResponse.overallConfidence,

            processingTime,
        };

        console.log(
            'STEP 8.1: Final DTO:',
            {
                calories:
                    result.totalCalories,

                protein:
                    result.protein.grams,

                fat:
                    result.fat.grams,

                carbohydrates:
                    result.carbohydrates.grams,

                fiber:
                    result.fiber,

                sugar:
                    result.sugar,

                sodium:
                    result.sodium,

                processingTime:
                    result.processingTime,
            },
        );

        console.log('');
        console.log('=================================================');
        console.log('ANALYSIS COMPLETED');
        console.log('=================================================');

        return result;
    }

    private getToday(): Date {
        const today =
            new Date();

        today.setHours(
            0,
            0,
            0,
            0,
        );

        return today;
    }

    private parseDate(
        value: string | undefined,
        field: string,
    ): Date {
        if (!value) {
            return this.getToday();
        }

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(
                value,
            )
        ) {
            throw new BadRequestException(
                field +
                ' must use YYYY-MM-DD format',
            );
        }

        const date =
            new Date(
                value +
                'T00:00:00.000Z',
            );

        if (
            Number.isNaN(
                date.getTime(),
            ) ||
            date
                .toISOString()
                .slice(0, 10) !==
            value
        ) {
            throw new BadRequestException(
                field +
                ' must be a valid date',
            );
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
        totals.calories +=
            meal.calories;

        totals.protein +=
            meal.protein;

        totals.fat +=
            meal.fat;

        totals.carbohydrates +=
            meal.carbs;

        totals.fiber +=
            meal.fiber ?? 0;

        totals.sugar +=
            meal.sugar ?? 0;

        totals.sodium +=
            meal.sodium ?? 0;
    }

    private roundTotals(
        totals: NutritionTotalsDto,
    ): NutritionTotalsDto {
        return {
            calories:
                this.round(
                    totals.calories,
                ),

            protein:
                this.round(
                    totals.protein,
                ),

            fat:
                this.round(
                    totals.fat,
                ),

            carbohydrates:
                this.round(
                    totals.carbohydrates,
                ),

            fiber:
                this.round(
                    totals.fiber,
                ),

            sugar:
                this.round(
                    totals.sugar,
                ),

            sodium:
                this.round(
                    totals.sodium,
                ),
        };
    }

    private round(
        value: number,
    ): number {
        return (
            Math.round(
                value * 100,
            ) / 100
        );
    }

    private validateAiResponse(
        response: FoodAnalysisResult,
    ): FoodAnalysisResult {
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

        return response;
    }
}