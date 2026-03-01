import { NextRequest, NextResponse } from 'next/server';
import { scrapeProductUrl } from '@/lib/firecrawl';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import Replicate from 'replicate';

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

// Schema for input validation
const generateUrlSchema = z.object({
    url: z.string().url(),
    aspectRatio: z.string().default("16:9"),
    duration: z.string().default("5"),
    resolution: z.string().default("720p"),
});

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const validationResult = generateUrlSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validationResult.error.format() },
                { status: 400 }
            );
        }

        const { url, aspectRatio, duration, resolution } = validationResult.data;

        // 1. Scrape the URL
        const productData = await scrapeProductUrl(url);

        if (!productData) {
            return NextResponse.json(
                { error: 'Failed to scrape product data' },
                { status: 422 }
            );
        }

        // 2. Generate a video prompt using LLM
        // We compose a prompt for the video generation model
        const systemPrompt = `You are an expert video director. 
    Create a detailed text-to-video prompt for a marketing video based on the product information provided.
    The prompt should be descriptive, engaging, and suitable for AI video generation models like Runway or Sora.
    Focus on visual details, lighting, camera movement, and the key selling points of the product.
    Keep the prompt under 500 characters if possible, but detailed enough.
    Output ONLY the prompt text.`;

        const userMessage = `Product Title: ${productData.title}
    Product Description: ${productData.description}
    Images: ${productData.images.slice(0, 3).join(', ')}
    
    Target Duration: ${duration} seconds.
    Aspect Ratio: ${aspectRatio}.
    `;

        const { text: videoPrompt } = await (async () => {
            const input = {
                prompt: userMessage,
                system_prompt: systemPrompt,
                max_tokens: 1024,
            };
            const output = await replicate.run("openai/gpt-4o", { input });
            const text = Array.isArray(output) ? output.join('') : String(output);
            return { text: text };
        })();

        // 3. Return the generated prompt (and potentially scraped images) to the client
        // For now, we return the data so the client can trigger the "Text-to-Video" flow with this pre-filled data
        // Or we could trigger generation directly here. 
        // Given existing architecture likely uses client-side polling or specific flow, 
        // returning the prompt to pre-fill the "Text to Video" input or automatically starting it is a good UX.

        return NextResponse.json({
            success: true,
            data: {
                scraped: productData,
                generatedPrompt: videoPrompt,
                // We can pass this back to the client to immediately trigger the video generation
                // or redirect to the text-to-video page with these params
            }
        });

    } catch (error) {
        console.error('Error in /api/generate/url:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
