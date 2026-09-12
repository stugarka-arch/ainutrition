import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AUTH_COOKIE } from './modules/auth/auth.constants';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'http://localhost:5173', // ← порт твого фронту (Vite зазвичай 5173)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger конфігурація
  const config = new DocumentBuilder()
    .setTitle('AI NUTRITION API')
    .setDescription('Description Project')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(AUTH_COOKIE)
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || 'localhost';

  await app.listen(port, () => {
    Logger.log(`🚀 Server running on http://${host}:${port}`, 'Bootstrap');
    Logger.log(
      `📚 Swagger documentation: http://${host}:${port}/api`,
      'Bootstrap',
    );
  });
}
bootstrap().catch(console.error);
