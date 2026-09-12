import {
    BadRequestException,
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { PasswordResetMailerService } from './password-reset-mailer.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly passwordResetMailer: PasswordResetMailerService,
    ) { }

    async register(email: string, password: string) {
        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (existingUser) {
            throw new ConflictException('User already exists');
        }

        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id,
        });

        const user = await this.prisma.user.create({
            data: {
                email: normalizedEmail,
                passwordHash,
            },
            select: {
                id: true,
                email: true,
                role: true,
            },
        });

        return user;
    }

    async validateUser(email: string, password: string) {
        const normalizedEmail = email.trim().toLowerCase();

        const user = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const validPassword = await argon2.verify(
            user.passwordHash,
            password,
        );

        if (!validPassword) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return user;
    }

    async createSession(userId: string) {
        const token = randomBytes(32).toString('base64url');

        const tokenHash = this.hashToken(token);

        const expiresAt = new Date();

        expiresAt.setDate(
            expiresAt.getDate() + 30,
        );

        await this.prisma.session.create({
            data: {
                tokenHash,
                userId,
                expiresAt,
            },
        });

        return token;
    }

    async getUserBySession(token: string) {
        const tokenHash = this.hashToken(token);

        const session = await this.prisma.session.findUnique({
            where: { tokenHash },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                    },
                },
            },
        });

        if (!session) {
            throw new UnauthorizedException();
        }

        if (session.expiresAt <= new Date()) {
            await this.prisma.session.delete({
                where: { id: session.id },
            });

            throw new UnauthorizedException();
        }

        return session.user;
    }

    async deleteSession(token: string) {
        const tokenHash = this.hashToken(token);

        await this.prisma.session.deleteMany({
            where: { tokenHash },
        });
    }

    async requestPasswordReset(email: string) {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        // Return the same response for every email to prevent account discovery.
        if (!user) return;

        const token = randomBytes(32).toString('base64url');
        const tokenHash = this.hashToken(token);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await this.prisma.passwordResetToken.deleteMany({
            where: { userId: user.id },
        });
        await this.prisma.passwordResetToken.create({
            data: { tokenHash, userId: user.id, expiresAt },
        });

        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
        await this.passwordResetMailer.send(
            user.email,
            `${frontendUrl}/auth?resetToken=${encodeURIComponent(token)}`,
        );
    }

    async resetPassword(token: string, password: string) {
        const tokenHash = this.hashToken(token);
        const passwordResetToken = await this.prisma.passwordResetToken.findUnique({
            where: { tokenHash },
        });

        if (!passwordResetToken || passwordResetToken.expiresAt <= new Date()) {
            if (passwordResetToken) {
                await this.prisma.passwordResetToken.delete({ where: { id: passwordResetToken.id } });
            }
            throw new BadRequestException('Посилання для відновлення пароля недійсне або прострочене');
        }

        const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: passwordResetToken.userId },
                data: { passwordHash },
            }),
            this.prisma.passwordResetToken.deleteMany({
                where: { userId: passwordResetToken.userId },
            }),
            this.prisma.session.deleteMany({
                where: { userId: passwordResetToken.userId },
            }),
        ]);
    }

    private hashToken(token: string) {
        return createHash('sha256')
            .update(token)
            .digest('hex');
    }
}
