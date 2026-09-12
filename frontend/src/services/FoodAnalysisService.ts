import axios from "axios";

import { apiService } from "./ApiServices";
import type { IMealAnalysisResult, ISauce } from "../interfaces/meals/IMealAnalysis";
import type { INutritionSummary } from "../interfaces/meals/INutritionSummary";
import type { IDietRecommendation } from "../interfaces/meals/IDietRecommendation";



const foodAnalysisService = {
    async analyzeMeal(
        photo: File | undefined,
        diameterCm: number,
        heightCm: number,
        fillPercentage: number,
        sauces?: ISauce[],
        notes?: string,
    ): Promise<IMealAnalysisResult> {
        const formData = new FormData();

        if (photo) {
            formData.append("photo", photo);
        }

        formData.append(
            "plateInfo",
            JSON.stringify({
                diameterCm,
                heightCm,
                fillPercentage,
            }),
        );

        if (sauces && sauces.length > 0) {
            formData.append(
                "sauces",
                JSON.stringify(sauces),
            );
        }

        if (notes?.trim()) {
            formData.append(
                "notes",
                notes.trim(),
            );
        }

        try {
            const { data } =
                await apiService.post<IMealAnalysisResult>(
                    "/food-analysis/analyze-with-context",
                    formData,
                );

            return data;
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                const message =
                    error.response?.data?.message ||
                    "Не вдалося проаналізувати їжу";

                throw new Error(
                    Array.isArray(message)
                        ? message.join(", ")
                        : message,
                );
            }

            throw new Error(
                "Помилка зʼєднання з сервером",
            );
        }
    },

    async getNutritionSummary(
        startDate?: string,
        endDate?: string,
    ): Promise<INutritionSummary> {
        try {
            const { data } = await apiService.get<INutritionSummary>(
                "/food-analysis/summary",
                {
                    params: {
                        ...(startDate ? { startDate } : {}),
                        ...(endDate ? { endDate } : {}),
                    },
                },
            );

            return data;
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                const message =
                    error.response?.data?.message ||
                    "Не вдалося отримати статистику харчування";

                throw new Error(
                    Array.isArray(message)
                        ? message.join(", ")
                        : message,
                );
            }

            throw new Error("Помилка зʼєднання з сервером");
        }
    },

    async getDietRecommendations(
        startDate: string,
        endDate: string,
    ): Promise<IDietRecommendation> {
        try {
            const { data } = await apiService.post<IDietRecommendation>(
                "/food-analysis/recommendations",
                { startDate, endDate },
            );

            return data;
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                const message =
                    error.response?.data?.message ||
                    "Не вдалося створити рекомендації";

                throw new Error(
                    Array.isArray(message)
                        ? message.join(", ")
                        : message,
                );
            }

            throw new Error("Помилка зʼєднання з сервером");
        }
    },
};

export { foodAnalysisService };
