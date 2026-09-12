import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class NutritionSummaryQueryDto {
  @ApiProperty({
    example: '2026-08-01',
    required: false,
    description: 'First day of the period (YYYY-MM-DD). Defaults to today.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    example: '2026-08-31',
    required: false,
    description: 'Last day of the period (YYYY-MM-DD). Defaults to startDate.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class NutritionTotalsDto {
  @ApiProperty() calories!: number;
  @ApiProperty() protein!: number;
  @ApiProperty() fat!: number;
  @ApiProperty() carbohydrates!: number;
  @ApiProperty() fiber!: number;
  @ApiProperty() sugar!: number;
  @ApiProperty() sodium!: number;
}

export class NutritionGoalsDto {
  @ApiProperty() calories!: number;
  @ApiProperty() protein!: number;
  @ApiProperty() fat!: number;
  @ApiProperty() carbohydrates!: number;
}

export class NutritionMicronutrientDto {
  @ApiProperty() name!: string;
  @ApiProperty() value!: number;
  @ApiProperty() unit!: string;
  @ApiProperty({ nullable: true }) percentageDailyValue!: number | null;
}

export class DailyNutritionSummaryDto {
  @ApiProperty({ example: '2026-08-30' }) date!: string;
  @ApiProperty() mealsCount!: number;
  @ApiProperty({ type: NutritionTotalsDto }) totals!: NutritionTotalsDto;
}

export class NutritionMealDto {
  @ApiProperty() id!: string;
  @ApiProperty() mealName!: string;
  @ApiProperty() mealType!: string;
  @ApiProperty() calories!: number;
}

export class NutritionSummaryDto {
  @ApiProperty() startDate!: string;
  @ApiProperty() endDate!: string;
  @ApiProperty() days!: number;
  @ApiProperty() mealsCount!: number;
  @ApiProperty({ type: NutritionTotalsDto }) totals!: NutritionTotalsDto;
  @ApiProperty({ type: NutritionGoalsDto }) goals!: NutritionGoalsDto;
  @ApiProperty({ type: [NutritionMicronutrientDto] })
  micronutrients!: NutritionMicronutrientDto[];
  @ApiProperty({ type: [DailyNutritionSummaryDto] })
  daily!: DailyNutritionSummaryDto[];
  @ApiProperty({ type: [NutritionMealDto] })
  meals!: NutritionMealDto[];
}
