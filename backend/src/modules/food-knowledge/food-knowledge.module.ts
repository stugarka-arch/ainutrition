import {  Module } from '@nestjs/common';

import { FoodKnowledgeService } from './food-knowledge.service';
import { FoodKnowledgeController } from './food-knowledge.controller';
import { FoodDataCentralService } from './food-data-central.service';

import { PrismaService } from '../../../prisma/prisma.service';
import { FoodAnalysisModule } from '../food-analysis/food-analysis.module';

@Module({
    imports: [FoodAnalysisModule
    ],
    controllers: [FoodKnowledgeController],
    providers: [
        FoodKnowledgeService,
        FoodDataCentralService,
        PrismaService,
    ],
    exports: [
        FoodKnowledgeService,
        FoodDataCentralService,
    ],
})
export class FoodKnowledgeModule { }