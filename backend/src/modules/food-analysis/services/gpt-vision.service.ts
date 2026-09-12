import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';

import {
    GoogleGenAI,
    Type,
} from '@google/genai';
import type { DietRecommendationDto } from '../dto/diet-recommendation.dto';
import type { NutritionSummaryDto } from '../dto/nutrition-summary.dto';

export interface FoodAnalysisContext {
    plateDiameterCm: number;
    plateHeightCm: number;
    fillPercentage: number;

    sauces?: Array<{
        name: string;
        quantity: number;
        unit: string;
    }>;

    notes?: string;
}

export type FoodAnalysisResult = {
    mealName: string;

    mealType:
    | 'breakfast'
    | 'lunch'
    | 'dinner'
    | 'snack'
    | 'meal';

    foodItems: Array<{
        name: string;
        estimatedGrams: number;
        confidence: number;
        description: string;
    }>;

    protein: {
        grams: number;
        calories: number;
        percentage: number;
    };

    fat: {
        grams: number;
        calories: number;
        percentage: number;
    };

    carbohydrates: {
        grams: number;
        calories: number;
        percentage: number;
    };

    totalCalories: number;

    microNutrients: Array<{
        name: string;
        value: number;
        unit: string;
        percentageDailyValue: number;
    }>;

    glycemicIndex: number;

    insulinResistanceLevel:
    | 'Низька'
    | 'Середня'
    | 'Висока';

    macroBalance: number;

    insights: string[];

    overallConfidence: number;
};

export type DietRecommendationResult = DietRecommendationDto;

@Injectable()
export class GeminiVisionService {
    private readonly ai: GoogleGenAI;

    private readonly model = 'gemini-3.6-flash';

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error(
                'GEMINI_API_KEY is not configured',
            );
        }

        this.ai = new GoogleGenAI({
            apiKey,
        });
    }

    async analyzeFood(
        imageBuffer: Buffer,
        context: FoodAnalysisContext,
        mimeType = 'image/jpeg',
    ): Promise<FoodAnalysisResult> {
        try {
            const base64Image =
                imageBuffer.toString('base64');

            const prompt =
                this.buildAnalysisPrompt(context);

            const response =
                await this.ai.models.generateContent({
                    model: this.model,

                    contents: [
                        {
                            inlineData: {
                                mimeType,
                                data: base64Image,
                            },
                        },
                        {
                            text: prompt,
                        },
                    ],

                    config: {
                        responseMimeType:
                            'application/json',

                        responseSchema:
                            this.getResponseSchema(),

                        temperature: 0.2,

                        maxOutputTokens: 3000,
                    },
                });

            const text = response.text;

            if (!text) {
                throw new Error(
                    'Gemini returned an empty response',
                );
            }

            return JSON.parse(
                text,
            ) as FoodAnalysisResult;
        } catch (error: unknown) {
            console.error(
                'Gemini Vision error:',
                error,
            );

            if (error instanceof Error) {
                throw new BadRequestException(
                    `Failed to analyze image with Gemini: ${error.message}`,
                );
            }

            throw new BadRequestException(
                'Failed to analyze image with Gemini',
            );
        }
    }

    async analyzeFoodFromDescription(
        context: FoodAnalysisContext,
        description: string,
    ): Promise<FoodAnalysisResult> {
        try {
            const response = await this.ai.models.generateContent({
                model: this.model,
                contents: [{
                    text: this.buildTextAnalysisPrompt(context, description),
                }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: this.getResponseSchema(),
                    temperature: 0.2,
                    maxOutputTokens: 3000,
                },
            });

            if (!response.text) {
                throw new Error('Gemini returned an empty response');
            }

            return JSON.parse(response.text) as FoodAnalysisResult;
        } catch (error: unknown) {
            console.error('Gemini text food analysis error:', error);
            throw new BadRequestException(
                error instanceof Error
                    ? `Failed to analyze food description: ${error.message}`
                    : 'Failed to analyze food description',
            );
        }
    }

    async generateDietRecommendations(
        summary: NutritionSummaryDto,
    ): Promise<DietRecommendationResult> {
        try {
            const response = await this.ai.models.generateContent({
                model: this.model,
                contents: [{ text: this.buildDietRecommendationPrompt(summary) }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: this.getDietRecommendationSchema(),
                    temperature: 0.4,
                    maxOutputTokens: 3000,
                },
            });

            if (!response.text) {
                throw new Error('Gemini returned an empty response');
            }

            return JSON.parse(response.text) as DietRecommendationResult;
        } catch (error: unknown) {
            console.error('Gemini diet recommendation error:', error);
            throw new BadRequestException(
                error instanceof Error
                    ? `Failed to generate recommendations: ${error.message}`
                    : 'Failed to generate recommendations',
            );
        }
    }

    private buildAnalysisPrompt(
        context: FoodAnalysisContext,
    ): string {
        const saucesInfo =
            context.sauces &&
                context.sauces.length > 0
                ? `
КОРИСТУВАЧ ДОДАВ СОУСИ / ДОБАВКИ:

${context.sauces
                    .map(
                        (sauce) =>
                            `- ${sauce.name}: ${sauce.quantity} ${sauce.unit}`,
                    )
                    .join('\n')}

ОБОВ'ЯЗКОВО:
Врахуй ці соуси та добавки у загальній
кількості калорій, білків, жирів та вуглеводів.
`
                : '';

        return `
Ти — AI-асистент для аналізу харчування.

Проаналізуй фотографію їжі та поверни
структурований результат відповідно до JSON schema.

========================
КОНТЕКСТ ТАРІЛКИ
========================

Діаметр тарілки:
${context.plateDiameterCm} см.

Висота / глибина тарілки:
${context.plateHeightCm} см.

Заповненість тарілки:
${(context.fillPercentage * 100).toFixed(0)}%.

ВАЖЛИВО:

Для оцінки кількості їжі ОБОВ'ЯЗКОВО враховуй
всі три параметри:

1. діаметр тарілки;
2. висоту / глибину тарілки;
3. відсоток заповненості.

Висота тарілки особливо важлива для супів,
борщу, каш, салатів та інших продуктів,
які займають значний об'єм по висоті.

Не припускай, що тарілка плоска.

Якщо це глибока тарілка або миска,
враховуй приблизний об'єм її внутрішньої частини.

Не використовуй просту формулу
"діаметр × заповненість".

Оцінюй реальний видимий об'єм їжі
з урахуванням форми тарілки.

========================
ДОДАТКОВА ІНФОРМАЦІЯ
========================

${saucesInfo}

${context.notes
                ? `
ПРИМІТКИ КОРИСТУВАЧА:

${context.notes}
`
                : ''
            }

========================
АНАЛІЗ ФОТОГРАФІЇ
========================

1. Розпізнай УСІ видимі продукти та компоненти їжі.

2. Не вигадуй продукти, яких немає на фотографії.

3. Якщо компонент частково закритий,
   оцінюй його на основі видимої частини
   та зменшуй confidence.

4. Для кожного компонента визнач:

   - назву;
   - приблизну вагу в грамах;
   - confidence;
   - короткий опис.

========================
ОЦІНКА ВАГИ
========================

При оцінці ваги використовуй:

- діаметр тарілки;
- висоту / глибину тарілки;
- відсоток заповненості;
- видимий розмір їжі;
- товщину шару їжі;
- тип продукту;
- щільність продукту;
- консистенцію продукту;
- форму тарілки;
- фотографічну перспективу.

Для рідких або напіврідких продуктів
(борщ, суп, соус, каша тощо)
особливо враховуй висоту шару та глибину тарілки.

Для твердих продуктів
(хліб, м'ясо, овочі тощо)
оцінюй вагу за їхнім видимим об'ємом,
розміром та типовою щільністю.

Якщо точну вагу визначити неможливо,
повертай реалістичну приблизну оцінку.

НЕ видавай оцінку ваги за точне вимірювання.

========================
ХАРЧОВА ЦІННІСТЬ
========================

Для кожного компонента та всієї страви
оціни:

- білки;
- жири;
- вуглеводи;
- калорії.

Загальні макронутрієнти повинні
відповідати сумі компонентів.

Калорійність повинна бути приблизно
узгоджена з кількістю білків, жирів
та вуглеводів.

Орієнтовно:

білки = 4 kcal/г
вуглеводи = 4 kcal/г
жири = 9 kcal/г

========================
МІКРОНУТРІЄНТИ
========================

Вкажи основні мікронутрієнти,
які можна обґрунтовано оцінити:

- вітаміни;
- залізо;
- кальцій;
- магній;
- калій;
- натрій;
- цинк;
- інші значущі нутрієнти.

Не вигадуй надто точні значення,
якщо їх неможливо визначити з фотографії.

========================
ГЛІКЕМІЧНИЙ ІНДЕКС
========================

Оціни глікемічний індекс всієї страви
від 0 до 100.

Враховуй:

- склад продуктів;
- кількість вуглеводів;
- клітковину;
- ступінь обробки;
- поєднання білків, жирів і вуглеводів.

Пам'ятай:

глікемічний індекс страви є приблизною оцінкою,
а не лабораторним вимірюванням.

========================
ІНСУЛІНОРЕЗИСТЕНТНІСТЬ
========================

Оціни харчове навантаження страви
за категоріями:

Низька
Середня
Висока

Це НЕ медичний діагноз.

Це лише оцінка потенційного
метаболічного навантаження їжі.

========================
ТИП ПРИЙОМУ ЇЖІ
========================

Визнач mealType:

breakfast
lunch
dinner
snack
meal

Якщо з приміток користувача очевидно,
що це сніданок, обід або вечеря,
врахуй цю інформацію.

========================
РЕКОМЕНДАЦІЇ
========================

У полі insights дай короткі
практичні рекомендації.

Рекомендації повинні базуватися
на фактичному складі страви.

Не давай медичних рекомендацій.

========================
ПРАВИЛА ТОЧНОСТІ
========================

- Не вигадуй продукти.
- Не вигадуй невидимі інгредієнти.
- Якщо продукт визначити складно —
  використовуй найбільш ймовірний варіант
  та зменшуй confidence.
- Не видавай приблизну вагу за точну.
- Враховуй діаметр тарілки.
- Враховуй висоту / глибину тарілки.
- Враховуй заповненість тарілки.
- Враховуй перспективу фотографії.
- Всі числові значення повинні бути числами.
- confidence від 0 до 1.
- overallConfidence від 0 до 1.
- macroBalance від 0 до 1.
- glycemicIndex від 0 до 100.
- Не використовуй NaN.
- Не використовуй null.
- Поверни ТІЛЬКИ JSON.

========================
КІНЕЦЬ ЗАВДАННЯ
========================
`;
    }

    private buildTextAnalysisPrompt(
        context: FoodAnalysisContext,
        description: string,
    ): string {
        const sauces = context.sauces?.length
            ? context.sauces
                .map(
                    (sauce) =>
                        `${sauce.name}: ${sauce.quantity} ${sauce.unit}`,
                )
                .join(', ')
            : 'немає';

        return `
Ти — AI-асистент для аналізу харчування. Проаналізуй опис або рецепт страви й поверни ТІЛЬКИ JSON відповідно до наданої schema.
Не вигадуй інгредієнти, яких немає в описі; за відсутності ваги використовуй обережну типову порцію і вкажи це у description продукту.

ОПИС АБО РЕЦЕПТ КОРИСТУВАЧА:
${description}

КОНТЕКСТ ПОРЦІЇ: тарілка ${context.plateDiameterCm} см, висота ${context.plateHeightCm} см, заповненість ${(context.fillPercentage * 100).toFixed(0)}%.
ДОДАТКИ: ${sauces}.
`;
    }

    private buildDietRecommendationPrompt(
        summary: NutritionSummaryDto,
    ): string {
        return `
Ти — помічник з планування раціону. Відповідай лише українською мовою.
На основі нижче наведених ФАКТИЧНИХ даних склади практичні рекомендації та меню на наступний день.
Не давай медичних діагнозів, не вигадуй алергій і не радь екстремальні дієти.
Цілі користувача є добовими; якщо аналізований період довший за добу, оціни середнє за день.
Меню має містити 3–4 реалістичні страви, які разом наближені до добових цілей. Для кожної дай короткий рецепт, інгредієнти та приблизні калорії.
Поверни ТІЛЬКИ JSON згідно зі схемою.

ДАНІ РАЦІОНУ:
${JSON.stringify(summary)}
`;
    }

    private getDietRecommendationSchema() {
        return {
            type: Type.OBJECT,
            properties: {
                summary: { type: Type.STRING },
                recommendations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                },
                tomorrowTargets: {
                    type: Type.OBJECT,
                    properties: {
                        calories: { type: Type.NUMBER },
                        protein: { type: Type.NUMBER },
                        fat: { type: Type.NUMBER },
                        carbohydrates: { type: Type.NUMBER },
                    },
                    required: ['calories', 'protein', 'fat', 'carbohydrates'],
                },
                tomorrowMenu: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            mealType: { type: Type.STRING },
                            name: { type: Type.STRING },
                            description: { type: Type.STRING },
                            ingredients: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            calories: { type: Type.NUMBER },
                            recipe: { type: Type.STRING },
                        },
                        required: [
                            'mealType',
                            'name',
                            'description',
                            'ingredients',
                            'calories',
                            'recipe',
                        ],
                    },
                },
            },
            required: [
                'summary',
                'recommendations',
                'tomorrowTargets',
                'tomorrowMenu',
            ],
        };
    }

    private getResponseSchema() {
        return {
            type: Type.OBJECT,

            properties: {
                mealName: {
                    type: Type.STRING,
                },

                mealType: {
                    type: Type.STRING,
                    enum: [
                        'breakfast',
                        'lunch',
                        'dinner',
                        'snack',
                        'meal',
                    ],
                },

                foodItems: {
                    type: Type.ARRAY,

                    items: {
                        type: Type.OBJECT,

                        properties: {
                            name: {
                                type: Type.STRING,
                            },

                            estimatedGrams: {
                                type: Type.NUMBER,
                            },

                            confidence: {
                                type: Type.NUMBER,
                            },

                            description: {
                                type: Type.STRING,
                            },
                        },

                        required: [
                            'name',
                            'estimatedGrams',
                            'confidence',
                            'description',
                        ],
                    },
                },

                protein: {
                    type: Type.OBJECT,

                    properties: {
                        grams: {
                            type: Type.NUMBER,
                        },

                        calories: {
                            type: Type.NUMBER,
                        },

                        percentage: {
                            type: Type.NUMBER,
                        },
                    },

                    required: [
                        'grams',
                        'calories',
                        'percentage',
                    ],
                },

                fat: {
                    type: Type.OBJECT,

                    properties: {
                        grams: {
                            type: Type.NUMBER,
                        },

                        calories: {
                            type: Type.NUMBER,
                        },

                        percentage: {
                            type: Type.NUMBER,
                        },
                    },

                    required: [
                        'grams',
                        'calories',
                        'percentage',
                    ],
                },

                carbohydrates: {
                    type: Type.OBJECT,

                    properties: {
                        grams: {
                            type: Type.NUMBER,
                        },

                        calories: {
                            type: Type.NUMBER,
                        },

                        percentage: {
                            type: Type.NUMBER,
                        },
                    },

                    required: [
                        'grams',
                        'calories',
                        'percentage',
                    ],
                },

                totalCalories: {
                    type: Type.NUMBER,
                },

                microNutrients: {
                    type: Type.ARRAY,

                    items: {
                        type: Type.OBJECT,

                        properties: {
                            name: {
                                type: Type.STRING,
                            },

                            value: {
                                type: Type.NUMBER,
                            },

                            unit: {
                                type: Type.STRING,
                            },

                            percentageDailyValue: {
                                type: Type.NUMBER,
                            },
                        },

                        required: [
                            'name',
                            'value',
                            'unit',
                            'percentageDailyValue',
                        ],
                    },
                },

                glycemicIndex: {
                    type: Type.NUMBER,
                },

                insulinResistanceLevel: {
                    type: Type.STRING,
                    enum: [
                        'Низька',
                        'Середня',
                        'Висока',
                    ],
                },

                macroBalance: {
                    type: Type.NUMBER,
                },

                insights: {
                    type: Type.ARRAY,

                    items: {
                        type: Type.STRING,
                    },
                },

                overallConfidence: {
                    type: Type.NUMBER,
                },
            },

            required: [
                'mealName',
                'mealType',
                'foodItems',
                'protein',
                'fat',
                'carbohydrates',
                'totalCalories',
                'microNutrients',
                'glycemicIndex',
                'insulinResistanceLevel',
                'macroBalance',
                'insights',
                'overallConfidence',
            ],
        };
    }
}
