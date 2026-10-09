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
        aliasesUk: string[];
        aliasesEn: string[];
        estimatedGrams: number;
        confidence: number;
        description: string;
        protein: number;
        fat: number;
        carbohydrates: number;
        calories: number;
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

    fiber: number;
    sugar: number;
    sodium: number;

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

export type DietRecommendationResult =
    DietRecommendationDto;

@Injectable()
export class GeminiVisionService {
    private readonly aiClients: GoogleGenAI[] = [];

    private readonly model = 'gemini-flash-lite-latest';

    /**
     * Index of the key currently used as the first choice.
     */
    private currentKeyIndex = 0;

    /**
     * Keys that are temporarily unavailable.
     *
     * A key is blocked only for the current backend process.
     * Restarting the backend clears this state.
     */
    private readonly blockedKeys = new Set<number>();

    constructor() {
        const apiKeys = [
            process.env.GEMINI_API_KEY,
            process.env.GEMINI_API_KEY_2,
        ].filter(
            (key): key is string =>
                Boolean(key && key.trim()),
        );

        if (apiKeys.length === 0) {
            throw new Error(
                'At least one GEMINI_API_KEY is required',
            );
        }

        this.aiClients = apiKeys.map(
            (apiKey) =>
                new GoogleGenAI({
                    apiKey,
                }),
        );

        console.log(
            `Gemini initialized with ${this.aiClients.length} API key(s).`,
        );
    }

    /**
     * Executes a Gemini request and automatically switches
     * to another API key when the current key becomes unavailable.
     *
     * Each available key is tried at most once for one request.
     */
    private async generateContentWithFailover<T>(
        requestBuilder: (client: GoogleGenAI) => Promise<T>,
    ): Promise<T> {
        if (this.aiClients.length === 0) {
            throw new BadRequestException(
                'Gemini API ключі не налаштовані.',
            );
        }

        const max503Retries = 3;
        const delays = [2000, 5000, 10000];

        for (let keyAttempt = 0; keyAttempt < this.aiClients.length; keyAttempt++) {
            const keyIndex =
                (this.currentKeyIndex + keyAttempt) %
                this.aiClients.length;

            const client = this.aiClients[keyIndex];

            if (this.blockedKeys.has(keyIndex)) {
                console.log(
                    `GEMINI: API key #${keyIndex + 1} skipped because it is blocked.`,
                );
                continue;
            }

            console.log(`GEMINI: using API key #${keyIndex + 1}`);

            for (let retry = 0; retry <= max503Retries; retry++) {
                try {
                    const result = await requestBuilder(client);

                    this.currentKeyIndex =
                        (keyIndex + 1) % this.aiClients.length;

                    return result;
                } catch (error: unknown) {
                    const errorInfo = this.getGeminiErrorInfo(error);

                    console.error(
                        `GEMINI API key #${keyIndex + 1} failed:`,
                        errorInfo,
                    );

                    // 503 = тимчасова недоступність Gemini.
                    // Не блокуємо ключ, а повторюємо запит.
                    if (errorInfo.is503) {
                        if (retry < max503Retries) {
                            const delay = delays[retry];

                            console.warn(
                                `GEMINI: key #${keyIndex + 1} returned 503. ` +
                                `Retry ${retry + 1}/${max503Retries} in ${delay} ms...`,
                            );

                            await new Promise((resolve) =>
                                setTimeout(resolve, delay),
                            );

                            continue;
                        }

                        console.warn(
                            `GEMINI: key #${keyIndex + 1} still unavailable after retries.`,
                        );

                        break;
                    }

                    // 429 / 401 / 403 — проблема саме з ключем,
                    // квотою або доступом. Переходимо до наступного ключа.
                    if (errorInfo.shouldSwitchKey) {
                        this.blockedKeys.add(keyIndex);

                        console.warn(
                            `GEMINI: API key #${keyIndex + 1} blocked for current backend process.`,
                        );

                        break;
                    }

                    // Інші помилки не маскуємо.
                    throw error;
                }
            }
        }

        throw new BadRequestException(
            'Gemini API тимчасово недоступний. Спробуйте ще раз через кілька секунд.',
        );
    }

    /**
     * Finds the next key that has not been attempted
     * for the current request and is not blocked.
     */
    private getNextAvailableKeyIndex(
        attemptedKeys: Set<number>,
    ): number | null {
        for (
            let offset = 0;
            offset < this.aiClients.length;
            offset++
        ) {
            const index =
                (this.currentKeyIndex + offset) %
                this.aiClients.length;

            if (
                attemptedKeys.has(index) ||
                this.blockedKeys.has(index)
            ) {
                continue;
            }

            this.currentKeyIndex = index;

            return index;
        }

        return null;
    }

    /**
     * Determines whether the error means that another
     * API key should be tried.
     */
    private shouldSwitchKey(
        errorInfo: {
            message: string;
            code: string;
            status: string;
        },
    ): boolean {
        const combined =
            `${errorInfo.code} ${errorInfo.status} ${errorInfo.message}`
                .toUpperCase();

        return (
            combined.includes('429') ||
            combined.includes('RESOURCE_EXHAUSTED') ||
            combined.includes('QUOTA_EXCEEDED') ||
            combined.includes('RATE_LIMIT_EXCEEDED') ||
            combined.includes('TOO_MANY_REQUESTS') ||
            combined.includes('503') ||
            combined.includes('UNAVAILABLE') ||
            combined.includes('SERVICE_UNAVAILABLE') ||
            combined.includes('401') ||
            combined.includes('UNAUTHENTICATED') ||
            combined.includes('403') ||
            combined.includes('PERMISSION_DENIED')
        );
    }

    /**
     * Extracts useful information from GoogleGenAI errors.
     */
    private getGeminiErrorInfo(error: unknown): {
        message: string;
        code: string;
        status: string;
        is503: boolean;
        shouldSwitchKey: boolean;
    } {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        const normalizedMessage = message.toLowerCase();

        const is503 =
            normalizedMessage.includes('503') ||
            normalizedMessage.includes('unavailable') ||
            normalizedMessage.includes('service_unavailable');

        const is429 =
            normalizedMessage.includes('429') ||
            normalizedMessage.includes('resource_exhausted') ||
            normalizedMessage.includes('quota_exceeded') ||
            normalizedMessage.includes('rate_limit_exceeded') ||
            normalizedMessage.includes('too_many_requests');

        const is401 =
            normalizedMessage.includes('401') ||
            normalizedMessage.includes('unauthenticated');

        const is403 =
            normalizedMessage.includes('403') ||
            normalizedMessage.includes('permission_denied');

        return {
            message,
            code: '',
            status: '',
            is503,
            shouldSwitchKey: is429 || is401 || is403,
        };
    }

    async translateFoodNameToEnglish(
        name: string,
        description?: string,
    ): Promise<string> {
        try {
            const foodInfo = description
                ? `${name}. ${description}`
                : name;

            const response =
                await this.generateContentWithFailover(
                    (ai) =>
                        ai.models.generateContent({
                            model: this.model,

                            contents: [
                                {
                                    text: `
Ти — довідник з харчової цінності продуктів.

Потрібно визначити ТОЧНУ англійську назву продукту
для пошуку в USDA FoodData Central.

Інформація про продукт:
${foodInfo}

Дуже важливо:

- Використовуй одночасно назву та опис продукту.
- Опис може містити важливу інформацію про склад,
  спосіб приготування, форму або тип продукту.
- Не роби буквальний переклад, якщо він не відповідає
  назві продукту, яку можна знайти в USDA.
- Обирай USDA-сумісний харчовий продукт або найближчий
  конкретний аналог.
- Не використовуй надто загальні назви.
- Не повертай просто "egg", якщо йдеться про курячі яйця.
- Не повертай просто "pickle", якщо йдеться про мариновані огірки.
- Враховуй спосіб приготування, якщо він зазначений.
- Якщо в описі зазначено склад або основний інгредієнт,
  використовуй цю інформацію.
- Назва повинна описувати саме продукт, а не страву,
  що його містить.

Приклади:

Картопля відварна
→ boiled potato

Морква відварна
→ boiled carrot

Курячі яйця
→ whole chicken egg

Яйця курячі
→ whole chicken egg

Яйце куряче
→ whole chicken egg

Відварні яйця
→ hard-boiled egg

Варені яйця
→ hard-boiled egg

Мариновані огірки
→ dill pickles

Огірки мариновані
→ dill pickles

Солоні огірки
→ dill pickles

Зелена цибуля
→ green onion

Цибуля зелена
→ green onion

Червона цибуля
→ red onion

Сметана
→ sour cream

Майонез
→ mayonnaise

Грецький йогурт
→ greek yogurt

Кріп свіжий
→ fresh dill

Петрушка свіжа
→ fresh parsley

Помідор
→ tomato

Огірок свіжий
→ fresh cucumber

Гречка
→ buckwheat

Гречана крупа
→ buckwheat

Вівсянка
→ oats

Рис
→ rice

Для м'ясних і ковбасних продуктів:

Ковбаса варена
→ bologna sausage

Шинка
→ ham

Куряча шинка
→ chicken ham

Свинина
→ pork

Курятина
→ chicken

Яловичина
→ beef

Для сирників та подібних продуктів:

Сирники
→ cottage cheese pancakes

Сирники смажені з кисломолочного сиру
→ cottage cheese pancakes

Три смажені сирники з кисломолочного сиру
→ cottage cheese pancakes

Якщо назва містить декілька можливих варіантів,
а опис допомагає визначити конкретний продукт,
використовуй інформацію з опису.

Якщо точного продукту в USDA немає,
обирай найближчий харчовий продукт,
який відповідає складу та способу приготування.

Не додавай:
- brand names;
- рецепти;
- пояснення;
- одиниці вимірювання;
- кількість;
- Markdown.

Поверни ТІЛЬКИ англійську назву продукту.
Без JSON.
Без пояснень.
Без крапки в кінці.
`,
                                },
                            ],

                            config: {
                                temperature: 0,
                                maxOutputTokens: 50,
                            },
                        }),
                );

            if (!response.text) {
                throw new Error(
                    'Gemini returned an empty response',
                );
            }

            return response.text
                .trim()
                .replace(/^["']|["']$/g, '')
                .replace(/\.$/, '')
                .trim()
                .toLowerCase();
        } catch (error: unknown) {
            console.error(
                'Gemini food name translation error:',
                error,
            );

            throw new BadRequestException(
                error instanceof Error
                    ? `Failed to translate food name: ${error.message}`
                    : 'Failed to translate food name',
            );
        }
    }


    async verifyMissingMicronutrients(
        foodName: string,
        missingNutrients: string[],
    ): Promise<Record<string, { value: number; known: boolean }>> {
        if (missingNutrients.length === 0) {
            return {};
        }

        try {
            const response =
                await this.generateContentWithFailover(
                    (ai) =>
                        ai.models.generateContent({
                            model: this.model,

                            contents: [
                                {
                                    text: `
Ти — довідник з харчової цінності продуктів.

Потрібно перевірити ТІЛЬКИ зазначені мікронутрієнти
для конкретного продукту.

Продукт:
${foodName}

Мікронутрієнти, які потрібно перевірити:
${missingNutrients.join(', ')}

Для кожного зазначеного мікронутрієнта поверни об'єкт:

{
    "value": число,
    "known": true або false
}

Правила:

- якщо є достатньо надійна інформація —
  поверни значення та known: true;

- якщо нутрієнт природно відсутній або його кількість
  практично дорівнює нулю —
  поверни value: 0 та known: true;

- якщо достовірно визначити значення неможливо —
  поверни value: 0 та known: false;

- НЕ вигадуй значення.

Одиниці на 100 г:

- vitaminA — µg
- vitaminC — mg
- calcium — mg
- iron — mg
- magnesium — mg
- potassium — mg
- sodium — mg
- vitaminB6 — mg
- folate — µg
- vitaminB12 — µg

Поверни ТІЛЬКИ JSON.

Приклад:

{
    "vitaminA": {
        "value": 0,
        "known": true
    },
    "calcium": {
        "value": 50,
        "known": true
    }
}

Поверни тільки ті поля, які були зазначені
для перевірки.
`,
                                },
                            ],

                            config: {
                                responseMimeType:
                                    'application/json',

                                responseSchema: {
                                    type: Type.OBJECT,

                                    properties:
                                        Object.fromEntries(
                                            missingNutrients.map(
                                                (nutrient) => [
                                                    nutrient,
                                                    {
                                                        type: Type.OBJECT,

                                                        properties: {
                                                            value: {
                                                                type: Type.NUMBER,
                                                            },

                                                            known: {
                                                                type: Type.BOOLEAN,
                                                            },
                                                        },

                                                        required: [
                                                            'value',
                                                            'known',
                                                        ],
                                                    },
                                                ],
                                            ),
                                        ),

                                    required:
                                        missingNutrients,
                                },

                                temperature: 0,

                                maxOutputTokens: 500,
                            },
                        }),
                );

            if (!response.text) {
                throw new Error(
                    'Gemini returned an empty micronutrient verification response',
                );
            }

            const parsed =
                JSON.parse(response.text) as Record<
                    string,
                    {
                        value: number;
                        known: boolean;
                    }
                >;

            console.log(
                'GEMINI MICRONUTRIENT VERIFICATION:',
                JSON.stringify(
                    {
                        foodName,
                        missingNutrients,
                        result: parsed,
                    },
                    null,
                    2,
                ),
            );

            return parsed;
        } catch (error: unknown) {
            console.error(
                'Gemini micronutrient verification error:',
                error,
            );

            if (
                error instanceof BadRequestException
            ) {
                throw error;
            }

            throw new BadRequestException(
                error instanceof Error
                    ? `Failed to verify micronutrients: ${error.message}`
                    : 'Failed to verify micronutrients',
            );
        }
    }


    
    

    async analyzeFood(
        imageBuffer: Buffer,
        context: FoodAnalysisContext,
        mimeType = 'image/jpeg',
    ): Promise<FoodAnalysisResult> {
        const analysisCallId =
            `${Date.now()} -${Math.random()
                .toString(36)
                .slice(2, 8)
            } `;

        console.log(
            `GEMINI ANALYZE FOOD START[${analysisCallId}]`,
            {
                imageSize: imageBuffer.length,
                mimeType,
                plateDiameterCm:
                    context.plateDiameterCm,
                plateHeightCm:
                    context.plateHeightCm,
                fillPercentage:
                    context.fillPercentage,
            },
        );

        try {
            const base64Image =
                imageBuffer.toString('base64');

            const prompt =
                this.buildAnalysisPrompt(context);

            console.log(
                `GEMINI ANALYZE FOOD SENDING REQUEST[${analysisCallId}]`,
            );

            const response =
                await this.generateContentWithFailover(
                    (ai) =>
                        ai.models.generateContent({
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
                        }),
                );

            console.log(
                `GEMINI ANALYZE FOOD RESPONSE RECEIVED[${analysisCallId}]`,
            );

            const text = response.text;

            if (!text) {
                throw new Error(
                    'Gemini returned an empty response',
                );
            }

            const parsed =
                JSON.parse(
                    text,
                ) as FoodAnalysisResult;

            console.log(
                `GEMINI ANALYZE FOOD SUCCESS[${analysisCallId}]`,
            );

            console.log(
                'GEMINI RAW FOOD ANALYSIS:',
                JSON.stringify(
                    parsed,
                    null,
                    2,
                ),
            );

            return parsed;
        } catch (error: unknown) {
            console.error(
                `GEMINI ANALYZE FOOD ERROR[${analysisCallId}]: `,
                error,
            );

            if (
                error instanceof BadRequestException
            ) {
                throw error;
            }

            throw new BadRequestException(
                error instanceof Error
                    ? `Failed to analyze image with Gemini: ${error.message} `
                    : 'Failed to analyze image with Gemini',
            );
        }
    }



    async analyzeFoodFromDescription(
        context: FoodAnalysisContext,
        description: string,
    ): Promise<FoodAnalysisResult> {
        try {
            const response =
                await this.generateContentWithFailover(
                    (ai) =>
                        ai.models.generateContent({
                            model: this.model,

                            contents: [
                                {
                                    text: this.buildTextAnalysisPrompt(
                                        context,
                                        description,
                                    ),
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
                        }),
                );

            if (!response.text) {
                throw new Error(
                    'Gemini returned an empty response',
                );
            }

            return JSON.parse(
                response.text,
            ) as FoodAnalysisResult;
        } catch (error: unknown) {
            console.error(
                'Gemini text food analysis error:',
                error,
            );

            if (
                error instanceof BadRequestException
            ) {
                throw error;
            }

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
            const response =
                await this.generateContentWithFailover(
                    (ai) =>
                        ai.models.generateContent({
                            model: this.model,

                            contents: [
                                {
                                    text: this.buildDietRecommendationPrompt(
                                        summary,
                                    ),
                                },
                            ],

                            config: {
                                responseMimeType:
                                    'application/json',

                                responseSchema:
                                    this.getDietRecommendationSchema(),

                                temperature: 0.4,

                                maxOutputTokens: 3000,
                            },
                        }),
                );

            if (!response.text) {
                throw new Error(
                    'Gemini returned an empty response',
                );
            }

            return JSON.parse(
                response.text,
            ) as DietRecommendationResult;
        } catch (error: unknown) {
            console.error(
                'Gemini diet recommendation error:',
                error,
            );

            if (
                error instanceof BadRequestException
            ) {
                throw error;
            }

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
кількості калорій, білків, жирів,
вуглеводів, клітковини, цукру та натрію.
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
- альтернативні назви українською;
- альтернативні назви англійською;
- приблизну вагу в грамах;
- confidence;
- короткий опис.

========================
НАЗВА ТА АЛЬТЕРНАТИВНІ НАЗВИ ПРОДУКТУ
========================

Для кожного foodItem поле name повинно містити
найбільш конкретну та ймовірну назву ОДНОГО продукту,
який видно на фотографії.

Для кожного foodItem ОБОВ'ЯЗКОВО поверни:

- aliasesUk — альтернативні назви цього самого продукту українською;
- aliasesEn — альтернативні назви цього самого продукту англійською.

Aliases використовуються як словник для пошуку
цього самого продукту в базі даних харчової цінності.

ОБОВ'ЯЗКОВЕ ПРАВИЛО:

Alias повинен означати ТОЙ САМИЙ ПРОДУКТ,
що і name.

НЕ додавай до aliases:

- інший продукт;
- альтернативний продукт;
- можливий замінник;
- суміш різних продуктів;
- кілька різних продуктів в одному alias;
- загальну категорію замість конкретного продукту;
- спосіб приготування як окремий продукт;
- інгредієнт, який може бути присутній, але не є тим самим продуктом;
- припущення про продукт, який не видно на фотографії.

НАПРИКЛАД:

Якщо продукт — авокадо:

name:
"Авокадо"

aliasesUk можуть містити:
"авокадо"
"плід авокадо"

aliasesEn можуть містити:
"avocado"
"avocado fruit"

Але НЕ додавай:
"гуакамоле"
"оливки"
"авокадова паста"

якщо це не той самий продукт.

Якщо на фотографії видно шпинат,
не створюй alias "рукола" лише тому,
що рукола також належить до листової зелені.

Якщо на фотографії видно руколу,
не створюй alias "шпинат".

Якщо неможливо надійно визначити,
чи це шпинат або рукола,
НЕ об'єднуй їх в один alias на кшталт:

"рукола і шпинат"
"arugula and spinach"

Замість цього використовуй найбільш
обґрунтовану загальну назву продукту,
яку можна підтвердити фотографією,
наприклад "листова зелень",
і aliases повинні бути лише
еквівалентними назвами цієї самої категорії,
а не назвами конкретних різних продуктів.

Не створюй штучних або малоймовірних aliases.

Aliases повинні бути короткими,
реалістичними та корисними для пошуку
в базі даних продуктів.

ВАЖЛИВО: СПОСІБ ПРИГОТУВАННЯ НЕ Є ALIAS

Не використовуй як alias слова або словосполучення,
які описують спосіб приготування, якщо name є загальною
назвою продукту.

Наприклад:

name:
"Креветки"

МОЖНА:
"shrimp"
"prawns"
"креветки"

НЕ МОЖНА:
"варені креветки"
"смажені креветки"
"грильовані креветки"
"boiled shrimp"
"fried shrimp"
"grilled shrimp"

Причина:
спосіб приготування може змінювати харчову цінність продукту,
тому така назва повинна вважатися окремим продуктом,
а не синонімом.

Так само НЕ використовуй як alias назви,
які змінюють харчову ідентичність продукту.

Наприклад:

"томати" → "помідори" МОЖНА

"томати" → "в'ялені томати" НЕ МОЖНА

"картопля" → "potato" МОЖНА

"картопля" → "смажена картопля" НЕ МОЖНА

"куряче філе" → "chicken breast" МОЖНА

"куряче філе" → "смажене куряче філе" НЕ МОЖНА

Якщо alias містить характеристику, яка може впливати
на харчову цінність або означає інший стан продукту,
не використовуй його як alias.

Коли name є загальною назвою продукту,
aliases також повинні залишатися загальними назвами
того самого продукту.

Також НЕ використовуй ширші категорії як alias.

Наприклад:

"креветки" → "морепродукти" НЕ МОЖНА
"авокадо" → "фрукти" НЕ МОЖНА
"помідори" → "овочі" НЕ МОЖНА
"шпинат" → "листова зелень" НЕ МОЖНА

Alias повинен бути рівнозначною назвою
саме цього продукту, а не категорією,
до якої він належить.

Якщо слово є ширшою категорією,
не використовуй його як alias.


Не потрібно створювати десятки aliases.
Повертай лише найбільш вживані альтернативні назви.

Якщо очевидних альтернативних назв немає,
поверни порожній масив [].

aliasesUk та aliasesEn завжди повинні бути масивами рядків.

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

Для КОЖНОГО foodItem обов'язково поверни окремо:

- protein — білки в грамах саме для estimatedGrams цього компонента;
- fat — жири в грамах саме для estimatedGrams цього компонента;
- carbohydrates — вуглеводи в грамах саме для estimatedGrams цього компонента;
- calories — калорії саме для estimatedGrams цього компонента.

Ці чотири поля ОБОВ'ЯЗКОВІ для кожного foodItem.

Наприклад, якщо foodItem має estimatedGrams = 200,
protein, fat, carbohydrates та calories повинні бути
розраховані саме для 200 грамів, а не для 100 грамів.

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
КЛІТКОВИНА, ЦУКОР ТА НАТРІЙ
========================

Для ВСІЄЇ страви ОБОВ'ЯЗКОВО визнач:

- fiber — загальна кількість клітковини в грамах;
- sugar — загальна кількість цукрів у грамах;
- sodium — загальна кількість натрію в міліграмах.

Ці три значення повинні стосуватися
ВСІЄЇ страви разом, включно з усіма
видимими компонентами та доданими соусами.

Не потрібно повертати fiber, sugar або sodium
окремо для кожного foodItem.

Навіть якщо якийсь продукт важко визначити
або для нього немає надійної інформації,
ВСЕ ОДНО ОБОВ'ЯЗКОВО поверни оцінку
fiber, sugar та sodium для всієї страви.

Якщо певний нутрієнт практично відсутній,
поверни 0.

Не використовуй null.

Оцінки повинні бути реалістичними
та узгодженими зі складом і кількістю їжі.

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
- fiber — число в грамах для всієї страви.
- sugar — число в грамах для всієї страви.
- sodium — число в міліграмах для всієї страви.
- fiber, sugar та sodium ОБОВ'ЯЗКОВІ.
- Якщо їх кількість практично дорівнює нулю — поверни 0.
- Не використовуй null.
- Всі числові значення повинні бути числами.
- confidence від 0 до 1.
- overallConfidence від 0 до 1.
- macroBalance від 0 до 1.
- glycemicIndex від 0 до 100.
- Не використовуй NaN.
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

Для КОЖНОГО foodItem обов'язково визнач:

- protein — грами білка саме в цій порції;
- fat — грами жиру саме в цій порції;
- carbohydrates — грами вуглеводів саме в цій порції;
- calories — калорії саме в цій порції.

Загальні protein, fat, carbohydrates та totalCalories
повинні відповідати сумі значень усіх foodItems.

ОПИС АБО РЕЦЕПТ КОРИСТУВАЧА:
${description}

КОНТЕКСТ ПОРЦІЇ:
тарілка ${context.plateDiameterCm} см,
висота ${context.plateHeightCm} см,
заповненість ${(context.fillPercentage * 100).toFixed(0)}%.

ДОДАТКИ:
${sauces}.
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

Меню має містити 3–4 реалістичні страви, які разом наближені до добових цілей.

Для кожної дай короткий рецепт, інгредієнти та приблизні калорії.

Поверни ТІЛЬКИ JSON згідно зі схемою.

ДАНІ РАЦІОНУ:
${JSON.stringify(summary)}
`;
    }

    private getDietRecommendationSchema() {
        return {
            type: Type.OBJECT,

            properties: {
                summary: {
                    type: Type.STRING,
                },

                recommendations: {
                    type: Type.ARRAY,

                    items: {
                        type: Type.STRING,
                    },
                },

                tomorrowTargets: {
                    type: Type.OBJECT,

                    properties: {
                        calories: {
                            type: Type.NUMBER,
                        },

                        protein: {
                            type: Type.NUMBER,
                        },

                        fat: {
                            type: Type.NUMBER,
                        },

                        carbohydrates: {
                            type: Type.NUMBER,
                        },
                    },

                    required: [
                        'calories',
                        'protein',
                        'fat',
                        'carbohydrates',
                    ],
                },

                tomorrowMenu: {
                    type: Type.ARRAY,

                    items: {
                        type: Type.OBJECT,

                        properties: {
                            mealType: {
                                type: Type.STRING,
                            },

                            name: {
                                type: Type.STRING,
                            },

                            description: {
                                type: Type.STRING,
                            },

                            ingredients: {
                                type: Type.ARRAY,

                                items: {
                                    type: Type.STRING,
                                },
                            },

                            calories: {
                                type: Type.NUMBER,
                            },

                            recipe: {
                                type: Type.STRING,
                            },
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

                            aliasesUk: {
                                type: Type.ARRAY,

                                items: {
                                    type: Type.STRING,
                                },
                            },

                            aliasesEn: {
                                type: Type.ARRAY,

                                items: {
                                    type: Type.STRING,
                                },
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

                            protein: {
                                type: Type.NUMBER,
                            },

                            fat: {
                                type: Type.NUMBER,
                            },

                            carbohydrates: {
                                type: Type.NUMBER,
                            },

                            calories: {
                                type: Type.NUMBER,
                            },
                        },

                        required: [
                            'name',
                            'aliasesUk',
                            'aliasesEn',
                            'estimatedGrams',
                            'confidence',
                            'description',
                            'protein',
                            'fat',
                            'carbohydrates',
                            'calories',
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

                fiber: {
                    type: Type.NUMBER,
                },

                sugar: {
                    type: Type.NUMBER,
                },

                sodium: {
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
                'fiber',
                'sugar',
                'sodium',
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