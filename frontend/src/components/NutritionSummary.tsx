import { useEffect, useState } from "react";

import { useFoodAnalysisStore } from "../store/useFoodAnalysisStore";

import "./NutritionSummary.scss";

const getLocalDate = () => {
    const date = new Date();
    const offsetDate = new Date(
        date.getTime() - date.getTimezoneOffset() * 60_000,
    );

    return offsetDate.toISOString().slice(0, 10);
};

const today = getLocalDate();

const nutrients = [
    { key: "calories", label: "Калорії", unit: "ккал" },
    { key: "protein", label: "Білки", unit: "г" },
    { key: "fat", label: "Жири", unit: "г" },
    { key: "carbohydrates", label: "Вуглеводи", unit: "г" },
] as const;

export default function NutritionSummary() {
    const {
        summary,
        isSummaryLoading,
        summaryError,
        getNutritionSummary,
        recommendation,
        isRecommendationLoading,
        recommendationError,
        getDietRecommendations,
    } = useFoodAnalysisStore();
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);

    useEffect(() => {
        void getNutritionSummary(today, today).catch(() => undefined);
    }, [getNutritionSummary]);

    const loadSummary = () => {
        if (endDate < startDate) {
            return;
        }

        void getNutritionSummary(startDate, endDate).catch(() => undefined);
    };

    const loadRecommendations = () => {
        void getDietRecommendations(startDate, endDate).catch(() => undefined);
    };

    return (
        <section className="nutrition-summary" aria-labelledby="nutrition-summary-title">
            <div className="nutrition-summary__header">
                <div>
                    <h2 id="nutrition-summary-title">Мій раціон</h2>
                    <p>Фактичне споживання та прогрес щодо ваших добових цілей.</p>
                </div>

                <div className="nutrition-summary__filters">
                    <label>
                        Від
                        <input
                            type="date"
                            value={startDate}
                            max={endDate}
                            onChange={(event) => setStartDate(event.target.value)}
                        />
                    </label>
                    <label>
                        До
                        <input
                            type="date"
                            value={endDate}
                            min={startDate}
                            max={today}
                            onChange={(event) => setEndDate(event.target.value)}
                        />
                    </label>
                    <button className="button button-secondary" type="button" onClick={loadSummary}>
                        Оновити
                    </button>
                </div>
            </div>

            {isSummaryLoading && <p className="nutrition-summary__status">Завантаження статистики…</p>}
            {summaryError && <p className="nutrition-summary__error">{summaryError}</p>}

            {summary && !isSummaryLoading && (
                <>
                    <p className="nutrition-summary__period">
                        {summary.startDate} — {summary.endDate} · {summary.mealsCount} прийом(ів) їжі
                    </p>

                    <div className="nutrition-summary__goals">
                        {nutrients.map(({ key, label, unit }) => {
                            const value = summary.totals[key];
                            const goal = summary.goals[key];
                            const progress = goal === 0 ? 0 : Math.min((value / goal) * 100, 100);

                            return (
                                <article className="nutrition-summary__goal" key={key}>
                                    <div>
                                        <span>{label}</span>
                                        <strong>{Math.round(value)} / {goal} {unit}</strong>
                                    </div>
                                    <div className="nutrition-summary__progress" aria-label={`${label}: ${Math.round(progress)}%`}>
                                        <span style={{ width: `${progress}%` }} />
                                    </div>
                                    <small>{Math.round((value / goal) * 100)}% цілі</small>
                                </article>
                            );
                        })}
                    </div>

                    <div className="nutrition-summary__extra">
                        <span>Клітковина: <strong>{Math.round(summary.totals.fiber)} г</strong></span>
                        <span>Цукор: <strong>{Math.round(summary.totals.sugar)} г</strong></span>
                        <span>Натрій: <strong>{Math.round(summary.totals.sodium)} мг</strong></span>
                    </div>

                    <button
                        className="button button-primary nutrition-summary__recommend-button"
                        type="button"
                        disabled={isRecommendationLoading}
                        onClick={loadRecommendations}
                    >
                        {isRecommendationLoading
                            ? "Аналізуємо раціон…"
                            : "Проаналізувати раціон і додати рекомендації"}
                    </button>

                    {recommendationError && (
                        <p className="nutrition-summary__error">
                            {recommendationError}
                        </p>
                    )}

                    {recommendation && (
                        <section className="nutrition-summary__recommendations">
                            <h3>Рекомендації на завтра</h3>
                            <p>{recommendation.summary}</p>

                            <div className="nutrition-summary__tomorrow-targets">
                                <span>{Math.round(recommendation.tomorrowTargets.calories)} ккал</span>
                                <span>Б: {Math.round(recommendation.tomorrowTargets.protein)} г</span>
                                <span>Ж: {Math.round(recommendation.tomorrowTargets.fat)} г</span>
                                <span>В: {Math.round(recommendation.tomorrowTargets.carbohydrates)} г</span>
                            </div>

                            <ul className="nutrition-summary__tips">
                                {recommendation.recommendations.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>

                            <div className="nutrition-summary__menu">
                                {recommendation.tomorrowMenu.map((item) => (
                                    <article key={`${item.mealType}-${item.name}`}>
                                        <div>
                                            <span>{item.mealType}</span>
                                            <strong>{item.name}</strong>
                                            <small>{Math.round(item.calories)} ккал</small>
                                        </div>
                                        <p>{item.description}</p>
                                        <p><b>Інгредієнти:</b> {item.ingredients.join(", ")}</p>
                                        <p><b>Рецепт:</b> {item.recipe}</p>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}

                    {summary.days === 1 && (
                        <div className="nutrition-summary__meals">
                            <h3>Страви за день</h3>
                            {summary.meals.length > 0 ? (
                                <ul>
                                    {summary.meals.map((meal) => (
                                        <li key={meal.id}>
                                            <span>{meal.mealName}</span>
                                            <strong>{Math.round(meal.calories)} ккал</strong>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>За цей день ще немає проаналізованих страв.</p>
                            )}
                        </div>
                    )}

                    {summary.micronutrients.length > 0 && (
                        <div className="nutrition-summary__micros">
                            <h3>Мікронутрієнти</h3>
                            <div>
                                {summary.micronutrients.map((nutrient) => (
                                    <span key={`${nutrient.name}-${nutrient.unit}`}>
                                        {nutrient.name}: <strong>{nutrient.value} {nutrient.unit}</strong>
                                        {nutrient.percentageDailyValue !== null && ` (${Math.round(nutrient.percentageDailyValue)}%)`}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
