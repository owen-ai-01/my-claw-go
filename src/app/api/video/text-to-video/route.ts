import { replicate } from '@/lib/replicate';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { consumeCredits, hasEnoughCredits } from '@/credits/credits';

export async function POST(req: Request) {
  try {
    // 1. Auth Check
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { prompt, aspectRatio = "16:9", resolution = "720p", image, duration = 5 } = await req.json();
    const userId = session.user.id;

    console.log('[API] Video Generation Request:', {
      userId,
      prompt,
      aspectRatio,
      resolution,
      duration,
      hasImage: !!image,
      imageUrl: image
    });

    if (!prompt && !image) {
      return NextResponse.json(
        { error: 'Prompt or Image is required' },
        { status: 400 }
      );
    }

    // 2. Cost Calculation
    const baseCostPerSec = 10;
    const durationSec = duration;

    let multiplier = 1;
    if (resolution === "720p") multiplier = 1.5;
    if (resolution === "1080p") multiplier = 2;

    const cost = Math.ceil(baseCostPerSec * durationSec * multiplier);


    // 3. Credit Check (No deduction here)
    const hasCredits = await hasEnoughCredits({ userId, requiredCredits: cost });
    if (!hasCredits) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }

    // Helper to calculate dimensions
    const getDimensions = (ratio: string, res: string) => {
      // Base heights for 16:9 (Landscape)
      const heights: Record<string, number> = {
        "1080p": 1080,
        "720p": 720,
        "480p": 480
      };

      const baseH = heights[res] || 720;
      let width, height;

      if (ratio === "16:9") {
        // 720p -> 1280x720
        width = Math.round(baseH * (16 / 9));
        height = baseH;
      } else if (ratio === "9:16") {
        // Reverse of 16:9
        width = baseH;
        height = Math.round(baseH * (16 / 9));
      } else if (ratio === "1:1") {
        // Square
        const s = res === "1080p" ? 1024 : res === "720p" ? 768 : 512;
        width = s;
        height = s;
      } else if (ratio === "4:3") {
        // 4:3
        width = Math.round(baseH * (4 / 3));
        height = baseH;
      } else if (ratio === "3:4") {
        // 3:4
        width = baseH;
        height = Math.round(baseH * (4 / 3));
      } else if (ratio === "21:9") {
        // 21:9
        width = Math.round(baseH * (21 / 9));
        height = baseH;
      } else if (ratio === "9:21") {
        // 9:21
        width = baseH;
        height = Math.round(baseH * (21 / 9));
      } else {
        // Default 16:9 720p
        width = 1280;
        height = 720;
      }

      // Ensure multiples of 16 for better compatibility
      return {
        width: Math.round(width / 16) * 16,
        height: Math.round(height / 16) * 16
      };
    };

    const { width, height } = getDimensions(aspectRatio, resolution);

    // Bytedance Seedance 1 Pro Fast
    // https://replicate.com/bytedance/seedance-1-pro-fast
    const model = "bytedance/seedance-1-pro-fast";

    const input: any = {
      prompt: prompt || "Animated video", // Provide default if only image
      width,
      height,
      duration: duration || 5, // Default to 5s if not provided
      target_fps: 24, // Standard fps for smooth video
    };

    if (image) {
      input.image = image;
    }

    console.log('[API] Replicate Input:', JSON.stringify(input, null, 2));

    const prediction = await replicate.predictions.create({
      // @ts-ignore
      version: model,
      input,
      webhook: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/replicate?userId=${userId}`,
      webhook_events_filter: ["completed"],
    });

    console.log('[API] Replicate Prediction Created:', JSON.stringify(prediction, null, 2));

    return NextResponse.json(prediction, { status: 201 });
  } catch (error) {
    console.error('Error creating video generation:', error);
    return NextResponse.json(
      { error: 'Failed to create video generation' },
      { status: 500 }
    );
  }
}
