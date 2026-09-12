import { ApiProperty } from '@nestjs/swagger';

export class TomorrowNutritionTargetsDto {
  @ApiProperty() calories!: number;
  @ApiProperty() protein!: number;
  @ApiProperty() fat!: number;
  @ApiProperty() carbohydrates!: number;
}

export class TomorrowMenuItemDto {
  @ApiProperty({ example: 'Сніданок' }) mealType!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: [String] }) ingredients!: string[];
  @ApiProperty() calories!: number;
  @ApiProperty() recipe!: string;
}

export class DietRecommendationDto {
  @ApiProperty() summary!: string;
  @ApiProperty({ type: [String] }) recommendations!: string[];
  @ApiProperty({ type: TomorrowNutritionTargetsDto })
  tomorrowTargets!: TomorrowNutritionTargetsDto;
  @ApiProperty({ type: [TomorrowMenuItemDto] })
  tomorrowMenu!: TomorrowMenuItemDto[];
}
