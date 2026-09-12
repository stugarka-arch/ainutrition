import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { AUTH_COOKIE } from './auth.constants';

interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly authService: AuthService,
    ) { }

    async canActivate(
        context: ExecutionContext,
    ): Promise<boolean> {
        const req =
            context.switchToHttp().getRequest<AuthRequest>();

        const token = req.cookies?.[AUTH_COOKIE];

        if (!token) {
            throw new UnauthorizedException();
        }

        const user =
            await this.authService.getUserBySession(token);

        req.user = user;

        return true;
    }
}