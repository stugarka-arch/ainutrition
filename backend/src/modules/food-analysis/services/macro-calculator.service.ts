import { Injectable } from '@nestjs/common';

export interface FoodNutritionPer100g {
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbohydrates: number | null;
    fiber: number | null;
    sugar: number | null;
    sodium: number | null;
}

export interface FoodNutritionInput {
    grams: number;
    nutrition: FoodNutritionPer100g;
}

export interface CalculatedNutrition {
    calories: number;
    protein: number;
    fat: number;
    carbohydrates: number;
    fiber: number;
    sugar: number;
    sodium: number;

    proteinCalories: number;
    fatCalories: number;
    carbohydratesCalories: number;

    proteinPercentage: number;
    fatPercentage: number;
    carbohydratesPercentage: number;

    macroBalance: number;
}

@Injectable()
export class MacroCalculatorService {
    /**
     * Переводить кількість соусу в грами.
     */
    convertSauceToGrams(
        sauceName: string,
        quantity: number,
        unit: string,
    ): number {
        const conversionTable: Record<
            string,
            Record<string, number>
        > = {
            сметана: {
                'столова ложка': 15,
                'чайна ложка': 5,
                г: 1,
            },
            майонез: {
                'столова ложка': 15,
                'чайна ложка': 5,
                г: 1,
            },
            олія: {
                'столова ложка': 15,
                'чайна ложка': 5,
                мл: 1,
            },
            масло: {
                'столова ложка': 15,
                'чайна ложка': 5,
                г: 1,
            },
            кетчуп: {
                'столова ложка': 15,
                'чайна ложка': 5,
                г: 1,
            },
            гарнір: {
                'столова ложка': 15,
                'чайна ложка': 5,
                г: 1,
            },
        };

        const key = sauceName.trim().toLowerCase();

        const conversion =
            conversionTable[key] ?? {
                'столова ложка': 15,
                'чайна ложка': 5,
                г: 1,
            };

        return quantity * (conversion[unit] ?? 1);
    }

    /**
     * Оцінює приблизну вагу їжі за діаметром тарілки та заповненням.
     */
    estimateWeightByPlate(
        diameterCm: number,
        fillPercentage: number,
    ): number {
        const standardDiameter = 23;
        const standardWeight = 350;

        const diameterMultiplier = Math.pow(
            diameterCm / standardDiameter,
            2,
        );

        const weight =
            standardWeight *
            diameterMultiplier *
            fillPercentage;

        return Math.round(weight);
    }

    /**
     * Розраховує харчову цінність усіх продуктів.
     * Дані nutrition повинні бути на 100 г продукту.
     */
    calculateNutrition(
        foods: FoodNutritionInput[],
    ): CalculatedNutrition {
        let calories = 0;
        let protein = 0;
        let fat = 0;
        let carbohydrates = 0;
        let fiber = 0;
        let sugar = 0;
        let sodium = 0;

        for (const food of foods) {
            const grams = Number(food.grams);

            if (!Number.isFinite(grams) || grams <= 0) {
                continue;
            }

            const multiplier = grams / 100;
            const nutrition = food.nutrition;

            calories +=
                (nutrition.calories ?? 0) * multiplier;

            protein +=
                (nutrition.protein ?? 0) * multiplier;

            fat +=
                (nutrition.fat ?? 0) * multiplier;

            carbohydrates +=
                (nutrition.carbohydrates ?? 0) * multiplier;

            fiber +=
                (nutrition.fiber ?? 0) * multiplier;

            sugar +=
                (nutrition.sugar ?? 0) * multiplier;

            sodium +=
                (nutrition.sodium ?? 0) * multiplier;
        }

        const proteinCalories = protein * 4;
        const fatCalories = fat * 9;
        const carbohydratesCalories =
            carbohydrates * 4;

        const macroCalories =
            proteinCalories +
            fatCalories +
            carbohydratesCalories;

        const proteinPercentage =
            macroCalories > 0
                ? (proteinCalories / macroCalories) * 100
                : 0;

        const fatPercentage =
            macroCalories > 0
                ? (fatCalories / macroCalories) * 100
                : 0;

        const carbohydratesPercentage =
            macroCalories > 0
                ? (carbohydratesCalories / macroCalories) * 100
                : 0;

        const macroBalance =
            this.calculateMacroBalance(
                protein,
                fat,
                carbohydrates,
            );

        return {
            calories: this.round(calories),
            protein: this.round(protein),
            fat: this.round(fat),
            carbohydrates: this.round(carbohydrates),
            fiber: this.round(fiber),
            sugar: this.round(sugar),
            sodium: this.round(sodium),

            proteinCalories: this.round(proteinCalories),
            fatCalories: this.round(fatCalories),
            carbohydratesCalories:
                this.round(carbohydratesCalories),

            proteinPercentage:
                this.round(proteinPercentage),
            fatPercentage:
                this.round(fatPercentage),
            carbohydratesPercentage:
                this.round(carbohydratesPercentage),

            macroBalance: this.round(macroBalance, 2),
        };
    }

    /**
     * Розраховує глікемічний індекс як приблизний показник для страви.
     */
    calculateGlycemicIndex(
        foodItems: Array<{
            name: string;
            grams: number;
        }>,
    ): number {
        const foodGiTable: Record<
            string,
            { gi: number; portion: number }
        > = {
            рис: { gi: 68, portion: 100 },
            хліб: { gi: 70, portion: 30 },
            банан: { gi: 51, portion: 120 },
            яблуко: { gi: 36, portion: 100 },
            салат: { gi: 15, portion: 100 },
            курка: { gi: 0, portion: 100 },
            яйця: { gi: 0, portion: 50 },
            картопля: { gi: 78, portion: 100 },
            макарони: { gi: 50, portion: 100 },
            каша: { gi: 55, portion: 150 },
        };

        let totalGi = 0;
        let totalWeight = 0;

        for (const item of foodItems) {
            const grams = Number(item.grams);

            if (!Number.isFinite(grams) || grams <= 0) {
                continue;
            }

            const key = item.name.trim().toLowerCase();

            const foodData =
                foodGiTable[key] ?? {
                    gi: 50,
                    portion: 100,
                };

            totalGi +=
                foodData.gi *
                (grams / foodData.portion);

            totalWeight += grams;
        }

        if (totalWeight <= 0) {
            return 0;
        }

        return Math.round(
            totalGi / (totalWeight / 100),
        );
    }

    /**
     * Оцінює глікемічне навантаження та умовний рівень впливу страви.
     * Це не є медичним діагнозом інсулінорезистентності.
     */
    calculateInsulinResistanceLevel(
        carbsGrams: number,
        glycemicIndex: number,
        fiberGrams: number,
    ): 'Низька' | 'Середня' | 'Висока' {
        const glycemicLoad =
            (glycemicIndex * carbsGrams) / 100;

        const fiberScore =
            fiberGrams > 5
                ? 1
                : fiberGrams > 2
                    ? 0.5
                    : 0;

        const score =
            glycemicLoad - fiberScore;

        if (score < 15) {
            return 'Низька';
        }

        if (score < 25) {
            return 'Середня';
        }

        return 'Висока';
    }

    /**
     * Розраховує умовний баланс макронутрієнтів.
     */
    calculateMacroBalance(
        proteinG: number,
        fatG: number,
        carbsG: number,
    ): number {
        const proteinCalories = proteinG * 4;
        const fatCalories = fatG * 9;
        const carbsCalories = carbsG * 4;

        const totalCalories =
            proteinCalories +
            fatCalories +
            carbsCalories;

        if (totalCalories <= 0) {
            return 0;
        }

        const idealProtein =
            totalCalories * 0.3;

        const idealFat =
            totalCalories * 0.3;

        const idealCarbs =
            totalCalories * 0.4;

        const proteinDiff =
            Math.abs(
                proteinCalories - idealProtein,
            );

        const fatDiff =
            Math.abs(
                fatCalories - idealFat,
            );

        const carbsDiff =
            Math.abs(
                carbsCalories - idealCarbs,
            );

        const totalDiff =
            proteinDiff +
            fatDiff +
            carbsDiff;

        return Math.max(
            0,
            1 - totalDiff / totalCalories,
        );
    }

    /**
     * Округлює число до заданої кількості знаків після коми.
     */
    round(
        value: number,
        decimals = 2,
    ): number {
        if (!Number.isFinite(value)) {
            return 0;
        }

        const multiplier =
            Math.pow(10, decimals);

        return (
            Math.round(
                value * multiplier,
            ) / multiplier
        );
    }
}