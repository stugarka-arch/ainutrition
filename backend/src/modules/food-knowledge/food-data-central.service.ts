import { Injectable } from '@nestjs/common';

@Injectable()
export class FoodDataCentralService {
    async searchFood(query: string) {
        const apiKey = process.env.USDA_API_KEY;

        if (!apiKey) {
            throw new Error('USDA_API_KEY is not configured');
        }

        const normalizedQuery = this.normalizeText(query);

        if (!normalizedQuery) {
            return null;
        }

        /*
         * ---------------------------------------------------------
         * Helpers
         * ---------------------------------------------------------
         */

        const getNutrient = (
            food: any,
            nutrientNumbers: string[],
            nutrientIds: number[],
        ): number | null => {
            const nutrient = food.foodNutrients?.find(
                (item: any) => {
                    const number = String(
                        item.nutrientNumber ?? '',
                    );

                    const id = Number(
                        item.nutrientId,
                    );

                    return (
                        nutrientNumbers.includes(number) ||
                        nutrientIds.includes(id)
                    );
                },
            );

            const value = Number(
                nutrient?.value,
            );

            return Number.isFinite(value)
                ? value
                : null;
        };

        const getFoodName = (
            food: any,
        ): string => {
            return this.normalizeText(
                String(
                    food.description ??
                    food.lowercaseDescription ??
                    '',
                ),
            );
        };

        const containsAny = (
            value: string,
            words: string[],
        ): boolean => {
            return words.some(
                (word) =>
                    value.includes(
                        this.normalizeText(word),
                    ),
            );
        };

        /*
         * ---------------------------------------------------------
         * Detect compound foods.
         * ---------------------------------------------------------
         */

        const compoundPattern =
            /\b(and|with|plus|mixed with)\b/i;

        if (
            compoundPattern.test(
                normalizedQuery,
            )
        ) {
            console.warn(
                `USDA: compound food request "${query}" rejected.`,
            );

            return null;
        }

        /*
         * ---------------------------------------------------------
         * Food state.
         * ---------------------------------------------------------
         */

        const isRaw =
            /\b(raw|fresh)\b/i.test(
                normalizedQuery,
            );

        const isCooked =
            /\b(cooked|boiled|steamed|baked|roasted|fried)\b/i.test(
                normalizedQuery,
            );

        const isBoiled =
            /\bboiled\b|\bhard[- ]boiled\b/i.test(
                normalizedQuery,
            );

        const isFried =
            /\bfried\b/i.test(
                normalizedQuery,
            );

        /*
         * ---------------------------------------------------------
         * Remove preparation words only.
         *
         * IMPORTANT:
         * We do NOT remove actual food words such as chicken.
         * ---------------------------------------------------------
         */

        const foodConcept =
            normalizedQuery
                .replace(
                    /\braw\b/g,
                    '',
                )
                .replace(
                    /\bfresh\b/g,
                    '',
                )
                .replace(
                    /\bwhole\b/g,
                    '',
                )
                .replace(
                    /\bcooked\b/g,
                    '',
                )
                .replace(
                    /\bboiled\b/g,
                    '',
                )
                .replace(
                    /\bhard[- ]boiled\b/g,
                    '',
                )
                .replace(
                    /\bsteamed\b/g,
                    '',
                )
                .replace(
                    /\bbaked\b/g,
                    '',
                )
                .replace(
                    /\broasted\b/g,
                    '',
                )
                .replace(
                    /\bfried\b/g,
                    '',
                )
                .replace(
                    /\bprepared\b/g,
                    '',
                )
                .replace(
                    /\bfood\b/g,
                    '',
                )
                .replace(
                    /\s+/g,
                    ' ',
                )
                .trim();

        /*
         * ---------------------------------------------------------
         * Food family detection.
         *
         * This is intentionally generic.
         * ---------------------------------------------------------
         */

        const foodFamilies = {
            egg: /\begg(s)?\b/i,
            potato: /\bpotato(es)?\b/i,
            carrot: /\bcarrot(s)?\b/i,
            onion: /\bonion(s)?\b/i,
            cucumber: /\bcucumber(s)?\b/i,
            tomato: /\btomato(es)?\b/i,
            shrimp: /\bshrimp(s)?\b/i,
            avocado: /\bavocado(es)?\b/i,
            zucchini: /\bzucchini\b|\bcourgette\b/i,
            chicken: /\bchicken\b/i,
            beef: /\bbeef\b/i,
            pork: /\bpork\b/i,
            salmon: /\bsalmon\b/i,
            tuna: /\btuna\b/i,
            rice: /\brice\b/i,
            buckwheat: /\bbuckwheat\b/i,
            mayonnaise: /\bmayonnaise\b/i,
            sourCream: /\bsour cream\b/i,
            greekYogurt: /\bgreek yogurt\b/i,
        };

        /*
         * ---------------------------------------------------------
         * Search queries.
         * ---------------------------------------------------------
         */

        const searchQueries: string[] = [];

        const addSearchQuery = (
            value: string,
        ) => {
            const normalized =
                this.normalizeText(value);

            if (
                normalized &&
                !searchQueries.includes(
                    normalized,
                )
            ) {
                searchQueries.push(
                    normalized,
                );
            }
        };

        addSearchQuery(
            normalizedQuery,
        );

        /*
         * Generic concept query.
         */
        addSearchQuery(
            foodConcept,
        );

        /*
         * State-specific queries.
         */
        if (isRaw) {
            addSearchQuery(
                `${foodConcept} raw`,
            );
        }

        if (isCooked) {
            addSearchQuery(
                `${foodConcept} cooked`,
            );
        }

        if (isBoiled) {
            addSearchQuery(
                `${foodConcept} boiled`,
            );
        }

        /*
         * ---------------------------------------------------------
         * Eggs
         * ---------------------------------------------------------
         */

        if (
            foodFamilies.egg.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'egg whole',
            );

            addSearchQuery(
                'egg whole raw',
            );

            addSearchQuery(
                'egg whole cooked',
            );

            addSearchQuery(
                'egg whole cooked hard boiled',
            );
        }

        /*
         * ---------------------------------------------------------
         * Green onion
         * ---------------------------------------------------------
         */

        if (
            foodFamilies.onion.test(
                normalizedQuery,
            ) &&
            /\bgreen\b/i.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'green onion raw',
            );

            addSearchQuery(
                'scallions raw',
            );
        }

        /*
         * ---------------------------------------------------------
         * Red onion
         * ---------------------------------------------------------
         */

        if (
            foodFamilies.onion.test(
                normalizedQuery,
            ) &&
            /\bred\b/i.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'red onion raw',
            );
        }

        /*
         * ---------------------------------------------------------
         * Common foods with known USDA naming.
         * ---------------------------------------------------------
         */

        if (
            foodFamilies.shrimp.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'shrimp raw',
            );

            addSearchQuery(
                'shrimp cooked',
            );
        }

        if (
            foodFamilies.avocado.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'avocado raw',
            );
        }

        if (
            foodFamilies.zucchini.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'zucchini raw',
            );

            addSearchQuery(
                'zucchini cooked',
            );
        }

        if (
            foodFamilies.tomato.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'tomato raw',
            );
        }

        if (
            foodFamilies.cucumber.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'cucumber raw',
            );
        }

        /*
         * ---------------------------------------------------------
         * Sauces / dairy.
         * ---------------------------------------------------------
         */

        if (
            foodFamilies.mayonnaise.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'mayonnaise',
            );
        }

        if (
            foodFamilies.sourCream.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'sour cream',
            );
        }

        if (
            foodFamilies.greekYogurt.test(
                normalizedQuery,
            )
        ) {
            addSearchQuery(
                'greek yogurt',
            );
        }

        /*
         * ---------------------------------------------------------
         * Search USDA.
         * ---------------------------------------------------------
         */

        const allFoods: any[] = [];
        const knownFoodIds =
            new Set<string>();

        for (
            const searchQuery of searchQueries
        ) {
            const url =
                `https://api.nal.usda.gov/fdc/v1/foods/search` +
                `?api_key=${encodeURIComponent(apiKey)}` +
                `&query=${encodeURIComponent(searchQuery)}` +
                `&pageSize=50`;

            const response =
                await fetch(url);

            if (!response.ok) {
                throw new Error(
                    `USDA API error: ${response.status} ${response.statusText}`,
                );
            }

            const data =
                await response.json();

            const foods =
                Array.isArray(
                    data.foods,
                )
                    ? data.foods
                    : [];

            for (
                const food of foods
            ) {
                const foodId =
                    String(
                        food.fdcId ??
                        food.fdcID ??
                        '',
                    );

                if (
                    foodId &&
                    knownFoodIds.has(
                        foodId,
                    )
                ) {
                    continue;
                }

                if (foodId) {
                    knownFoodIds.add(
                        foodId,
                    );
                }

                allFoods.push(
                    food,
                );
            }
        }

        if (
            allFoods.length === 0
        ) {
            console.warn(
                `USDA: no results found for "${query}"`,
            );

            return null;
        }

        /*
         * ---------------------------------------------------------
         * Word helpers.
         * ---------------------------------------------------------
         */

        const normalizeWord = (
            word: string,
        ): string => {
            return word
                .toLowerCase()
                .replace(
                    /[^a-z0-9]/g,
                    '',
                )
                .replace(
                    /ies$/,
                    'y',
                )
                .replace(
                    /es$/,
                    '',
                )
                .replace(
                    /s$/,
                    '',
                );
        };

        const getWords = (
            value: string,
        ): string[] => {
            return value
                .split(/\s+/)
                .map(
                    normalizeWord,
                )
                .filter(
                    Boolean,
                );
        };

        /*
         * ---------------------------------------------------------
         * Semantic compatibility.
         * ---------------------------------------------------------
         */

        const isNameCompatible = (
            description: string,
        ): boolean => {
            if (!description) {
                return false;
            }

            const excludedForms = [
                'supplement',
                'protein powder',
                'powder',
                'extract',
                'concentrate',
                'flour',
                'syrup',
                'seasoning',
                'instant',
                'supplemental',
            ];

            if (
                containsAny(
                    description,
                    excludedForms,
                )
            ) {
                return false;
            }

            /*
             * The main food concept must occur in
             * the USDA description.
             */
            const conceptWords =
                getWords(
                    foodConcept,
                );

            const descriptionWords =
                getWords(
                    description,
                );

            const preparationWords = new Set([
                'raw',
                'fresh',
                'whole',
                'cooked',
                'boiled',
                'hard',
                'steamed',
                'baked',
                'roasted',
                'fried',
                'prepared',
                'large',
                'small',
                'medium',
                'grade',
            ]);

            const semanticWords =
                conceptWords.filter(
                    (word) =>
                        !preparationWords.has(
                            word,
                        ),
                );

            for (
                const word of semanticWords
            ) {
                const exists =
                    descriptionWords.some(
                        (descriptionWord) =>
                            descriptionWord ===
                            normalizeWord(
                                word,
                            ),
                    );

                if (!exists) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Egg
             * -----------------------------------------------------
             */

            if (
                foodFamilies.egg.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'egg',
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'egg white',
                            'egg yolk',
                            'yolk',
                            'egg substitute',
                            'egg product',
                            'egg powder',
                            'egg noodle',
                            'egg roll',
                            'egg salad',
                            'omelet',
                            'omelette',
                            'quiche',
                            'custard',
                            'casserole',
                            'sandwich',
                        ],
                    )
                ) {
                    return false;
                }

                if (
                    isBoiled &&
                    containsAny(
                        description,
                        [
                            'fried',
                            'scrambled',
                            'poached',
                        ],
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Potato
             * -----------------------------------------------------
             */

            if (
                foodFamilies.potato.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'potato',
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'sweet potato',
                            'chips',
                            'french fries',
                            'fries',
                            'hash brown',
                            'mashed',
                            'salad',
                            'casserole',
                        ],
                    )
                ) {
                    return false;
                }

                if (
                    isBoiled &&
                    containsAny(
                        description,
                        [
                            'fried',
                            'roasted',
                            'baked',
                        ],
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Carrot
             * -----------------------------------------------------
             */

            if (
                foodFamilies.carrot.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'carrot',
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'juice',
                            'cake',
                            'baby food',
                            'dried',
                            'powder',
                            'canned',
                            'fried',
                            'roasted',
                            'glazed',
                            'pickle',
                        ],
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Cucumber
             * -----------------------------------------------------
             */

            if (
                foodFamilies.cucumber.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'cucumber',
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'pickle',
                            'pickles',
                            'relish',
                            'juice',
                        ],
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Tomato
             * -----------------------------------------------------
             */

            if (
                foodFamilies.tomato.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'tomato',
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'sauce',
                            'paste',
                            'juice',
                            'ketchup',
                            'canned',
                            'dried',
                        ],
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Shrimp
             * -----------------------------------------------------
             */

            if (
                foodFamilies.shrimp.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'shrimp',
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'breaded',
                            'fried',
                            'salad',
                            'sauce',
                            'pasta',
                            'pizza',
                            'sandwich',
                            'casserole',
                        ],
                    )
                ) {
                    return false;
                }

                if (
                    !isCooked &&
                    containsAny(
                        description,
                        [
                            'cooked',
                            'boiled',
                            'fried',
                            'breaded',
                        ],
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Avocado
             * -----------------------------------------------------
             */

            if (
                foodFamilies.avocado.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'avocado',
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'oil',
                            'dressing',
                            'guacamole',
                            'dip',
                            'salad',
                        ],
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Zucchini
             * -----------------------------------------------------
             */

            if (
                foodFamilies.zucchini.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !(
                        description.includes(
                            'zucchini',
                        ) ||
                        description.includes(
                            'courgette',
                        )
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'breaded',
                            'fried',
                            'pickle',
                            'soup',
                            'casserole',
                        ],
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Green / red onion
             * -----------------------------------------------------
             */

            if (
                foodFamilies.onion.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'onion',
                    )
                ) {
                    return false;
                }

                if (
                    /\bgreen\b/i.test(
                        normalizedQuery,
                    ) &&
                    !description.includes(
                        'green',
                    )
                ) {
                    return false;
                }

                if (
                    /\bred\b/i.test(
                        normalizedQuery,
                    ) &&
                    !description.includes(
                        'red',
                    )
                ) {
                    return false;
                }
            }

            /*
             * -----------------------------------------------------
             * Greek yogurt
             * -----------------------------------------------------
             */

            if (
                foodFamilies.greekYogurt.test(
                    normalizedQuery,
                )
            ) {
                if (
                    !description.includes(
                        'greek',
                    ) ||
                    !description.includes(
                        'yogurt',
                    )
                ) {
                    return false;
                }

                if (
                    containsAny(
                        description,
                        [
                            'powder',
                            'frozen',
                            'dessert',
                            'candy',
                            'coating',
                        ],
                    )
                ) {
                    return false;
                }
            }

            return true;
        };

        /*
         * ---------------------------------------------------------
         * Macronutrients.
         * ---------------------------------------------------------
         */

        const getMacronutrients = (
            food: any,
        ) => {
            return {
                calories:
                    getNutrient(
                        food,
                        ['208', '1008'],
                        [208, 1008],
                    ),

                protein:
                    getNutrient(
                        food,
                        ['203', '1003'],
                        [203, 1003],
                    ),

                fat:
                    getNutrient(
                        food,
                        ['204', '1004'],
                        [204, 1004],
                    ),

                carbohydrates:
                    getNutrient(
                        food,
                        ['205', '1005'],
                        [205, 1005],
                    ),
            };
        };

        /*
         * ---------------------------------------------------------
         * Nutritional plausibility.
         * ---------------------------------------------------------
         */

        const isNutritionallyPlausible = (
            food: any,
        ): boolean => {
            const {
                calories,
                protein,
                fat,
                carbohydrates,
            } =
                getMacronutrients(
                    food,
                );

            if (
                calories === null ||
                protein === null ||
                fat === null ||
                carbohydrates === null
            ) {
                return false;
            }

            if (
                calories <= 0 ||
                calories > 900
            ) {
                return false;
            }

            if (
                protein < 0 ||
                fat < 0 ||
                carbohydrates < 0
            ) {
                return false;
            }

            /*
             * Energy consistency.
             *
             * USDA values can differ because of fiber,
             * rounding and Atwater factors, therefore
             * the tolerance is deliberately broad.
             */
            const calculatedCalories =
                protein * 4 +
                carbohydrates * 4 +
                fat * 9;

            if (
                calculatedCalories > 0
            ) {
                const difference =
                    Math.abs(
                        calculatedCalories -
                        calories,
                    ) /
                    calories;

                if (
                    difference > 0.45
                ) {
                    return false;
                }
            }

            /*
             * Generic food-specific sanity limits.
             */

            if (
                foodFamilies.egg.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories < 90 ||
                    calories > 250 ||
                    fat > 20 ||
                    carbohydrates > 10
                ) {
                    return false;
                }
            }

            if (
                foodFamilies.potato.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories > 220 ||
                    fat > 15
                ) {
                    return false;
                }
            }

            if (
                foodFamilies.carrot.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories > 150 ||
                    fat > 15
                ) {
                    return false;
                }
            }

            if (
                foodFamilies.cucumber.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories > 150 ||
                    fat > 15
                ) {
                    return false;
                }
            }

            if (
                foodFamilies.tomato.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories > 150 ||
                    fat > 15
                ) {
                    return false;
                }
            }

            if (
                foodFamilies.avocado.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories < 80 ||
                    calories > 300
                ) {
                    return false;
                }

                if (
                    fat < 5 ||
                    fat > 40
                ) {
                    return false;
                }
            }

            if (
                foodFamilies.shrimp.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories < 40 ||
                    calories > 220
                ) {
                    return false;
                }

                if (
                    protein < 10 ||
                    protein > 35
                ) {
                    return false;
                }

                if (
                    fat > 12
                ) {
                    return false;
                }
            }

            if (
                foodFamilies.zucchini.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories > 100 ||
                    fat > 8
                ) {
                    return false;
                }
            }

            if (
                isRaw &&
                calories > 300
            ) {
                return false;
            }

            if (
                foodFamilies.greekYogurt.test(
                    normalizedQuery,
                )
            ) {
                if (
                    calories > 250 ||
                    protein < 3 ||
                    carbohydrates > 25 ||
                    fat > 25
                ) {
                    return false;
                }
            }

            return true;
        };

        /*
         * ---------------------------------------------------------
         * Name score.
         * ---------------------------------------------------------
         */

        const getNameScore = (
            description: string,
        ): number => {
            let score = 0;

            const descriptionWords =
                getWords(
                    description,
                );

            const conceptWords =
                getWords(
                    foodConcept,
                );

            /*
             * Exact match.
             */
            if (
                description ===
                normalizedQuery
            ) {
                score += 500;
            }

            /*
             * Every semantic concept word.
             */
            for (
                const word of conceptWords
            ) {
                const normalizedWord =
                    normalizeWord(
                        word,
                    );

                if (
                    descriptionWords.includes(
                        normalizedWord,
                    )
                ) {
                    score += 80;
                }
            }

            /*
             * Prefer raw when raw was requested.
             */
            if (
                isRaw
            ) {
                if (
                    description.includes(
                        'raw',
                    )
                ) {
                    score += 150;
                }

                if (
                    description.includes(
                        'fresh',
                    )
                ) {
                    score += 80;
                }
            }

            /*
             * Prefer cooked when cooked was requested.
             */
            if (
                isCooked
            ) {
                if (
                    description.includes(
                        'cooked',
                    )
                ) {
                    score += 120;
                }

                if (
                    isBoiled &&
                    description.includes(
                        'boiled',
                    )
                ) {
                    score += 150;
                }
            }

            /*
             * Prefer simple foods.
             */
            const complexWords = [
                'with',
                'and',
                'sauce',
                'dressing',
                'salad',
                'sandwich',
                'pizza',
                'soup',
                'casserole',
                'cake',
                'dessert',
                'breaded',
                'seasoned',
                'marinated',
            ];

            if (
                containsAny(
                    description,
                    complexWords,
                )
            ) {
                score -= 200;
            }

            /*
             * Strong penalty for processed states
             * when the user requested a basic food.
             */
            if (
                !isCooked &&
                containsAny(
                    description,
                    [
                        'fried',
                        'roasted',
                        'baked',
                        'canned',
                        'dried',
                        'pickled',
                    ],
                )
            ) {
                score -= 180;
            }

            /*
             * Avoid pieces with irrelevant
             * animal/food parts.
             */
            if (
                containsAny(
                    description,
                    [
                        'skin',
                        'bone',
                        'liver',
                        'heart',
                        'kidney',
                    ],
                )
            ) {
                score -= 250;
            }

            return score;
        };

        /*
         * ---------------------------------------------------------
         * USDA data type priority.
         *
         * Foundation and SR Legacy are preferred for
         * generic foods.
         * ---------------------------------------------------------
         */

        const getDataTypePriority = (
            food: any,
        ): number => {
            const dataType =
                this.normalizeText(
                    String(
                        food.dataType ?? '',
                    ),
                );

            if (
                dataType ===
                'foundation'
            ) {
                return 400;
            }

            if (
                dataType ===
                'sr legacy'
            ) {
                return 350;
            }

            if (
                dataType ===
                'survey fndds'
            ) {
                return 250;
            }

            if (
                dataType ===
                'branded'
            ) {
                return 50;
            }

            return 100;
        };

        /*
         * ---------------------------------------------------------
         * Generic-food penalty.
         *
         * For "avocado", "tomato", "shrimp" etc.
         * we do NOT want a branded processed product.
         * ---------------------------------------------------------
         */

        const getProcessingScore = (
            food: any,
        ): number => {
            const description =
                getFoodName(
                    food,
                );

            let score = 0;

            const basicWords = [
                'raw',
                'fresh',
                'whole',
                'plain',
                'without salt',
                'unprepared',
            ];

            for (
                const word of basicWords
            ) {
                if (
                    description.includes(
                        word,
                    )
                ) {
                    score += 25;
                }
            }

            const processedWords = [
                'sauce',
                'dressing',
                'marinated',
                'seasoned',
                'breaded',
                'fried',
                'pizza',
                'sandwich',
                'salad',
                'casserole',
                'soup',
                'snack',
                'dessert',
                'canned',
                'pickled',
                'dried',
            ];

            for (
                const word of processedWords
            ) {
                if (
                    description.includes(
                        word,
                    )
                ) {
                    score -= 100;
                }
            }

            return score;
        };

        /*
         * ---------------------------------------------------------
         * Build candidates.
         * ---------------------------------------------------------
         */

        const candidates =
            allFoods
                .map(
                    (food: any) => {
                        const description =
                            getFoodName(
                                food,
                            );

                        const nameCompatible =
                            isNameCompatible(
                                description,
                            );

                        const nutritionallyPlausible =
                            isNutritionallyPlausible(
                                food,
                            );

                        return {
                            food,
                            description,

                            nameScore:
                                getNameScore(
                                    description,
                                ),

                            processingScore:
                                getProcessingScore(
                                    food,
                                ),

                            nutritionalScore:
                                nutritionallyPlausible
                                    ? 150
                                    : -1000,

                            dataTypePriority:
                                getDataTypePriority(
                                    food,
                                ),

                            nameCompatible,

                            nutritionallyPlausible,
                        };
                    },
                )
                .filter(
                    (candidate) =>
                        candidate.nameCompatible,
                )
                .filter(
                    (candidate) =>
                        candidate.nutritionallyPlausible,
                );

        if (
            candidates.length === 0
        ) {
            console.warn(
                `USDA: no suitable food matching "${query}" was found.`,
            );

            return null;
        }

        /*
         * ---------------------------------------------------------
         * Final ranking.
         *
         * Semantic match + nutrition + processing state
         * come before USDA data type.
         * ---------------------------------------------------------
         */

        candidates.sort(
            (a, b) => {
                const scoreA =
                    a.nameScore +
                    a.processingScore +
                    a.nutritionalScore +
                    a.dataTypePriority;

                const scoreB =
                    b.nameScore +
                    b.processingScore +
                    b.nutritionalScore +
                    b.dataTypePriority;

                return (
                    scoreB -
                    scoreA
                );
            },
        );

        /*
         * ---------------------------------------------------------
         * Debug.
         * ---------------------------------------------------------
         */

        console.log(
            'USDA TOP CANDIDATES:',
            candidates
                .slice(0, 10)
                .map(
                    (candidate) => ({
                        description:
                            candidate.description,

                        dataType:
                            candidate.food
                                .dataType,

                        nameScore:
                            candidate.nameScore,

                        processingScore:
                            candidate.processingScore,

                        nutritionalScore:
                            candidate.nutritionalScore,

                        dataTypePriority:
                            candidate.dataTypePriority,

                        totalScore:
                            candidate.nameScore +
                            candidate.processingScore +
                            candidate.nutritionalScore +
                            candidate.dataTypePriority,
                    }),
                ),
        );

        /*
         * ---------------------------------------------------------
         * Selected food.
         * ---------------------------------------------------------
         */

        const selectedCandidate =
            candidates[0];

        const selected =
            selectedCandidate.food;

        /*
         * ---------------------------------------------------------
         * Macronutrients.
         * ---------------------------------------------------------
         */

        const calories =
            getNutrient(
                selected,
                ['208', '1008'],
                [208, 1008],
            );

        const protein =
            getNutrient(
                selected,
                ['203', '1003'],
                [203, 1003],
            );

        const fat =
            getNutrient(
                selected,
                ['204', '1004'],
                [204, 1004],
            );

        const carbohydrates =
            getNutrient(
                selected,
                ['205', '1005'],
                [205, 1005],
            );

        const fiber =
            getNutrient(
                selected,
                ['291', '1079'],
                [291, 1079],
            );

        const sugar =
            getNutrient(
                selected,
                ['269', '2000'],
                [269, 2000],
            );

        /*
         * ---------------------------------------------------------
         * Micronutrients.
         * ---------------------------------------------------------
         */

        const vitaminA =
            getNutrient(
                selected,
                ['320'],
                [320],
            );

        const vitaminC =
            getNutrient(
                selected,
                ['401'],
                [401],
            );

        const calcium =
            getNutrient(
                selected,
                ['301'],
                [301],
            );

        const iron =
            getNutrient(
                selected,
                ['303'],
                [303],
            );

        const magnesium =
            getNutrient(
                selected,
                ['304'],
                [304],
            );

        const potassium =
            getNutrient(
                selected,
                ['306'],
                [306],
            );

        const sodium =
            getNutrient(
                selected,
                ['307'],
                [307],
            );

        const vitaminB6 =
            getNutrient(
                selected,
                ['415'],
                [415],
            );

        const folate =
            getNutrient(
                selected,
                ['417'],
                [417],
            );

        const vitaminB12 =
            getNutrient(
                selected,
                ['418'],
                [418],
            );

        /*
         * ---------------------------------------------------------
         * Final validation.
         * ---------------------------------------------------------
         */

        if (
            calories === null ||
            protein === null ||
            fat === null ||
            carbohydrates === null
        ) {
            console.warn(
                `USDA: selected food "${selected.description}" does not contain complete macronutrient data.`,
            );

            return null;
        }

        /*
         * ---------------------------------------------------------
         * Final log.
         * ---------------------------------------------------------
         */

        console.log(
            'USDA FOOD SELECTED:',
            {
                query,
                normalizedQuery,
                foodConcept,

                description:
                    selected.description,

                dataType:
                    selected.dataType,

                fdcId:
                    selected.fdcId,

                score:
                    selectedCandidate.nameScore +
                    selectedCandidate.processingScore +
                    selectedCandidate.nutritionalScore +
                    selectedCandidate.dataTypePriority,

                calories,
                protein,
                fat,
                carbohydrates,
                fiber,
                sugar,

                vitaminA,
                vitaminC,
                calcium,
                iron,
                magnesium,
                potassium,
                sodium,
                vitaminB6,
                folate,
                vitaminB12,
            },
        );

        return {
            name:
                selected.description ??
                query,

            calories,
            protein,
            fat,
            carbohydrates,

            fiber:
                fiber ?? undefined,

            sugar:
                sugar ?? undefined,

            vitaminA:
                vitaminA ?? undefined,

            vitaminC:
                vitaminC ?? undefined,

            calcium:
                calcium ?? undefined,

            iron:
                iron ?? undefined,

            magnesium:
                magnesium ?? undefined,

            potassium:
                potassium ?? undefined,

            sodium:
                sodium ?? undefined,

            vitaminB6:
                vitaminB6 ?? undefined,

            folate:
                folate ?? undefined,

            vitaminB12:
                vitaminB12 ?? undefined,

            source:
                'USDA FoodData Central',
        };
    }

    /*
     * Normalizes text for comparison with USDA descriptions.
     */
    private normalizeText(
        value: string,
    ): string {
        return value
            .trim()
            .toLowerCase()
            .replace(
                /[,;:()[\]{}]/g,
                ' ',
            )
            .replace(
                /\s+/g,
                ' ',
            )
            .trim();
    }
}