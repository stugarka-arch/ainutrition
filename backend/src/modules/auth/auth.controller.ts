import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AUTH_COOKIE } from './auth.constants';
import { AuthGuard } from './auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) { }

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Creates a user and starts an authenticated session.',
  })
  @ApiBody({
    type: RegisterDto,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User successfully registered.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid email or password.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.authService.register(
      dto.email,
      dto.password,
    );

    const session = await this.authService.createSession(
      user.id,
    );

    this.setSessionCookie(response, session);

    return {
      user,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({
    summary: 'Login',
    description: 'Authenticates a user and creates a session.',
  })
  @ApiBody({
    type: LoginDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully authenticated.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials.',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {

    console.log('authData- back ');
    const user = await this.authService.validateUser(
      dto.email,
      dto.password,
    );

    const session = await this.authService.createSession(
      user.id,
    );

    this.setSessionCookie(response, session);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  //@UseGuards(AuthGuard)
  @Get('me')
  @ApiOperation({
    summary: 'Get current user',
    description: 'Returns the currently authenticated user.',
  })
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current user or null when not authenticated.',
  })
  @ApiUnauthorizedResponse({
    description: 'Session is invalid or expired.',
  })
  async me(@Req() request: Request) {

    const token = request.cookies?.[AUTH_COOKIE];

    if (!token) {
      return {
        user: null,
      };
    }

    const user =
      await this.authService.getUserBySession(token);

    return {
      user,
    };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({
    summary: 'Logout',
    description: 'Deletes the current session and clears the session cookie.',
  })
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Successfully logged out.',
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies?.[AUTH_COOKIE];

    if (token) {
      await this.authService.deleteSession(token);
    }

    response.clearCookie(AUTH_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password-reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { message: 'Якщо такий email зареєстрований, посилання для відновлення вже надіслано.' };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
  }

  private setSessionCookie(
    response: Response,
    token: string,
  ) {
    response.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

