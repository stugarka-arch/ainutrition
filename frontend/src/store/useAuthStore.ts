
import { create } from "zustand";

import type { ISignIn } from "../interfaces/auth/ISignIn";
import type { ISignUp } from "../interfaces/auth/ISugnUp";

import { authService } from "../services/AuthService";
import { handleError } from "../utils/handleError";
import type { IUser } from "../interfaces/user/IUser";

type AuthState = {
    user: IUser | null;
    isAuth: boolean;
    isLoading: boolean;
};

type AuthActions = {
    register: (data: ISignUp) => Promise<void>;
    login: (data: ISignIn) => Promise<IUser>;
    me: () => Promise<IUser | null>;
    logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
    user: null,
    isAuth: false,
    isLoading: false,

    register: async (data) => {
        set({ isLoading: true });

        try {
            const { user } = await authService.register(data);

            set({
                user,
                isAuth: true,
            });
        } catch (error) {
            handleError(error, "Не вдалося зареєструватися");
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    login: async (data) => {
        set({ isLoading: true });

        try {
            const { user } = await authService.login(data);
     
            set({
                user:user,
                isAuth: true,
            });

            return user;
        } catch (error) {
            handleError(error, "Не вдалося увійти");
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    me: async () => {
        set({ isLoading: true });

        try {
            const { user } = await authService.me();
            console.log('user store', user);

            set({
                user,
                isAuth: !!user,
            });

            return user;
        } catch (error) {
            set({
                user: null,
                isAuth: false,
            });

            return null;
        } finally {
            set({ isLoading: false });
        }
    },


    logout: async () => {
        set({ isLoading: true });

        try {
            await authService.logout();
        } finally {
            set({
                user: null,
                isAuth: false,
                isLoading: false,
            });
        }
    },
}));

