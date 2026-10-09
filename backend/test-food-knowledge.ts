import { PrismaService } from './prisma/prisma.service';

async function main() {
    const prisma = new PrismaService();

    const food = await prisma.foodKnowledge.create({
        data: {
            name: 'гречка',
            calories: 343,
            protein: 13.3,
            fat: 3.4,
            carbohydrates: 71.5,
            fiber: 10,
            source: 'test',
        },
    });

    console.log(food);

    await prisma.$disconnect();
}

main().catch(console.error);