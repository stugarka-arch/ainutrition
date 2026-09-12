import { IsString, IsNumber, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SauceIngredientDto {
    @ApiProperty({
        example: 'сметана',
        description: 'Назва соусу/добавки',
    })
    @IsString()
    name!: string;

    @ApiProperty({
        example: 1,
        description: 'Кількість (число)',
    })
    @IsNumber()
    quantity!: number;

    @ApiProperty({
        example: 'столова ложка',
        description: 'Одиниця виміру: столова ложка, чайна ложка, грам, мл',
        enum: ['столова ложка', 'чайна ложка', 'г', 'мл', 'штука'],
    })
    @IsString()
    unit!: 'столова ложка' | 'чайна ложка' | 'г' | 'мл' | 'штука';
}

export class PlateDimensionsDto {
    @ApiProperty({
        example: 23,
        description: 'Діаметр тарілки в сантиметрах (зазвичай 18, 23, 28 см)',
    })
    @IsNumber()
    diameterCm!: number;

    @ApiProperty({
        example: 3,
        description: 'Висота тарілки в сантиметрах',
    })
    @IsNumber()
    heightCm!: number;

    @ApiProperty({
        example: 0.7,
        description: 'Заповненість тарілки від 0 до 1 (0.5 = половина)',
    })
    @IsNumber()
    fillPercentage!: number;
}

export class AnalyzeMealWithContextDto {
    @ApiProperty({
        description: 'Фото їжі (file upload)',
        type: 'string',
        format: 'binary',
    })
    photo!: Express.Multer.File;

    @ApiProperty({
        description: 'Параметри тарілки',
        type: PlateDimensionsDto,
    })
    @ValidateNested()
    @Type(() => PlateDimensionsDto)
    plateInfo!: PlateDimensionsDto;

    @ApiProperty({
        description: 'Соуси та добавки які додав юзер',
        type: [SauceIngredientDto],
        example: [
            { name: 'сметана', quantity: 1, unit: 'столова ложка' },
            { name: 'майонез', quantity: 1, unit: 'чайна ложка' },
        ],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SauceIngredientDto)
    @IsOptional()
    sauces?: SauceIngredientDto[];

    @ApiProperty({
        description: 'Додаткові замітки юзера (напр. "сніданок", "обід")',
        example: 'Обід, гарячо приготовлене',
        required: false,
    })
    @IsString()
    @IsOptional()
    notes?: string;
}