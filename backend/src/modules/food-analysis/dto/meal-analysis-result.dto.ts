import { ApiProperty } from '@nestjs/swagger';

export class MacroNutrientDto {
    @ApiProperty({
        example: 45,
        description: 'Кількість у грамах',
    })
    grams!: number;

    @ApiProperty({
        example: 180,
        description: 'Калорії',
    })
    calories!: number;

    @ApiProperty({
        example: 0.36,
        description: 'Частка від загальної калорійності',
    })
    percentage!: number;
}

export class MicroNutrientDto {
    @ApiProperty({
        example: 'Кальцій',
    })
    name!: string;

    @ApiProperty({
        example: 250,
    })
    value!: number;

    @ApiProperty({
        example: 'мг',
    })
    unit!: string;

    @ApiProperty({
        example: 25,
    })
    percentageDailyValue!: number;
}

export class FoodItemAnalysisDto {
    @ApiProperty({
        example: 'Курка гриль',
    })
    name!: string;

    @ApiProperty({
        example: 180,
    })
    estimatedGrams!: number;

    @ApiProperty({
        example: 0.85,
        description: 'Впевненість від 0 до 1',
    })
    confidence!: number;

    @ApiProperty({
        example: 'Куряче філе, приготовлене на грилі',
    })
    description!: string;
}

export class MealAnalysisResultDto {
    @ApiProperty({
        example: 'Курка з рисом і салатом зі сметаною',
    })
    mealName!: string;

    @ApiProperty({
        example: 'lunch',
        enum: [
            'breakfast',
            'lunch',
            'dinner',
            'snack',
            'meal',
        ],
    })
    mealType!:
        | 'breakfast'
        | 'lunch'
        | 'dinner'
        | 'snack'
        | 'meal';

    // Plate context

    @ApiProperty({
        example: 23,
        description: 'Діаметр тарілки в сантиметрах',
    })
    plateDiameter!: number;

    @ApiProperty({
        example: 5,
        description: 'Висота тарілки в сантиметрах',
    })
    plateHeight!: number;

    @ApiProperty({
        example: 0.8,
        description: 'Заповненість тарілки від 0 до 1',
    })
    fillPercentage!: number;

    // Food items

    @ApiProperty({
        type: [FoodItemAnalysisDto],
    })
    foodItems!: FoodItemAnalysisDto[];

    // Macronutrients

    @ApiProperty({
        type: MacroNutrientDto,
    })
    protein!: MacroNutrientDto;

    @ApiProperty({
        type: MacroNutrientDto,
    })
    fat!: MacroNutrientDto;

    @ApiProperty({
        type: MacroNutrientDto,
    })
    carbohydrates!: MacroNutrientDto;

    @ApiProperty({
        example: 600,
    })
    totalCalories!: number;

    // Micronutrients

    @ApiProperty({
        type: [MicroNutrientDto],
    })
    microNutrients!: MicroNutrientDto[];

    // Health indicators

    @ApiProperty({
        example: 45,
        description: 'Глікемічний індекс від 0 до 100',
    })
    glycemicIndex!: number;

    @ApiProperty({
        example: 'Середня',
        enum: [
            'Низька',
            'Середня',
            'Висока',
        ],
    })
    insulinResistanceLevel!:
        | 'Низька'
        | 'Середня'
        | 'Висока';

    @ApiProperty({
        example: 0.65,
        description: 'Баланс макронутрієнтів від 0 до 1',
    })
    macroBalance!: number;

    @ApiProperty({
        example: [
            'Багато клітковини',
            'Низький глікемічний індекс',
        ],
    })
    insights!: string[];

    @ApiProperty({
        example: 0.87,
        description: 'Загальна впевненість від 0 до 1',
    })
    overallConfidence!: number;

    @ApiProperty({
        example: 1200,
        description: 'Час аналізу в мілісекундах',
    })
    processingTime!: number;
}