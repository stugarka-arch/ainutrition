import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  FileInterceptor,
} from '@nestjs/platform-express';

import { memoryStorage } from 'multer';

import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuthGuard } from '../auth/auth.guard';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { FoodAnalysisService } from './food-analysis.service';

import { MealAnalysisResultDto } from './dto/meal-analysis-result.dto';
import {
  NutritionSummaryDto,
  NutritionSummaryQueryDto,
} from './dto/nutrition-summary.dto';
import { DietRecommendationDto } from './dto/diet-recommendation.dto';

import {
  PlateDimensionsDto,
  SauceIngredientDto,
} from './dto/analyze-meal-with-context.dto';

@ApiTags('Food Analysis')
@Controller('food-analysis')
@UseGuards(AuthGuard)
export class FoodAnalysisController {
  constructor(
    private readonly foodAnalysis: FoodAnalysisService,
  ) { }

  // Отримує харчову статистику користувача за вказаний день або період.
  @Get('summary')
  @ApiOperation({
    summary: 'Get nutrition summary for a day or date range',
  })
  @ApiResponse({
    status: 200,
    description: 'Nutrient totals, micronutrients, daily breakdown and goals.',
    type: NutritionSummaryDto,
  })
  async getNutritionSummary(
    @CurrentUser() user: { id: string },
    @Query() query: NutritionSummaryQueryDto,
  ): Promise<NutritionSummaryDto> {
    return this.foodAnalysis.getNutritionSummary(
      user.id,
      query.startDate,
      query.endDate,
    );
  }

  // Генерує персональні рекомендації та меню на наступний день.
  @Post('recommendations')
  @ApiOperation({
    summary: 'Generate personalized recommendations and tomorrow menu',
  })
  @ApiResponse({
    status: 200,
    type: DietRecommendationDto,
  })
  async getDietRecommendations(
    @CurrentUser() user: { id: string },
    @Body() query: NutritionSummaryQueryDto,
  ): Promise<DietRecommendationDto> {
    return this.foodAnalysis.getDietRecommendations(
      user.id,
      query.startDate,
      query.endDate,
    );
  }

  // Приймає фото їжі та додатковий контекст, перевіряє дані й передає їх у сервіс для AI-аналізу.
  @Post('analyze-with-context')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
    }),
  )
  @ApiOperation({
    summary:
      'Analyze food photo with context',

    description:
      'Upload food photo + plate dimensions + sauces + notes and get detailed nutritional analysis',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',

      properties: {
        photo: {
          type: 'string',
          format: 'binary',
          description:
            'Optional food image (JPEG/PNG, max 10MB)',
        },

        plateInfo: {
          type: 'string',
          example:
            '{"diameterCm":23,"heightCm":3,"fillPercentage":0.7}',

          description:
            'Plate dimensions and fill percentage as JSON string',
        },

        sauces: {
          type: 'string',

          example:
            '[{"name":"сметана","quantity":1,"unit":"столова ложка"}]',

          description:
            'Optional sauces/additions as JSON string',
        },

        notes: {
          type: 'string',

          example:
            'Обід, гаряче приготовлене',

          description:
            'Food description or recipe. Required when no photo is attached.',
        },
      },

      required: ['plateInfo'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Analysis complete',
    type: MealAnalysisResultDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid file or parameters',
  })
  async analyzeFoodWithContext(
    @CurrentUser() user: any,

    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize:
              10 *
              1024 *
              1024,
          }),

          new FileTypeValidator({
            fileType:
              /^image\/(jpeg|png|webp|jpg)$/,
          }),
        ],

        fileIsRequired: false,
      }),
    )
    photo: Express.Multer.File | undefined,

    @Body() body: any,
  ): Promise<MealAnalysisResultDto> {
    let plateInfo: PlateDimensionsDto;

    let sauces:
      | SauceIngredientDto[]
      | undefined;

    const notes =
      typeof body.notes === 'string'
        ? body.notes.trim()
        : undefined;

    if (!photo && !notes) {
      throw new BadRequestException(
        'Attach a photo or provide a food description/recipe in notes',
      );
    }

    /*
     * plateInfo приходить через multipart/form-data
     * як STRING, тому його потрібно JSON.parse().
     */
    try {
      if (
        typeof body.plateInfo !==
        'string'
      ) {
        throw new BadRequestException(
          'plateInfo is required',
        );
      }

      plateInfo = JSON.parse(
        body.plateInfo,
      );

      /*
       * sauces також приходить STRING.
       */
      if (
        body.sauces &&
        typeof body.sauces === 'string'
      ) {
        sauces = JSON.parse(
          body.sauces,
        );
      }
    } catch {
      throw new BadRequestException(
        'Invalid JSON in request body',
      );
    }

    /*
     * Перевірка plateInfo.
     */
    if (
      typeof plateInfo.diameterCm !==
      'number'
    ) {
      throw new BadRequestException(
        'plateInfo.diameterCm must be a number',
      );
    }

    if (
      typeof plateInfo.heightCm !==
      'number'
    ) {
      throw new BadRequestException(
        'plateInfo.heightCm must be a number',
      );
    }

    if (
      typeof plateInfo.fillPercentage !==
      'number'
    ) {
      throw new BadRequestException(
        'plateInfo.fillPercentage must be a number',
      );
    }

    /*
     * Діаметр тарілки.
     */
    if (
      plateInfo.diameterCm < 10 ||
      plateInfo.diameterCm > 35
    ) {
      throw new BadRequestException(
        'Plate diameter must be between 10 and 35 cm',
      );
    }

    /*
     * Висота / глибина тарілки.
     */
    if (
      plateInfo.heightCm < 1 ||
      plateInfo.heightCm > 15
    ) {
      throw new BadRequestException(
        'Plate height must be between 1 and 15 cm',
      );
    }

    /*
     * Заповненість.
     */
    if (
      plateInfo.fillPercentage < 0 ||
      plateInfo.fillPercentage > 1
    ) {
      throw new BadRequestException(
        'Fill percentage must be between 0 and 1',
      );
    }

    /*
     * sauces повинні бути масивом.
     */
    if (
      sauces !== undefined &&
      !Array.isArray(sauces)
    ) {
      throw new BadRequestException(
        'sauces must be an array',
      );
    }

    /*
     * Передаємо все в сервіс.
     *
     * user.id визначає власника Meal.
     */
    return this.foodAnalysis.analyzeMealWithContext(
      user.id,

      photo?.buffer,

      plateInfo.diameterCm,

      plateInfo.heightCm,

      plateInfo.fillPercentage,

      sauces,

      notes,

      photo?.mimetype,
    );
  }
}
