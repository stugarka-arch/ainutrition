import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from 'prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { PasswordResetMailerService } from './password-reset-mailer.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PrismaService, PasswordResetMailerService],
  exports: [AuthService],
})
export class AuthModule {}
