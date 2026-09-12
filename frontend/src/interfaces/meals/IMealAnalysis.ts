export type MealType =
    | "breakfast"
    | "lunch"
    | "dinner"
    | "snack"
    | "meal";

export interface IFoodItem {
    name: string;
    estimatedGrams: number;
    confidence: number;
    description: string;
}

export interface IMacro {
    grams: number;
    calories: number;
    percentage: number;
}

export interface IMicroNutrient {
    name: string;
    value: number;
    unit: string;
    percentageDailyValue: number;
}

export interface IMealAnalysisResult {
    mealName: string;
    mealType: MealType;

    foodItems: IFoodItem[];

    protein: IMacro;
    fat: IMacro;
    carbohydrates: IMacro;

    totalCalories: number;

    microNutrients: IMicroNutrient[];

    glycemicIndex: number;

    insulinResistanceLevel:
    | "Низька"
    | "Середня"
    | "Висока";

    macroBalance: number;

    insights: string[];

    overallConfidence: number;

    plateDiameter: number;
    processingTime: number;
}

export interface ISauce {
    name: string;
    quantity: number;
    unit:
    | "столова ложка"
    | "чайна ложка"
    | "г"
    | "мл"
    | "штука";
}

export interface IAnalyzeMealForm {
    photo?: FileList;
    diameterCm: number;
    heightCm: number;
    fillPercentage: number;
    sauces: ISauce[];
    notes?: string;
}
