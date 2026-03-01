import { replicate } from '@/lib/replicate';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { consumeCredits } from '@/credits/credits';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json(
            { error: 'Prediction ID is required' },
            { status: 400 }
        );
    }

    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session?.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const prediction = await replicate.predictions.get(id);

        if (prediction?.error) {
            // Check if it's a "credit insufficient" error or similar from replicate (unlikely)
            return NextResponse.json(
                { error: prediction.error },
                { status: 500 }
            );
        }

        if (prediction?.status === 'succeeded') {
            const input = (prediction.input as any) || {};
            const duration = Number(input.duration) || 5;
            const height = Number(input.height) || 720; // Default to 720 if likely missing

            let multiplier = 1;
            if (height >= 1080) multiplier = 2;
            else if (height >= 720) multiplier = 1.5;

            const baseCostPerSec = 10;
            const cost = Math.ceil(baseCostPerSec * duration * multiplier);

            // Deduct credits if not already deducted (handled by consumeCredits with paymentId)
            await consumeCredits({
                userId: session.user.id,
                amount: cost,
                description: `Video Generation (Success): ${duration}s @ ${height}p`,
                paymentId: prediction.id
            });
        }

        return NextResponse.json(prediction);
    } catch (error) {
        console.error('Error fetching prediction:', error);
        return NextResponse.json(
            { error: 'Failed to fetch prediction' },
            { status: 500 }
        );
    }
}
