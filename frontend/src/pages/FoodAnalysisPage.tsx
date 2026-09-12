import { useState } from "react";
import { useForm } from "react-hook-form";

import { useFoodAnalysisStore } from "../store/useFoodAnalysisStore";
import type {
    IAnalyzeMealForm,
    ISauce,
} from "../interfaces/meals/IMealAnalysis";

import "./FoodAnalysisPage.scss";

export default function FoodAnalysisPage() {
    const {
        result,
        isLoading,
        error,
        analyzeMeal,
        clearResult,
    } = useFoodAnalysisStore();

    const [sauces, setSauces] = useState<ISauce[]>([]);

    const {
        register,
        handleSubmit,
        reset,
    } = useForm<IAnalyzeMealForm>({
        defaultValues: {
            diameterCm: 23,
            heightCm: 3,
            fillPercentage: 0.7,
            notes: "",
        },
    });

    const onSubmit = async (
        data: IAnalyzeMealForm,
    ) => {
        const photo = data.photo?.[0];

        if (!photo && !data.notes?.trim()) {
            return;
        }

        await analyzeMeal(
            photo,
            Number(data.diameterCm),
            Number(data.heightCm),
            Number(data.fillPercentage),
            sauces,
            data.notes,
        );
    };

    const addSourCream = () => {
        setSauces((current) => [
            ...current,
            {
                name: "сметана",
                quantity: 1,
                unit: "столова ложка",
            },
        ]);
    };

    const removeSauce = (index: number) => {
        setSauces((current) =>
            current.filter(
                (_, sauceIndex) =>
                    sauceIndex !== index,
            ),
        );
    };

    const handleNewAnalysis = () => {
        clearResult();
        setSauces([]);
        reset();
    };

    return (
        <main className="food-analysis">

            {!result ? (
                <section className="analysis-card">
                    <div className="analysis-header">
                        <h1>Аналіз їжі</h1>

                        <p>
                            Завантажте фото страви або
                            опишіть її текстом, щоб отримати оцінку
                            калорійності та
                            поживності.
                        </p>
                    </div>

                    <form
                        className="analysis-form"
                        onSubmit={handleSubmit(
                            onSubmit,
                        )}
                    >
                        <div className="form-group">
                            <label htmlFor="photo">
                                Фото їжі (необов'язково)
                            </label>

                            <input
                                id="photo"
                                type="file"
                                accept="image/*"
                                {...register(
                                    "photo",
                                    {},
                                )}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="diameterCm">
                                    Діаметр тарілки, см
                                </label>

                                <input
                                    id="diameterCm"
                                    type="number"
                                    min={10}
                                    max={35}
                                    step={0.1}
                                    {...register(
                                        "diameterCm",
                                        {
                                            required: true,
                                            valueAsNumber:
                                                true,
                                        },
                                    )}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="heightCm">
                                    Висота / глибина тарілки, см
                                </label>

                                <input
                                    id="heightCm"
                                    type="number"
                                    min={1}
                                    max={15}
                                    step={0.1}
                                    {...register(
                                        "heightCm",
                                        {
                                            required: true,
                                            valueAsNumber:
                                                true,
                                        },
                                    )}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="fillPercentage">
                                Заповненість тарілки
                            </label>

                            <input
                                id="fillPercentage"
                                type="number"
                                min={0}
                                max={1}
                                step={0.1}
                                {...register(
                                    "fillPercentage",
                                    {
                                        required: true,
                                        valueAsNumber:
                                            true,
                                    },
                                )}
                            />

                            <small>
                                Наприклад: 0.5 = половина,
                                0.7 = 70%, 1 = повна
                            </small>
                        </div>

                        <div className="form-group">
                            <label>
                                Соуси / добавки
                            </label>

                            {sauces.length > 0 && (
                                <div className="sauce-list">
                                    {sauces.map(
                                        (
                                            sauce,
                                            index,
                                        ) => (
                                            <div
                                                className="sauce-item"
                                                key={`${sauce.name}-${index}`}
                                            >
                                                <span>
                                                    {
                                                        sauce.name
                                                    }{" "}
                                                    —{" "}
                                                    {
                                                        sauce.quantity
                                                    }{" "}
                                                    {
                                                        sauce.unit
                                                    }
                                                </span>

                                                <button
                                                    className="button button-danger button-small"
                                                    type="button"
                                                    onClick={() =>
                                                        removeSauce(
                                                            index,
                                                        )
                                                    }
                                                >
                                                    Видалити
                                                </button>
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}

                            <button
                                className="button button-secondary"
                                type="button"
                                onClick={
                                    addSourCream
                                }
                            >
                                + Додати сметану
                            </button>
                        </div>

                        <div className="form-group">
                            <label htmlFor="notes">
                                Опис страви або рецепт
                            </label>

                            <textarea
                                id="notes"
                                {...register(
                                    "notes",
                                )}
                                placeholder="Без фото: опишіть страву, інгредієнти та порцію або вставте рецепт"
                                rows={4}
                            />
                        </div>

                        {error && (
                            <div className="error-message">
                                {error}
                            </div>
                        )}

                        <button
                            className="button button-primary button-submit"
                            type="submit"
                            disabled={isLoading}
                        >
                            {isLoading
                                ? "Аналізую..."
                                : "Проаналізувати"}
                        </button>
                    </form>
                </section>
            ) : (
                <section className="result-card">
                    <div className="result-header">
                        <div>
                            <span className="result-type">
                                {result.mealType}
                            </span>

                            <h1>
                                {result.mealName}
                            </h1>
                        </div>

                        <div className="calories">
                            <strong>
                                {
                                    result.totalCalories
                                }
                            </strong>

                            <span>
                                kcal
                            </span>
                        </div>
                    </div>

                    <div className="macros">
                        <div className="macro-card">
                            <span>
                                Білки
                            </span>

                            <strong>
                                {
                                    result
                                        .protein
                                        .grams
                                }{" "}
                                г
                            </strong>

                            <small>
                                {
                                    result
                                        .protein
                                        .calories
                                }{" "}
                                kcal
                            </small>
                        </div>

                        <div className="macro-card">
                            <span>
                                Жири
                            </span>

                            <strong>
                                {
                                    result.fat
                                        .grams
                                }{" "}
                                г
                            </strong>

                            <small>
                                {
                                    result.fat
                                        .calories
                                }{" "}
                                kcal
                            </small>
                        </div>

                        <div className="macro-card">
                            <span>
                                Вуглеводи
                            </span>

                            <strong>
                                {
                                    result
                                        .carbohydrates
                                        .grams
                                }{" "}
                                г
                            </strong>

                            <small>
                                {
                                    result
                                        .carbohydrates
                                        .calories
                                }{" "}
                                kcal
                            </small>
                        </div>
                    </div>

                    <div className="result-section">
                        <h2>
                            Склад страви
                        </h2>

                        <div className="food-list">
                            {result.foodItems.map(
                                (item) => (
                                    <div
                                        className="food-item"
                                        key={item.name}
                                    >
                                        <div className="food-item-main">
                                            <strong>
                                                {
                                                    item.name
                                                }
                                            </strong>

                                            <span>
                                                {
                                                    item.estimatedGrams
                                                }{" "}
                                                г
                                            </span>
                                        </div>

                                        <p>
                                            {
                                                item.description
                                            }
                                        </p>

                                        <div className="confidence">
                                            Впевненість:{" "}
                                            {Math.round(
                                                item.confidence *
                                                100,
                                            )}
                                            %
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>

                    <div className="result-section">
                        <h2>
                            Додаткові показники
                        </h2>

                        <div className="stats-grid">
                            <div className="stat">
                                <span>
                                    Глікемічний
                                    індекс
                                </span>

                                <strong>
                                    {
                                        result.glycemicIndex
                                    }
                                </strong>
                            </div>

                            <div className="stat">
                                <span>
                                    Вплив на
                                    інсулін
                                </span>

                                <strong>
                                    {
                                        result.insulinResistanceLevel
                                    }
                                </strong>
                            </div>

                            <div className="stat">
                                <span>
                                    Баланс
                                    макросів
                                </span>

                                <strong>
                                    {Math.round(
                                        result.macroBalance *
                                        100,
                                    )}
                                    %
                                </strong>
                            </div>

                            <div className="stat">
                                <span>
                                    Впевненість
                                </span>

                                <strong>
                                    {Math.round(
                                        result.overallConfidence *
                                        100,
                                    )}
                                    %
                                </strong>
                            </div>
                        </div>
                    </div>

                    {result.microNutrients
                        .length > 0 && (
                            <div className="result-section">
                                <h2>
                                    Мікронутрієнти
                                </h2>

                                <div className="micro-list">
                                    {result.microNutrients.map(
                                        (item) => (
                                            <div
                                                className="micro-item"
                                                key={
                                                    item.name
                                                }
                                            >
                                                <span>
                                                    {
                                                        item.name
                                                    }
                                                </span>

                                                <strong>
                                                    {
                                                        item.value
                                                    }{" "}
                                                    {
                                                        item.unit
                                                    }
                                                </strong>

                                                <small>
                                                    {
                                                        item.percentageDailyValue
                                                    }
                                                    % від
                                                    добової
                                                    норми
                                                </small>
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>
                        )}

                    <div className="result-section">
                        <h2>
                            Рекомендації
                        </h2>

                        <div className="insights">
                            {result.insights.map(
                                (insight) => (
                                    <div
                                        className="insight"
                                        key={
                                            insight
                                        }
                                    >
                                        {insight}
                                    </div>
                                ),
                            )}
                        </div>
                    </div>

                    <button
                        className="button button-primary new-analysis"
                        type="button"
                        onClick={
                            handleNewAnalysis
                        }
                    >
                        Новий аналіз
                    </button>
                </section>
            )}
        </main>
    );
}
