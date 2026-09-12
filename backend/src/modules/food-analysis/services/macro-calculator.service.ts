import { Injectable } from '@nestjs/common';

@Injectable()
export class MacroCalculatorService {
    /**
     * Переводить соус з ложок в грами
     */
    convertSauceToGrams(
        sauceName: string,
        quantity: number,
        unit: string,
    ): number {
        const conversionTable = {
            сметана: { 'столова ложка': 15, 'чайна ложка': 5, г: 1 },
            майонез: { 'столова ложка': 15, 'чайна ложка': 5, г: 1 },
            олія: { 'столова ложка': 15, 'чайна ложка': 5, мл: 1 },
            масло: { 'столова ложка': 15, 'чайна ложка': 5, г: 1 },
            кетчуп: { 'столова ложка': 15, 'чайна ложка': 5, г: 1 },
            гарнір: { 'столова ложка': 15, 'чайна ложка': 5, г: 1 },
        };

        const key = sauceName.toLowerCase();
        const conv = conversionTable[key] || { 'столова ложка': 15, 'чайна ложка': 5, г: 1 };

        return quantity * (conv[unit] || 1);
    }

    /**
     * Оцінює вагу їжи на основі діаметра тарілки
     */
    estimateWeightByPlate(diameterCm: number, fillPercentage: number): number {
        // Стандартна тарілка 23см - 300-400g максимум
        // Більша тарілка - більше їжи
        const standardDiameter = 23;
        const volumeMultiplier = Math.pow(diameterCm / standardDiameter, 2);
        const baseWeight = 350 * volumeMultiplier;

        return Math.round(baseWeight * fillPercentage);
    }

    /**
     * Рахує гліцемічний індекс
     */
    calculateGlycemicIndex(
        foodItems: Array<{ name: string; grams: number }>,
    ): number {
        const foodGiTable = {
            рис: { gi: 68, portion: 100 },
            хліб: { gi: 70, portion: 30 },
            банан: { gi: 51, portion: 120 },
            яблуко: { gi: 36, portion: 100 },
            салат: { gi: 15, portion: 100 },
            курка: { gi: 0, portion: 100 },
            яйця: { gi: 0, portion: 50 },
            картопля: { gi: 78, portion: 100 },
            макарони: { gi: 50, portion: 100 },
            каша: { gi: 55, portion: 150 },
        };

        let totalGi = 0;
        let totalWeight = 0;

        foodItems.forEach((item) => {
            const key = item.name.toLowerCase();
            const foodData = foodGiTable[key] || { gi: 50, portion: 100 };
            const giContribution = foodData.gi * (item.grams / foodData.portion);

            totalGi += giContribution;
            totalWeight += item.grams;
        });

        return Math.round(totalGi / (totalWeight / 100));
    }

    /**
     * Визначає ступінь інсулінорезистентності
     */
    calculateInsulinResistanceLevel(
        carbsGrams: number,
        glycemicIndex: number,
        fiberGrams: number,
    ): 'Низька' | 'Середня' | 'Висока' {
        // Glycemic Load = (GI × carbs) / 100
        const glycemicLoad = (glycemicIndex * carbsGrams) / 100;

        // Чим вище fiber, тим краще
        const fiberScore = fiberGrams > 5 ? 1 : fiberGrams > 2 ? 0.5 : 0;

        const score = glycemicLoad - fiberScore;

        if (score < 15) return 'Низька';
        if (score < 25) return 'Середня';
        return 'Висока';
    }

    /**
     * Оцінює баланс макросів (0-1, де 1 = ідеальний)
     */
    calculateMacroBalance(proteinG: number, fatG: number, carbsG: number): number {
        const proteinCal = proteinG * 4;
        const fatCal = fatG * 9;
        const carbsCal = carbsG * 4;
        const totalCal = proteinCal + fatCal + carbsCal;

        // Ідеальне співвідношення: 30% білків, 30% жирів, 40% вуглеводів
        const idealProtein = totalCal * 0.3;
        const idealFat = totalCal * 0.3;
        const idealCarbs = totalCal * 0.4;

        const proteinDiff = Math.abs(proteinCal - idealProtein);
        const fatDiff = Math.abs(fatCal - idealFat);
        const carbsDiff = Math.abs(carbsCal - idealCarbs);

        const totalDiff = proteinDiff + fatDiff + carbsDiff;
        const maxDiff = totalCal;

        return Math.max(0, 1 - totalDiff / maxDiff);
    }
}