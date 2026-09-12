export interface ITomorrowNutritionTargets {
    calories: number;
    protein: number;
    fat: number;
    carbohydrates: number;
}

export interface ITomorrowMenuItem {
    mealType: string;
    name: string;
    description: string;
    ingredients: string[];
    calories: number;
    recipe: string;
}

export interface IDietRecommendation {
    summary: string;
    recommendations: string[];
    tomorrowTargets: ITomorrowNutritionTargets;
    tomorrowMenu: ITomorrowMenuItem[];
}
