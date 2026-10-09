import { Controller, Get, Query } from '@nestjs/common';
import { FoodKnowledgeService } from './food-knowledge.service';

@Controller('food-knowledge')
export class FoodKnowledgeController {
    constructor(
        private readonly foodKnowledge: FoodKnowledgeService,
    ) { }

    @Get('test-create')
    async testCreate(@Query('name') name: string) {
        return this.foodKnowledge.findOrCreateFood(name);
    }

    @Get('test-usda')
    async testUsda(@Query('name') name: string) {
        return this.foodKnowledge.testUsda(name);
    }
}