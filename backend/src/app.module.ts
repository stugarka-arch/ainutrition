import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { FoodAnalysisModule } from './modules/food-analysis/food-analysis.module';
import { UserModule } from './modules/user/user.module';
import { PrismaService } from 'prisma/prisma.service';
import { FoodKnowledgeModule } from './modules/food-knowledge/food-knowledge.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UserModule,
    FoodAnalysisModule,
    FoodKnowledgeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
