import Replicate from 'replicate';
import type { Scene } from '@/lib/agent/url-processor';

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN
});

export interface BrandInfo {
    colors?: string[];
    style?: string;
}

/**
 * Generate an AI image for a video scene using Replicate's Flux model
 */
export async function generateSceneImage(
    scene: Scene,
    brandInfo?: BrandInfo
): Promise<string> {
    // Build the prompt
    let prompt = scene.visualPrompt;

    // Add brand information if provided
    if (brandInfo) {
        if (brandInfo.colors && brandInfo.colors.length > 0) {
            prompt += `, brand colors: ${brandInfo.colors.join(' and ')}`;
        }
        if (brandInfo.style) {
            prompt += `, ${brandInfo.style} style`;
        }
    }

    // Add quality modifiers
    prompt += ', professional, high quality, 16:9 aspect ratio, 4k, clean composition';

    console.log(`Generating image for scene ${scene.id}:`, prompt);

    try {
        // Use Flux Schnell (fast model) - use predictions.create for better control
        const prediction = await replicate.predictions.create({
            model: 'black-forest-labs/flux-schnell',
            input: {
                prompt: prompt,
                aspect_ratio: '16:9',
                output_format: 'png',
                num_outputs: 1
            }
        });

        console.log(`[DEBUG] Created prediction ${prediction.id}, status: ${prediction.status}`);

        // Wait for the prediction to complete
        let finalPrediction = prediction;
        while (finalPrediction.status !== 'succeeded' && finalPrediction.status !== 'failed') {
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
            finalPrediction = await replicate.predictions.get(prediction.id);
            console.log(`[DEBUG] Prediction ${prediction.id} status: ${finalPrediction.status}`);
        }

        if (finalPrediction.status === 'failed') {
            throw new Error(`Prediction failed: ${finalPrediction.error || 'Unknown error'}`);
        }

        console.log(`[DEBUG] Prediction succeeded, output:`, finalPrediction.output);

        // Extract URL from output
        const output = finalPrediction.output;
        let imageUrl: string | undefined;

        if (Array.isArray(output) && output.length > 0) {
            imageUrl = output[0];
            console.log(`[DEBUG] Extracted URL from output array:`, imageUrl);
        } else if (typeof output === 'string') {
            imageUrl = output;
            console.log(`[DEBUG] Output is direct string:`, imageUrl);
        } else {
            throw new Error(`Unexpected output format: ${JSON.stringify(output)}`);
        }

        // Validate URL
        if (!imageUrl || typeof imageUrl !== 'string') {
            throw new Error(
                `Failed to extract valid image URL.\n` +
                `Output: ${JSON.stringify(output)}`
            );
        }

        console.log(`✅ Generated image for scene ${scene.id}:`, imageUrl);
        return imageUrl;
    } catch (error) {
        console.error(`❌ Failed to generate image for scene ${scene.id}:`, error);
        throw error;
    }
}

/**
 * Generate images for multiple scenes in parallel
 */
export async function generateImagesForScenes(
    scenes: Scene[],
    brandInfo?: BrandInfo
): Promise<Map<string, string>> {
    const imageMap = new Map<string, string>();

    // Filter scenes that need AI-generated images
    const aiScenes = scenes.filter(scene => scene.visualType === 'ai_image');

    console.log(`Generating ${aiScenes.length} AI images...`);

    // Generate images in parallel (but limit concurrency to avoid rate limits)
    const batchSize = 3;
    for (let i = 0; i < aiScenes.length; i += batchSize) {
        const batch = aiScenes.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(aiScenes.length / batchSize)}`);

        const results = await Promise.allSettled(
            batch.map(scene => generateSceneImage(scene, brandInfo))
        );

        results.forEach((result, index) => {
            const scene = batch[index];
            if (result.status === 'fulfilled') {
                imageMap.set(scene.id, result.value);
                console.log(`✅ Scene ${scene.id}: ${result.value}`);
            } else {
                console.error(`❌ Failed to generate image for ${scene.id}:`, result.reason);
                // Use placeholder
                const placeholder = `https://placehold.co/1920x1080/png?text=Scene+${scene.sceneNumber}`;
                imageMap.set(scene.id, placeholder);
                console.log(`📦 Using placeholder for scene ${scene.id}`);
            }
        });
    }

    console.log(`Completed generating ${imageMap.size} images`);
    return imageMap;
}
