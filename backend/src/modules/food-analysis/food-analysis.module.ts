import {  Module } from '@nestjs/common';
import { FoodAnalysisService } from './food-analysis.service';
import { FoodAnalysisController } from './food-analysis.controller';
import { GeminiVisionService } from './services/gpt-vision.service';
import { MacroCalculatorService } from './services/macro-calculator.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from 'prisma/prisma.service';
import { FoodDataCentralService } from '../food-knowledge/food-data-central.service';
import { FoodKnowledgeService } from '../food-knowledge/food-knowledge.service';

@Module({
  imports: [AuthModule
  ],
  controllers: [FoodAnalysisController],
  providers: [
    FoodAnalysisService,
    GeminiVisionService,
    MacroCalculatorService,
    PrismaService,
    FoodKnowledgeService,
    FoodDataCentralService,
  ],
  exports: [GeminiVisionService],
})
export class FoodAnalysisModule {}
