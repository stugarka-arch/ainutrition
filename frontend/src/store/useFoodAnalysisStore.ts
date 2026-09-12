import { create } from "zustand";

import { foodAnalysisService } from "../services/FoodAnalysisService";
import type { IMealAnalysisResult, ISauce } from "../interfaces/meals/IMealAnalysis";
import type { INutritionSummary } from "../interfaces/meals/INutritionSummary";
import type { IDietRecommendation } from "../interfaces/meals/IDietRecommendation";



type FoodAnalysisState = {
    result: IMealAnalysisResult | null;
    isLoading: boolean;
    error: string | null;
    summary: INutritionSummary | null;
    isSummaryLoading: boolean;
    summaryError: string | null;
    recommendation: IDietRecommendation | null;
    isRecommendationLoading: boolean;
    recommendationError: string | null;
};

type FoodAnalysisActions = {
    analyzeMeal: (
        photo: File | undefined,
        diameterCm: number,
        heightCm: number,
        fillPercentage: number,
        sauces?: ISauce[],
        notes?: string,
    ) => Promise<IMealAnalysisResult>;

    clearResult: () => void;
    clearError: () => void;
    getNutritionSummary: (
        startDate?: string,
        endDate?: string,
    ) => Promise<INutritionSummary>;
    getDietRecommendations: (
        startDate: string,
        endDate: string,
    ) => Promise<IDietRecommendation>;
};

export const useFoodAnalysisStore =
    create<FoodAnalysisState & FoodAnalysisActions>(
        (set) => ({
            result: null,
            isLoading: false,
            error: null,
            summary: null,
            isSummaryLoading: false,
            summaryError: null,
            recommendation: null,
            isRecommendationLoading: false,
            recommendationError: null,

            analyzeMeal: async (
                photo,
                diameterCm,
                heightCm,
                fillPercentage,
                sauces,
                notes,
            ) => {
                set({
                    isLoading: true,
                    error: null,
                });

                try {
                    const result =
                        await foodAnalysisService.analyzeMeal(
                            photo,
                            diameterCm,
                            heightCm,
                            fillPercentage,
                            sauces,
                            notes,
                        );

                    set({
                        result,
                        isLoading: false,
                    });

                    return result;
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : "Не вдалося проаналізувати їжу";

                    set({
                        error: message,
                        isLoading: false,
                    });

                    throw error;
                }
            },

            clearResult: () => {
                set({
                    result: null,
                    error: null,
                });
            },

            clearError: () => {
                set({
                    error: null,
                });
            },

            getNutritionSummary: async (startDate, endDate) => {
                set({
                    isSummaryLoading: true,
                    summaryError: null,
                });

                try {
                    const summary =
                        await foodAnalysisService.getNutritionSummary(
                            startDate,
                            endDate,
                        );

                    set({
                        summary,
                        isSummaryLoading: false,
                        recommendation: null,
                        recommendationError: null,
                    });
                    return summary;
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : "Не вдалося отримати статистику харчування";

                    set({
                        summaryError: message,
                        isSummaryLoading: false,
                    });
                    throw error;
                }
            },

            getDietRecommendations: async (startDate, endDate) => {
                set({
                    isRecommendationLoading: true,
                    recommendationError: null,
                });

                try {
                    const recommendation =
                        await foodAnalysisService.getDietRecommendations(
                            startDate,
                            endDate,
                        );

                    set({ recommendation, isRecommendationLoading: false });
                    return recommendation;
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : "Не вдалося створити рекомендації";

                    set({
                        recommendationError: message,
                        isRecommendationLoading: false,
                    });
                    throw error;
                }
            },
        }),
    );
