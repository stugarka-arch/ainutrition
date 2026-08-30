
import type { ISignIn } from "../interfaces/auth/ISignIn";
import type { ISignUp } from "../interfaces/auth/ISugnUp";
import type { IUser } from "../interfaces/user/IUser";

import { apiService } from "./ApiServices";
import axios from "axios";

type AuthResponse = {
    user: IUser;
};

const authService = {
    async register(userData: ISignUp): Promise<AuthResponse> {
        try {
            const { data } = await apiService.post<AuthResponse>(
                "/auth/register",
                userData,
            );

            return data;
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                const message =
                    error.response?.data?.message ||
                    "Не вдалося зареєструватися";

                throw new Error(
                    Array.isArray(message)
                        ? message.join(", ")
                        : message,
                );
            }

            throw new Error("Помилка зʼєднання з сервером");
        }
    },

    async login(authData: ISignIn): Promise<AuthResponse> {
        console.log('Відправляю:', authData);          // чи взагалі викликається

        try {
            const response = await apiService.post<AuthResponse>(
                "/auth/login",
                authData,
            );

            console.log('Відповідь:', response.data);
            return response.data;
        } catch (error: unknown) {
            console.error('Помилка login:', error);      // що саме падає

            if (axios.isAxiosError(error)) {
                console.log('status:', error.response?.status);
                console.log('data:', error.response?.data);
                // ...
            }

            throw new Error("Помилка зʼєднання з сервером");
        }
    } ,

    async me(): Promise<AuthResponse> {
        try {
            const { data } = await apiService.get<AuthResponse>(
                "/auth/me",
            );

            return data;
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                throw new Error(
                    error.response?.data?.message ||
                    "Не авторизований",
                );
            }

            throw new Error("Помилка зʼєднання з сервером");
        }
    },

    async logout(): Promise<void> {
        await apiService.post("/auth/logout");
    },
};

export { authService };

