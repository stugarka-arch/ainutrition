export interface INutritionTotals {
    calories: number;
    protein: number;
    fat: number;
    carbohydrates: number;
    fiber: number;
    sugar: number;
    sodium: number;
}

export interface INutritionGoals {
    calories: number;
    protein: number;
    fat: number;
    carbohydrates: number;
}

export interface INutritionMicronutrient {
    name: string;
    value: number;
    unit: string;
    percentageDailyValue: number | null;
}

export interface IDailyNutritionSummary {
    date: string;
    mealsCount: number;
    totals: INutritionTotals;
}

export interface INutritionMeal {
    id: string;
    mealName: string;
    mealType: string;
    calories: number;
}

export interface INutritionSummary {
    startDate: string;
    endDate: string;
    days: number;
    mealsCount: number;
    totals: INutritionTotals;
    goals: INutritionGoals;
    micronutrients: INutritionMicronutrient[];
    daily: IDailyNutritionSummary[];
    meals: INutritionMeal[];
}
