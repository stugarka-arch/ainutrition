
import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class FoodKnowledgeService {
  private readonly logger = new Logger(FoodKnowledgeService.name);

  private readonly geminiApiKeys: string[] = [];
  private geminiKeyIndex = 0;

  constructor(private readonly prisma: PrismaService) {
    if (process.env.GEMINI_API_KEY) {
      this.geminiApiKeys.push(process.env.GEMINI_API_KEY);
    }

    if (process.env.GEMINI_API_KEY_2) {
      this.geminiApiKeys.push(process.env.GEMINI_API_KEY_2);
    }

    if (process.env.GEMINI_API_KEY_3) {
      this.geminiApiKeys.push(process.env.GEMINI_API_KEY_3);
    }
  }

  /**
   * Finds an existing food locally using the original name,
   * aliases, parenthetical descriptions and known local variants.
   */
  async findFood(name: string): Promise<any | null> {
    const variants = this.getFoodNameVariants(name);

    if (variants.length === 0) {
      return null;
    }

    console.log('🔎 LOCAL FOOD SEARCH:', name);
    console.log('🔎 SEARCH VARIANTS:', variants);

    for (const variant of variants) {
      const food = await this.prisma.foodKnowledge.findFirst({
        where: {
          OR: [
            {
              name: {
                equals: variant,
                mode: 'insensitive',
              },
            },
            {
              nameUk: {
                equals: variant,
                mode: 'insensitive',
              },
            },
            {
              nameEn: {
                equals: variant,
                mode: 'insensitive',
              },
            },
            {
              aliases: {
                some: {
                  name: {
                    equals: variant,
                    mode: 'insensitive',
                  },
                },
              },
            },
          ],
        },
        include: {
          aliases: true,
        },
      });

      if (food) {
        console.log('✅ LOCAL FOOD FOUND:', {
          requestedName: name,
          matchedVariant: variant,
          id: food.id,
          name: food.name,
          nameUk: food.nameUk,
          nameEn: food.nameEn,
          source: food.source,
        });

        return food;
      }
    }

    console.log('❌ LOCAL FOOD NOT FOUND:', name);

    return null;
  }

    /**
    * Finds existing food locally using the name and aliases
    * returned by Gemini during the photo analysis.
    *
    * If a local record is found, it remains the source of truth.
    * New safe Gemini aliases are added to that existing record.
    *
    * Only if no local record matches any name or alias,
    * searches USDA and saves a new canonical record
    * together with the Gemini-provided aliases.
    */
    async findOrCreateFood(
        name: string,
        description?: string,
        aliasesUk: string[] = [],
        aliasesEn: string[] = [],
    ): Promise<any | null> {
        console.log(
            `🍎 FOOD KNOWLEDGE: Processing "${name}"`,
        );

        console.log(
            '🏷️ FOOD KNOWLEDGE: Gemini aliases:',
            {
                aliasesUk,
                aliasesEn,
            },
        );

        // All aliases returned by Gemini.
        const allAliases = [
            ...aliasesUk,
            ...aliasesEn,
        ];

        // Adds new aliases to an existing local record.
        // createAliasesForFood() protects aliases that belong
        // to another food record.
        const updateExistingFoodAliases = async (
            food: any,
        ): Promise<any> => {
            await this.createAliasesForFood(
                food.id,
                allAliases,
            );

            // Return the record again with its updated aliases.
            return this.prisma.foodKnowledge.findUnique({
                where: {
                    id: food.id,
                },
                include: {
                    aliases: true,
                },
            });
        };

        // 1. Search the local database using the original name.
        const existingFoodByName =
            await this.findFood(name);

        if (existingFoodByName) {
            console.log(
                '✅ FOOD KNOWLEDGE: EXISTING LOCAL RECORD BY NAME:',
                {
                    requestedName: name,
                    id: existingFoodByName.id,
                    name: existingFoodByName.name,
                },
            );

            // Existing local food is authoritative.
            // Add any new safe aliases returned by Gemini.
            return updateExistingFoodAliases(
                existingFoodByName,
            );
        }

        // 2. Search the local database using all Ukrainian aliases.
        for (const alias of aliasesUk) {
            if (!alias?.trim()) {
                continue;
            }

            const foodByAlias =
                await this.findFood(alias);

            if (foodByAlias) {
                console.log(
                    '✅ FOOD KNOWLEDGE: EXISTING LOCAL RECORD BY UKRAINIAN ALIAS:',
                    {
                        requestedName: name,
                        alias,
                        id: foodByAlias.id,
                        name: foodByAlias.name,
                    },
                );

                // Existing local food is authoritative.
                // Add any new safe aliases returned by Gemini.
                return updateExistingFoodAliases(
                    foodByAlias,
                );
            }
        }

        // 3. Search the local database using all English aliases.
        for (const alias of aliasesEn) {
            if (!alias?.trim()) {
                continue;
            }

            const foodByAlias =
                await this.findFood(alias);

            if (foodByAlias) {
                console.log(
                    '✅ FOOD KNOWLEDGE: EXISTING LOCAL RECORD BY ENGLISH ALIAS:',
                    {
                        requestedName: name,
                        alias,
                        id: foodByAlias.id,
                        name: foodByAlias.name,
                    },
                );

                // Existing local food is authoritative.
                // Add any new safe aliases returned by Gemini.
                return updateExistingFoodAliases(
                    foodByAlias,
                );
            }
        }

        // 4. No local record matched any name or alias.
        // Use the English alias as the preferred USDA search term.
        const usdaSearchName =
            aliasesEn.find(
                (alias) => alias?.trim(),
            )?.trim() || name;

        console.log(
            `🌐 FOOD KNOWLEDGE: No local match. Searching USDA for "${usdaSearchName}"`,
        );

        const usdaFood =
            await this.getUsdaFood(
                usdaSearchName,
            );

        if (!usdaFood) {
            console.log(
                `⚠️ FOOD KNOWLEDGE: USDA did not find "${name}"`,
            );

            return null;
        }

        // 5. Build a new canonical record.
        // Gemini already provided the aliases,
        // so no additional Gemini request is needed.
        const canonicalEnglishName =
            aliasesEn.find(
                (alias) => alias?.trim(),
            )?.trim() || name;

        const foodData = {
            name: canonicalEnglishName,

            nameUk: name,

            nameEn: canonicalEnglishName,

            aliasesUk,

            aliasesEn,

            ...usdaFood,

            source: 'USDA FoodData Central',
        };

        console.log(
            '💾 FOOD KNOWLEDGE: Creating new record:',
            {
                name: foodData.name,
                nameUk: foodData.nameUk,
                nameEn: foodData.nameEn,
                aliasesUk: foodData.aliasesUk,
                aliasesEn: foodData.aliasesEn,
            },
        );

        // 6. saveFood() performs the final duplicate check
        // and creates the aliases for the new record.
        const savedFood =
            await this.saveFood(
                foodData,
            );

        console.log(
            '💾 FOOD KNOWLEDGE: FOOD SAVED:',
            {
                requestedName: name,
                canonicalEnglishName,
                id: savedFood?.id,
                name: savedFood?.name,
            },
        );

        return savedFood;
    }

    /**
     * Creates a new canonical FoodKnowledge record.
     * A final local lookup prevents accidental duplicate records.
     */
    private async saveFood(data: any): Promise<any> {
        // Safety check against duplicates.
        const existingFood = await this.findFood(data.name);

        if (existingFood) {
            console.log(
                '⚠️ SAVE FOOD CANCELLED - EXISTING RECORD FOUND:',
                {
                    name: data.name,
                    id: existingFood.id,
                },
            );

            return existingFood;
        }

        const food =
            await this.prisma.foodKnowledge.create({
                data: {
                    name: data.name,
                    nameUk: data.nameUk ?? null,
                    nameEn: data.nameEn ?? null,

                    calories: data.calories ?? null,
                    protein: data.protein ?? null,
                    fat: data.fat ?? null,
                    carbohydrates:
                        data.carbohydrates ?? null,
                    fiber: data.fiber ?? null,
                    sugar: data.sugar ?? null,

                    vitaminA:
                        data.vitaminA ?? null,
                    vitaminC:
                        data.vitaminC ?? null,
                    calcium:
                        data.calcium ?? null,
                    iron:
                        data.iron ?? null,
                    magnesium:
                        data.magnesium ?? null,
                    potassium:
                        data.potassium ?? null,
                    sodium:
                        data.sodium ?? null,
                    vitaminB6:
                        data.vitaminB6 ?? null,
                    folate:
                        data.folate ?? null,
                    vitaminB12:
                        data.vitaminB12 ?? null,

                    glycemicIndex:
                        data.glycemicIndex ?? null,
                    source:
                        data.source ?? null,
                },

                include: {
                    aliases: true,
                },
            });

        console.log(
            '✅ FOOD KNOWLEDGE NEW RECORD SAVED:',
            {
                id: food.id,
                name: food.name,
                nameUk: food.nameUk,
                nameEn: food.nameEn,
            },
        );

        // Create canonical names and Gemini-provided aliases.
        await this.createAliasesForFood(
            food.id,
            [
                data.name,
                data.nameUk,
                data.nameEn,
                ...(Array.isArray(data.aliasesUk)
                    ? data.aliasesUk
                    : []),
                ...(Array.isArray(data.aliasesEn)
                    ? data.aliasesEn
                    : []),
            ],
        );

        return this.prisma.foodKnowledge.findUnique({
            where: {
                id: food.id,
            },
            include: {
                aliases: true,
            },
        });
    }

    /**
  * Creates safe aliases for a food.
  *
  * Broad food categories and generic group names
  * are rejected before they can be saved
  */
    private async createAliasesForFood(
        foodKnowledgeId: string,
        names: Array<string | null | undefined>,
    ): Promise<void> {
        const forbiddenGenericAliases = new Set([
            'greens',
            'leafy greens',
            'vegetables',
            'vegetable',
            'fruit',
            'fruits',
            'food',
            'foods',
            'seafood',
            'meat',
            'fish',
            'poultry',
            'dairy',
            'dairy products',
            'nuts',
            'seeds',
            'grains',
            'cereals',
            'legumes',
            'beans',
            'herbs',
            'herb',
            'yogurt',
            'yogurts',
            'зелень',
            'листова зелень',
            'овочі',
            'овоч',
            'фрукти',
            'фрукт',
            'морепродукти',
            'м’ясо',
            'мясо',
            'риба',
            'птиця',
            'молочні продукти',
            'горіхи',
            'насіння',
            'крупи',
            'бобові',
            'трави',
            'зелень листова',
            'йогурт',
            'йогурти',
        ]);

        const forbiddenSpecificCharacteristics = [
            'unsalted',
            'salted',
            'low fat',
            'low-fat',
            'fat free',
            'fat-free',
            'nonfat',
            'non-fat',
            'whole milk',
            'full fat',
            'full-fat',
            'light',
            'reduced fat',
            'sugar free',
            'sugar-free',
            'organic',
            'raw',
            'cooked',
            'boiled',
            'fried',
            'roasted',
            'baked',
            'steamed',
            'frozen',
            'canned',
            'dried',
        ];

        const uniqueNames = new Set<string>();

        for (const name of names) {
            if (!name) {
                continue;
            }

            const normalized =
                this.normalizeName(name);

            if (!normalized) {
                continue;
            }

            if (
                forbiddenGenericAliases.has(
                    normalized,
                )
            ) {
                console.log(
                    '🚫 FOOD KNOWLEDGE: GENERIC ALIAS REJECTED:',
                    {
                        alias: normalized,
                        foodKnowledgeId,
                    },
                );

                continue;
            }
            const containsSpecificCharacteristic =
                forbiddenSpecificCharacteristics.some(
                    (characteristic) =>
                        normalized.includes(
                            characteristic,
                        ),
                );

            if (containsSpecificCharacteristic) {
                console.log(
                    '🚫 FOOD KNOWLEDGE: SPECIFIC CHARACTERISTIC ALIAS REJECTED:',
                    {
                        alias: normalized,
                        foodKnowledgeId,
                    },
                );

                continue;
            }

            uniqueNames.add(normalized);
        }

        for (const name of uniqueNames) {
            const language =
                this.detectLanguage(name);

            const existingAlias =
                await this.prisma.foodKnowledgeAlias.findUnique({
                    where: {
                        language_name: {
                            language,
                            name,
                        },
                    },
                });

            if (existingAlias) {
                if (
                    existingAlias.foodKnowledgeId ===
                    foodKnowledgeId
                ) {
                    continue;
                }

                console.log(
                    '⚠️ FOOD KNOWLEDGE: ALIAS ALREADY BELONGS TO ANOTHER FOOD:',
                    {
                        language,
                        alias: name,
                        existingFoodId:
                            existingAlias.foodKnowledgeId,
                        requestedFoodId:
                            foodKnowledgeId,
                    },
                );

                continue;
            }

            await this.prisma.foodKnowledgeAlias.create({
                data: {
                    foodKnowledgeId,
                    language,
                    name,
                },
            });

            console.log(
                '🏷️ FOOD KNOWLEDGE: ALIAS SAVED:',
                {
                    language,
                    alias: name,
                    foodKnowledgeId,
                },
            );
        }
    }

  /**
   * Translates a food name to a short English database-friendly name.
   */
  private async translateFoodNameToEnglish(
    foodName: string,
  ): Promise<string | null> {
    if (this.geminiApiKeys.length === 0) {
      console.log('⚠️ GEMINI API KEYS NOT CONFIGURED');

      return null;
    }

    const prompt = `
Translate this food name into a standard English food name suitable
for searching a nutrition database.

Return ONLY the English food name.
Do not explain anything.

Food name:
${ foodName }
`;

    try {
      const response = await this.callGemini(prompt);

      if (!response) {
        return null;
      }

      return response
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\.$/, '')
        .trim()
        .toLowerCase();
    } catch (error) {
      console.error('FOOD KNOWLEDGE TRANSLATION ERROR:', error);

      return null;
    }
    }
    
    /**
 * Generates alternative Ukrainian and English names for a new food.
 * These names are stored as local aliases and used for future matching.
 */
    private async generateFoodAliases(
        foodName: string,
        englishName: string | null,
    ): Promise<string[]> {
        if (this.geminiApiKeys.length === 0) {
            console.log('⚠️ GEMINI API KEYS NOT CONFIGURED');

            return [];
        }

        const prompt = `
You are creating aliases for a nutrition database food record.

Food name in Ukrainian:
${foodName}

Standard English food name:
${englishName ?? 'unknown'}

Generate useful alternative names that a food image AI could realistically
use for the EXACT SAME FOOD.

An alias must identify the same specific food as the original food name.
It must NOT be a broader category, a narrower different food, or a group
that may contain the original food.

Include:
- common Ukrainian names
- Ukrainian synonyms
- singular/plural variants when meaningful
- common culinary names for the same food
- common English names
- English synonyms for the same food

IMPORTANT:
- If the food is "шпинат / spinach", "greens" is NOT an alias.
- If the food is "помідор / tomato", "vegetables" is NOT an alias.
- If the food is "креветки / shrimp", "seafood" is NOT an alias.
- If the food is "авокадо / avocado", "fruit" is NOT an alias.
- Never use a broad category as an alias for a specific food.
- Never use an ingredient category as an alias for a specific food.
- Never use a parent category, group name, or umbrella term as an alias.
- Never add an alias simply because the original food belongs to that category.

Do NOT include:
- different foods
- broader food categories
- narrower foods that are actually different foods
- ingredients that are only sometimes part of this food
- preparation methods as separate foods
- cooking methods
- serving styles
- dishes containing the food
- invented or unlikely names

Before returning each alias, check:
"Could this alias refer to many different foods rather than specifically this food?"
If YES, do not include it.

Return ONLY valid JSON in exactly this format:
{
  "aliasesUk": ["..."],
  "aliasesEn": ["..."]
}

Do not add markdown.
Do not add explanations.
`;

        try {
            const response = await this.callGemini(prompt);

            if (!response) {
                return [];
            }

            const cleaned = response
                .trim()
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/\s*```$/i, '')
                .trim();

            const parsed = JSON.parse(cleaned);

            const aliases = [
                ...(Array.isArray(parsed.aliasesUk) ? parsed.aliasesUk : []),
                ...(Array.isArray(parsed.aliasesEn) ? parsed.aliasesEn : []),
            ];

            return aliases
                .filter((alias): alias is string => typeof alias === 'string')
                .map(alias => alias.trim())
                .filter(Boolean);
        } catch (error) {
            console.error('FOOD KNOWLEDGE ALIAS GENERATION ERROR:', error);

            return [];
        }
    }

  /**
   * Calls Gemini using the configured API keys.
   */
  private async callGemini(prompt: string): Promise<string | null> {
    const totalKeys = this.geminiApiKeys.length;

    if (totalKeys === 0) {
      return null;
    }

    for (let attempt = 0; attempt < totalKeys; attempt++) {
      const keyIndex = this.geminiKeyIndex % totalKeys;
      const apiKey = this.geminiApiKeys[keyIndex];

      this.geminiKeyIndex = (this.geminiKeyIndex + 1) % totalKeys;

      console.log(`GEMINI: using API key #${ keyIndex + 1}`);

      try {
        const ai = new GoogleGenAI({
          apiKey,
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
        });

        return response.text ?? null;
      } catch (error: any) {
        console.error(`GEMINI API key #${ keyIndex + 1 } failed: `, {
          message: error?.message,
          status: error?.status,
        });

        if (attempt === totalKeys - 1) {
          return null;
        }
      }
    }

    return null;
  }

    /**
    * Retrieves nutrition information from USDA FoodData Central.
    *
    * Searches several USDA results and selects the result whose
    * description is the closest match to the requested food name.
    */
    private async getUsdaFood(
        foodName: string,
    ): Promise<any | null> {
        const apiKey = process.env.USDA_API_KEY;

        if (!apiKey) {
            console.log(
                '⚠️ USDA_API_KEY NOT CONFIGURED',
            );

            return null;
        }

        try {
            /**
             * USDA search is performed only against generic
             * nutrition databases.
             *
             * Branded foods are intentionally excluded because
             * FoodKnowledge stores generic food nutrition data,
             * not individual commercial products.
             */
            const dataTypes = [
                'Foundation',
                'SR Legacy',
                'Survey (FNDDS)',
            ];

            /**
             * Builds several search variants.
             *
             * All variants are evaluated before the final
             * USDA food is selected.
             */
            const searchQueries =
                this.buildUsdaSearchQueries(
                    foodName,
                );

            console.log(
                '🌐 USDA SEARCH QUERIES:',
                searchQueries,
            );

            /**
             * Normalizes text for comparison.
             */
            const normalize = (
                value: string,
            ): string => {
                return String(value ?? '')
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9а-яіїєґ\s]/gi,
                        ' ',
                    )
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            /**
             * Calculates relevance of one USDA result.
             *
             * Only a generic food matching the user's request
             * may be selected.
             *
             * Specific characteristics, brands, flavors,
             * additional ingredients and preparation methods
             * are rejected unless explicitly requested
             */
            const scoreFood = (
                food: any,
                searchTerm: string,
            ): number => {
                const description =
                    normalize(food.description);

                const normalizedSearch =
                    normalize(searchTerm);

                if (
                    !description ||
                    !normalizedSearch
                ) {
                    return -1;
                }

                const searchWords =
                    normalizedSearch
                        .split(' ')
                        .filter(Boolean);
                
                /*
 * Protect the search from USDA results where a food word
 * appears only as part of a different compound food.
 *
 * Example:
 * "butter" must not match "almond butter".
 * "hard cheese" must not match "pretzels, hard, cheese filled".
 */
                const compoundFoodWords = [
                    'almond',
                    'peanut',
                    'cashew',
                    'cocoa',
                    'chocolate',
                    'honey',
                    'fruit',
                    'pretzel',
                    'pretzels',
                    'breadstick',
                    'breadsticks',
                    'salami',
                    'taco',
                    'tacos',
                    'pizza',
                    'cookie',
                    'cookies',
                    'cake',
                    'cakes',
                ];

                if (
                    normalizedSearch === 'butter' &&
                    compoundFoodWords.some(
                        (word) =>
                            description.split(' ').includes(word),
                    )
                ) {
                    console.log(
                        '🚫 USDA RESULT REJECTED - COMPOUND FOOD:',
                        {
                            searchTerm: normalizedSearch,
                            description,
                        },
                    );

                    return -1;
                }

                if (
                    normalizedSearch.includes('cheese') &&
                    compoundFoodWords.some(
                        (word) =>
                            [
                                'pretzel',
                                'pretzels',
                                'breadstick',
                                'breadsticks',
                                'salami',
                                'taco',
                                'tacos',
                                'pizza',
                                'cookie',
                                'cookies',
                                'cake',
                                'cakes',
                            ].includes(word) &&
                            description.split(' ').includes(word),
                    )
                ) {
                    console.log(
                        '🚫 USDA RESULT REJECTED - NON-CHEESE FOOD:',
                        {
                            searchTerm: normalizedSearch,
                            description,
                        },
                    );

                    return -1;
                }

                const specificTerms = [
                    'nonfat',
                    'non fat',
                    'fat free',
                    'fat-free',
                    'lowfat',
                    'low fat',
                    'reduced fat',
                    'whole milk',
                    'full fat',
                    'full-fat',
                    'skim',
                    'skimmed',
                    'whole',

                    'overripe',
                    'over ripe',
                    'dehydrated',
                    'dehydrated or banana powder',
                    'banana powder',
                    'chips',
                    'nectar',
                    'pudding',
                    'split',
                    'cake',
                    'pie',
                    'pepper',
                    'melon',

                    'cooked',
                    'boiled',
                    'fried',
                    'roasted',
                    'baked',
                    'steamed',
                    'frozen',
                    'canned',
                    'dried',
                    'creamed',

                    'strawberry',
                    'blueberry',
                    'raspberry',
                    'vanilla',
                    'chocolate',
                    'peach',
                    'banana',
                    'apple',
                    'honey',

                    'oats',
                    'granola',
                    'fruit',
                    'with oats',
                    'with fruit',

                    'souffle',
                    'dip',
                    'casserole',
                    'salad',
                    'sandwich',
                    'sauce',
                    'dressing',
                    'recipe',
                    'pizza',
                    'cookie',
                    'cake',
                    'bar',

                    'chobani',
                    'dannon',
                    'oikos',
                    'silk',
                    'fage',
                    'siggi',

                    'tofu',
                    'soy',
                    'soy milk',
                    'almond milk',
                    'coconut milk',
                    'cashew milk',
                    'oat milk',

                    'baby',
                    'toddler',
                ];

                for (const term of specificTerms) {
                    const normalizedTerm =
                        normalize(term);

                    if (
                        description.includes(normalizedTerm) &&
                        !normalizedSearch.includes(normalizedTerm)
                    ) {
                        console.log(
                            '🚫 USDA RESULT REJECTED - UNSPECIFIED CHARACTERISTIC:',
                            {
                                searchTerm: normalizedSearch,
                                description,
                                rejectedTerm: normalizedTerm,
                            },
                        );

                        return -1;
                    }
                }

                let score = 0;

                const dataType =
                    String(food.dataType ?? '')
                        .toLowerCase();

                if (dataType === 'foundation') {
                    score += 30;
                } else if (dataType === 'sr legacy') {
                    score += 20;
                } else if (dataType === 'survey (fndds)') {
                    score += 10;
                }

                /*
                 * Exact generic USDA match gets the highest priority.
                 *
                 * Example:
                 * searchTerm = "apple"
                 *
                 * "Apple, raw" is preferred over:
                 * "Apples, fuji, with skin, raw"
                 * "Apples, gala, with skin, raw"
                 *
                 * because the user did not specify a variety.
                 */
                if (
                    description === normalizedSearch ||
                    description === `${normalizedSearch} raw` ||
                    description === `${normalizedSearch}s raw`
                ) {
                    score += 300;
                }

                /*
 * Prefer a generic USDA food when the user did not
 * specify a preparation, subtype or serving form.
 *
 * Example:
 * "butter" -> "butter, NFS" is preferred over
 * "butter, stick, salted".
 */
                if (
                    normalizedSearch === 'butter' &&
                    (
                        description === 'butter' ||
                        description === 'butter nfs'
                    )
                ) {
                    score += 250;
                }

                /*
                 * Prefer a simple raw food when the user
                 * did not specify another preparation.
                 */
                if (
                    description.endsWith(' raw') &&
                    !normalizedSearch.includes('raw')
                ) {
                    score += 50;
                }

                if (description === normalizedSearch) {
                    score += 500;
                }

                const matchedWords =
                    searchWords.filter(
                        (word) =>
                            description.includes(word),
                    ).length;

                score += matchedWords * 30;

                if (
                    searchWords.length > 0 &&
                    matchedWords === searchWords.length
                ) {
                    score += 30;
                }

                if (
                    description.includes(
                        normalizedSearch,
                    )
                ) {
                    score += 20;
                }

                if (
                    normalizedSearch.includes('plain')
                ) {
                    if (
                        description.includes('plain')
                    ) {
                        score += 40;
                    }
                }

                if (
                    description.includes(
                        'ns as to type of milk',
                    )
                ) {
                    score += 15;
                }

                console.log(
                    '📊 USDA RESULT SCORE:',
                    {
                        searchTerm:
                            normalizedSearch,
                        description,
                        dataType,
                        score,
                    },
                );

                return score;
            };

            /**
             * The best USDA result is selected only after
             * ALL search queries have been evaluated.
             */
            let bestOverallMatch: {
                food: any;
                score: number;
                searchQuery: string;
            } | null = null;

            let bestOverallScore = -1;

            /**
             * Search USDA using all query variants.
             */
            for (
                const searchQuery of searchQueries
            ) {
                const searchUrl =
                    `https://api.nal.usda.gov/fdc/v1/foods/search` +
                    `?api_key=${encodeURIComponent(apiKey)}`;

                const response = await fetch(
                    searchUrl,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type':
                                'application/json',
                        },
                        body: JSON.stringify({
                            query: searchQuery,
                            dataType: dataTypes,
                            pageSize: 25,
                        }),
                    },
                );

                if (!response.ok) {
                    console.error(
                        'USDA SEARCH FAILED:',
                        response.status,
                    );

                    continue;
                }

                const searchData =
                    await response.json();

                const foods =
                    searchData?.foods ?? [];

                if (foods.length === 0) {
                    console.log(
                        `⚠️ USDA: No generic results for "${searchQuery}"`,
                    );

                    continue;
                }

                console.log(
                    '🌐 USDA SEARCH RESULTS:',
                    foods.map(
                        (food: any) => ({
                            fdcId:
                                food.fdcId,
                            description:
                                food.description,
                            dataType:
                                food.dataType,
                        }),
                    ),
                );

                const rankedFoods =
                    foods
                        .map(
                            (
                                food: any,
                            ) => ({
                                food,
                                score:
                                    scoreFood(
                                        food,
                                        searchQuery,
                                    ),
                            }),
                        )
                        .sort(
                            (
                                a: any,
                                b: any,
                            ) =>
                                b.score -
                                a.score,
                        );

                const bestMatch =
                    rankedFoods[0];

                if (
                    !bestMatch ||
                    bestMatch.score < 100
                ) {
                    console.log(
                        '⚠️ USDA: No sufficiently relevant generic match:',
                        {
                            searchQuery,
                            bestMatch:
                                bestMatch
                                    ?.food
                                    ?.description,
                            score:
                                bestMatch
                                    ?.score,
                        },
                    );

                    continue;
                }

                /**
                 * Keep the best result from ALL USDA queries.
                 */
                if (
                    bestMatch.score >
                    bestOverallScore
                ) {
                    bestOverallScore =
                        bestMatch.score;

                    bestOverallMatch = {
                        food:
                            bestMatch.food,
                        score:
                            bestMatch.score,
                        searchQuery,
                    };

                    console.log(
                        '🏆 USDA BEST OVERALL MATCH UPDATED:',
                        {
                            searchQuery,
                            description:
                                bestMatch
                                    .food
                                    .description,
                            score:
                                bestMatch.score,
                        },
                    );
                }
            }

            /**
             * No acceptable generic USDA food was found
             * in any search query.
             */
            if (!bestOverallMatch) {
                console.log(
                    `⚠️ USDA: No suitable generic food found for "${foodName}"`,
                );

                return null;
            }

            const food =
                bestOverallMatch.food;

            console.log(
                '✅ USDA SELECTED FOOD:',
                {
                    requestedName:
                        foodName,
                    searchQuery:
                        bestOverallMatch
                            .searchQuery,
                    description:
                        food.description,
                    fdcId:
                        food.fdcId,
                    dataType:
                        food.dataType,
                    score:
                        bestOverallMatch.score,
                },
            );

            const nutrients =
                food.foodNutrients ?? [];

            /**
             * Gets a nutrient value from USDA.
             *
             * If USDA contains the same nutrient in several
             * units, the requested unit is preferred.
             */
            const getNutrient = (
                names: string[],
                preferredUnit?: string,
            ): number | null => {
                for (
                    const nutrientName of names
                ) {
                    const matchingNutrients =
                        nutrients.filter(
                            (item: any) =>
                                String(
                                    item.nutrientName ??
                                    '',
                                )
                                    .toLowerCase()
                                    .includes(
                                        nutrientName.toLowerCase(),
                                    ),
                        );

                    if (
                        matchingNutrients.length ===
                        0
                    ) {
                        continue;
                    }

                    if (preferredUnit) {
                        const unitMatch =
                            matchingNutrients.find(
                                (item: any) =>
                                    String(
                                        item.unitName ??
                                        '',
                                    )
                                        .toLowerCase() ===
                                    preferredUnit.toLowerCase(),
                            );

                        if (
                            unitMatch?.value !==
                            undefined &&
                            unitMatch?.value !==
                            null
                        ) {
                            return Number(
                                unitMatch.value,
                            );
                        }
                    }

                    const firstValid =
                        matchingNutrients.find(
                            (item: any) =>
                                item.value !==
                                undefined &&
                                item.value !==
                                null,
                        );

                    if (firstValid) {
                        return Number(
                            firstValid.value,
                        );
                    }
                }

                return null;
            };

            return {
                calories:
                    getNutrient(
                        ['Energy'],
                        'KCAL',
                    ),

                protein:
                    getNutrient(
                        ['Protein'],
                        'G',
                    ),

                fat:
                    getNutrient(
                        ['Total lipid'],
                        'G',
                    ),

                carbohydrates:
                    getNutrient(
                        ['Carbohydrate'],
                        'G',
                    ),

                fiber:
                    getNutrient(
                        ['Fiber'],
                        'G',
                    ),

                sugar:
                    getNutrient(
                        ['Sugars'],
                        'G',
                    ),

                vitaminA:
                    getNutrient(
                        [
                            'Vitamin A, RAE',
                            'Vitamin A',
                        ],
                        'UG',
                    ),

                vitaminC:
                    getNutrient(
                        ['Vitamin C'],
                        'MG',
                    ),

                calcium:
                    getNutrient(
                        ['Calcium'],
                        'MG',
                    ),

                iron:
                    getNutrient(
                        ['Iron'],
                        'MG',
                    ),

                magnesium:
                    getNutrient(
                        ['Magnesium'],
                        'MG',
                    ),

                potassium:
                    getNutrient(
                        ['Potassium'],
                        'MG',
                    ),

                sodium:
                    getNutrient(
                        ['Sodium'],
                        'MG',
                    ),

                vitaminB6:
                    getNutrient(
                        [
                            'Vitamin B-6',
                            'Vitamin B6',
                        ],
                        'MG',
                    ),

                folate:
                    getNutrient(
                        ['Folate'],
                        'UG',
                    ),

                vitaminB12:
                    getNutrient(
                        [
                            'Vitamin B-12',
                            'Vitamin B12',
                        ],
                        'UG',
                    ),

                glycemicIndex:
                    null,
            };
        } catch (error) {
            console.error(
                'USDA ERROR:',
                error,
            );

            return null;
        }
    }


    /**
 * Builds alternative USDA search queries
 * from the English food name.
 */
    private buildUsdaSearchQueries(
        foodName: string,
    ): string[] {
        const normalized =
            String(foodName ?? '')
                .toLowerCase()
                .replace(
                    /[^a-z0-9а-яіїєґ\s]/gi,
                    ' ',
                )
                .replace(/\s+/g, ' ')
                .trim();

        if (!normalized) {
            return [];
        }

        const queries =
            new Set<string>();

        queries.add(normalized);

        /**
         * For phrases such as:
         * "greek yogurt"
         *
         * also try:
         * "greek yogurt plain"
         */
        if (
            normalized.includes('yogurt') &&
            !normalized.includes('plain')
        ) {
            queries.add(
                `${normalized} plain`,
            );
        }

        /**
         * USDA often uses "yogurt, Greek..."
         * rather than "Greek yogurt".
         */
        if (
            normalized.includes('greek') &&
            normalized.includes('yogurt')
        ) {
            const withoutYogurt =
                normalized
                    .replace(/\byogurt\b/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

            if (withoutYogurt) {
                queries.add(
                    `yogurt ${withoutYogurt}`,
                );
            }

            queries.add(
                `yogurt ${withoutYogurt} plain`,
            );
        }

        return Array.from(queries);
    }

    /**
     * Generates safe local search variants for a food name.
     *
     * Product-specific aliases are stored in FoodKnowledgeAlias
     * and are no longer hardcoded in the application code.
     */
    private getFoodNameVariants(
        name: string,
    ): string[] {
        const normalized =
            this.normalizeName(name);

        if (!normalized) {
            return [];
        }

        const variants =
            new Set<string>();

        // Original normalized name.
        variants.add(normalized);

        // ---------------------------------------------------------
        // Parenthetical content.
        //
        // Example:
        // "авокадо (свіже)"
        // -> "свіже"
        //
        // We keep the parenthetical content as a search variant,
        // but we do NOT split it into different foods.
        // Product-specific aliases are handled by FoodKnowledgeAlias.
        // ---------------------------------------------------------
        const parentheticalMatches =
            normalized.match(/\(([^)]+)\)/g);

        if (parentheticalMatches) {
            for (const match of parentheticalMatches) {
                const content = match
                    .replace(/[()]/g, '')
                    .trim();

                if (!content) {
                    continue;
                }

                variants.add(content);
            }
        }

        // Remove parenthetical text from the original name.
        const withoutParentheses =
            normalized
                .replace(/\([^)]*\)/g, '')
                .replace(/\s+/g, ' ')
                .trim();

        if (withoutParentheses) {
            variants.add(withoutParentheses);
        }

        // ---------------------------------------------------------
        // Common English singular/plural variants.
        // ---------------------------------------------------------
        for (const variant of Array.from(variants)) {
            if (variant.endsWith('ies')) {
                variants.add(
                    `${variant.slice(0, -3)}y`,
                );
            }

            if (
                variant.endsWith('s') &&
                !variant.endsWith('ss')
            ) {
                variants.add(
                    variant.slice(0, -1),
                );
            }
        }

        return Array.from(variants).filter(Boolean);
    }

  /**
   * Normalizes names for reliable local matching.
   */
  private normalizeName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[’']/g, '')
        .replace(/[-–—]/g, ' ')
        .replace(/\s+/g, ' ');
}

  /**
   * Detects a simple language label for an alias.
   */
  private detectLanguage(name: string): string {
    if (/[а-яіїєґ]/i.test(name)) {
        return 'uk';
    }

    return 'en';
    }
    
    async testUsda(
        name: string,
    ): Promise<any | null> {
        console.log(
            `🧪 TEST USDA: "${name}"`,
        );

        const result =
            await this.getUsdaFood(name);

        console.log(
            '🧪 TEST USDA RESULT:',
            result,
        );

        return result;
    }

}

