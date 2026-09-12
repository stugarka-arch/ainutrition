import {
    createParamDecorator,
    ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

export type AuthUser = {
    id: string;
    email: string;
    role: string;
};

type AuthRequest = Request & {
    user?: AuthUser;
};

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): AuthUser | undefined => {
        const request = context
            .switchToHttp()
            .getRequest<AuthRequest>();

        return request.user;
    },
);