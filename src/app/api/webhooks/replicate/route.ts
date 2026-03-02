import { NextResponse } from 'next/server';

import { consumeCredits } from '@/credits/credits';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const prediction = await req.json();

    // Here you would typically update your database with the result
    // For now we just log it as we haven't set up the DB schema for videos yet
    console.log('Replicate webhook received:', prediction);

    if (prediction.status === 'succeeded') {
      // Handle success (save URL, notify user via websocket/SSE if applicable)
      console.log('Video generated:', prediction.output);

      if (userId) {
        const input = (prediction.input as any) || {};
        const duration = Number(input.duration) || 5;
        const height = Number(input.height) || 720; // Default to 720 if likely missing

        let multiplier = 1;
        if (height >= 1080) multiplier = 2;
        else if (height >= 720) multiplier = 1.5;

        const baseCostPerSec = 10;
        const cost = Math.ceil(baseCostPerSec * duration * multiplier);

        try {
          await consumeCredits({
            userId,
            amount: cost,
            description: `Video Generation (Webhook): ${duration}s @ ${height}p`,
            paymentId: prediction.id,
          });
          console.log(
            `Credits consumed for user ${userId}, paymentId: ${prediction.id}`
          );
        } catch (err) {
          console.error('Error consuming credits in webhook:', err);
        }
      } else {
        console.warn('No userId provided in webhook, cannot consume credits');
      }
    } else if (prediction.status === 'failed') {
      // Handle failure
      console.error('Generation failed:', prediction.error);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
