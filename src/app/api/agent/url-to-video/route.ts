import { NextRequest, NextResponse } from 'next/server';
import { UrlToVideoAgent } from '@/lib/agent/url-processor';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { consumeCredits, hasEnoughCredits } from '@/credits/credits';

// Fixed cost for 60s video generation
const VIDEO_COST = 100;

export async function POST(req: NextRequest) {
    try {
        // 1. Auth Check
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session?.user) {
            return NextResponse.json(
                { error: 'Unauthorized', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        const userId = session.user.id;

        // 2. Credit Check
        const hasCredits = await hasEnoughCredits({ userId, requiredCredits: VIDEO_COST });
        if (!hasCredits) {
            return NextResponse.json(
                { error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS', required: VIDEO_COST },
                { status: 402 }
            );
        }

        const { url, aspectRatio, resolution, duration } = await req.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        const encoder = new TextEncoder();
        let videoGenerationSucceeded = false;
        const requestId = `urlvideo_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const stream = new ReadableStream({
            async start(controller) {
                const agent = new UrlToVideoAgent(url, (state) => {
                    // Send state updates to the client
                    const chunk = JSON.stringify(state) + '\n';
                    controller.enqueue(encoder.encode(chunk));

                    // Track if video generation succeeded
                    if (state.status === 'completed' && state.videoUrl) {
                        videoGenerationSucceeded = true;
                    }
                }, {
                    aspectRatio: aspectRatio || '16:9',
                    resolution: resolution || '720p',
                    duration: duration || 60
                });

                try {
                    await agent.process();

                    // 3. Deduct credits only on success
                    if (videoGenerationSucceeded) {
                        await consumeCredits({
                            userId,
                            amount: VIDEO_COST,
                            description: `URL to Video Generation (60s)`,
                            paymentId: requestId
                        });
                    }
                } catch (error) {
                    console.error('Agent processing error:', error);
                    controller.enqueue(encoder.encode(JSON.stringify({ status: 'failed', error: 'Unknown server error' }) + '\n'));
                } finally {
                    controller.close();
                }
            },
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error) {
        console.error('URL to Video API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
