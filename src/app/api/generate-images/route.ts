import type { GenerateImageRequest } from '@/ai/image/lib/api-types';
import { consumeCredits, hasEnoughCredits } from '@/credits/credits';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getSession } from '@/lib/server';
import { replicate } from '@ai-sdk/replicate';
import {
  type ImageModel,
  experimental_generateImage as generateImage,
} from 'ai';
import { type NextRequest, NextResponse } from 'next/server';

// Allow longer duration for image generation (up to 2 minutes)
export const maxDuration = 120;

/**
 * Intended to be slightly less than the maximum execution time allowed by the
 * runtime so that we can gracefully terminate our request.
 */
const TIMEOUT_MILLIS = 120 * 1000; // Increased timeout for image processing

interface ProviderConfig {
  createImageModel: (modelId: string) => ImageModel;
  dimensionFormat: 'size' | 'aspectRatio';
}

// Keep only replicate configuration
const providerConfig: Record<string, ProviderConfig> = {
  replicate: {
    createImageModel: replicate.image,
    dimensionFormat: 'size',
  },
};

const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMillis: number
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeoutMillis)
    ),
  ]);
};

// Download image from URL and upload to R2 storage
async function downloadAndUploadToR2(
  imageUrl: string,
  requestId?: string
): Promise<string> {
  try {
    console.log(
      `[R2 Upload] Downloading image from: ${imageUrl} [requestId=${requestId}]`
    );

    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);

    // Upload to R2 storage
    const { uploadFile } = await import('@/storage');
    const result = await uploadFile(
      buffer,
      `ai-output-${Date.now()}.jpg`,
      'image/jpeg',
      'ai-generations'
    );

    console.log(
      `[R2 Upload] Uploaded to R2: ${result.url} [requestId=${requestId}]`
    );
    return result.url;
  } catch (error) {
    console.error('[R2 Upload] Error:', error);
    throw error;
  }
}

// Upload a base64 image to Replicate Files API to obtain a temporary CDN URL
// NOTE: Temporarily disabled - using frontend ONNX models instead
async function uploadImageToReplicate(
  imageBase64: string,
  requestId?: string
): Promise<string> {
  // Temporarily disabled - return error instead
  throw new Error(
    'Replicate API upload is temporarily disabled. Please use frontend background removal instead.'
  );

  /* COMMENTED OUT - Replicate API upload temporarily disabled
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('Missing REPLICATE_API_TOKEN');

  const match = imageBase64.match(/^data:(.*?);base64,(.*)$/);
  const mime = match?.[1] || 'image/png';
  const b64 =
    match?.[2] || imageBase64.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');

  const buffer = Buffer.from(b64, 'base64');
  try {
    console.log(
      `[ReplicateFiles Upload]${requestId ? ` [requestId=${requestId}]` : ''} mime=${mime}, base64Length=${b64.length}`
    );
  } catch {}
  const blob = new Blob([buffer], { type: mime });
  const form = new FormData();
  form.append('content', blob, `upload.${mime.split('/')[1] || 'png'}`);

  const res = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to upload image to Replicate: ${res.status} ${text}`
    );
  }
  const json: any = await res.json();
  // Prefer documented urls.get; fallback to url if present
  const url: string | undefined = json?.urls?.get || json?.url;
  try {
    console.log(
      `[ReplicateFiles Uploaded]$${requestId ? ` [requestId=${requestId}]` : ''} id=${json?.id ?? 'n/a'}, url=${url}`
    );
  } catch {}
  if (!url) throw new Error('Upload response missing URL');
  return url;
  */
}

// Create and poll a prediction using the model endpoint (no explicit version required)
async function runReplicatePrediction(
  modelPath: string,
  input: Record<string, unknown>,
  timeoutMs: number,
  requestId?: string
): Promise<any> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('Missing REPLICATE_API_TOKEN');

  const start = Date.now();
  try {
    console.log(
      `[Replicate Predict]${requestId ? ` [requestId=${requestId}]` : ''} model=${modelPath}, inputKeys=${Object.keys(input).join(',')}`
    );

    // Log detailed input parameters
    console.log(
      `[Replicate Predict Details]${requestId ? ` [requestId=${requestId}]` : ''}`,
      {
        modelPath,
        input: input,
        timestamp: new Date().toISOString(),
      }
    );

    const p = (input as any)?.prompt;
    if (typeof p === 'string') {
      console.log(
        `[Replicate Predict] promptPreview="${p.slice(0, 100)}${p.length > 100 ? '…' : ''}"`
      );
    }
    const imgs = (input as any)?.image_input;
    if (Array.isArray(imgs)) {
      console.log(`[Replicate Predict] image_input count=${imgs.length}`);
      console.log('[Replicate Predict] image_input urls=', imgs);
    }
  } catch {}
  /* COMMENTED OUT - Replicate API requests temporarily disabled
  console.log(
    `[Replicate API Request]${requestId ? ` [requestId=${requestId}]` : ''}`,
    {
      url: `https://api.replicate.com/v1/models/${modelPath}/predictions`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token?.substring(0, 10)}...`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    }
  );

  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${modelPath}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    }
  );
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create prediction: ${createRes.status} ${text}`);
  }
  const created: any = await createRes.json();
  try {
    console.log(
      `[Replicate Predict Created]${requestId ? ` [requestId=${requestId}]` : ''} id=${created?.id ?? 'n/a'}, status=${created?.status ?? 'n/a'}`
    );
  } catch {}
  const getUrl: string | undefined = created?.urls?.get;
  const id: string | undefined = created?.id;
  if (!getUrl && !id) throw new Error('Prediction response missing id/url');

  // Poll until status is succeeded or failed/canceled
  while (true) {
    if (Date.now() - start > timeoutMs) throw new Error('Request timed out');
    await new Promise((r) => setTimeout(r, 1500));

    const statusRes = await fetch(
      getUrl || `https://api.replicate.com/v1/predictions/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!statusRes.ok) {
      const text = await statusRes.text();
      throw new Error(
        `Failed to fetch prediction: ${statusRes.status} ${text}`
      );
    }
    const statusJson: any = await statusRes.json();
    const status: string = statusJson?.status;
    try {
      console.log(
        `[Replicate Predict Poll]${requestId ? ` [requestId=${requestId}]` : ''} id=${id ?? 'n/a'}, status=${status}`
      );
    } catch {}
    if (status === 'succeeded') return statusJson;
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Prediction ${status}`);
    }
  }
  */

  // Temporarily disabled - return error instead
  throw new Error(
    'Replicate API requests are temporarily disabled. Please use frontend background removal instead.'
  );
}

export async function POST(req: NextRequest) {
  // Check authentication
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized - Please login to generate images' },
      { status: 401 }
    );
  }

  // Check if user has enough credits (1 credit per image generation)
  const hasEnough = await hasEnoughCredits({
    userId: session.user.id,
    requiredCredits: 1,
  });
  if (!hasEnough) {
    return NextResponse.json(
      {
        error:
          'Insufficient credits - Please purchase more credits to generate images',
      },
      { status: 402 }
    );
  }

  const requestId = Math.random().toString(36).substring(7);
  const { prompt, modelId, imageBase64, imageUrl } =
    (await req.json()) as GenerateImageRequest;

  console.log(`[Generate Images API] [requestId=${requestId}]`, {
    prompt:
      prompt?.substring(0, 100) + (prompt && prompt.length > 100 ? '...' : ''),
    modelId,
    hasImageBase64: !!imageBase64,
    imageUrl,
    timestamp: new Date().toISOString(),
  });

  try {
    // Check if this is google/nano-banana model
    const isNanoBanana = modelId === 'google/nano-banana';
    const professionalPrompt =
      'Create a LinkedIn-style professional headshot of the person in the uploaded image, dressed in a suit or business casual, neutral background, clean lighting, realistic portrait photography.';
    const effectivePrompt =
      prompt?.trim() || (isNanoBanana ? professionalPrompt : '');

    // Validate required fields (allow empty prompt for nano-banana; we inject default)
    if (!modelId || (!effectivePrompt && !isNanoBanana)) {
      const error = 'Invalid request parameters';
      console.error(`${error} [requestId=${requestId}]`);
      return NextResponse.json({ error }, { status: 400 });
    }

    if (isNanoBanana && !imageBase64 && !imageUrl) {
      const error = 'Image upload is required for google/nano-banana model';
      console.error(`${error} [requestId=${requestId}]`);
      return NextResponse.json({ error }, { status: 400 });
    }

    const startstamp = performance.now();

    let result: any;

    if (isNanoBanana) {
      const generatePromise = (async () => {
        // 1) Use R2 URL if available, otherwise upload to Replicate
        let replicateImageUrl: string;
        if (imageUrl) {
          // Use R2 URL directly
          replicateImageUrl = imageUrl;
          console.log(
            `[Replicate] Using R2 URL: ${imageUrl} [requestId=${requestId}]`
          );
        } else if (imageBase64) {
          // Fallback to uploading base64 to Replicate
          replicateImageUrl = await uploadImageToReplicate(
            imageBase64,
            requestId
          );
        } else {
          throw new Error('No image provided for nano-banana model');
        }

        // 2) Run prediction with nano-banana using the image URL
        const predictionInput = {
          prompt: effectivePrompt || professionalPrompt,
          image_input: [replicateImageUrl],
          aspect_ratio: 'match_input_image',
          output_format: 'jpg',
        };

        console.log(`[Replicate Prediction Input] [requestId=${requestId}]`, {
          modelId,
          input: predictionInput,
          imageUrl: replicateImageUrl,
          timestamp: new Date().toISOString(),
        });

        const prediction = await runReplicatePrediction(
          modelId,
          predictionInput,
          TIMEOUT_MILLIS,
          requestId
        );

        // 3) Extract final output URL
        // Replicate returns output possibly as array of URLs or single URL depending on model
        const output = prediction?.output;
        const replicateOutputUrl: string | undefined = Array.isArray(output)
          ? output.find((o: any) => typeof o === 'string')
          : typeof output === 'string'
            ? output
            : prediction?.urls?.get; // fallback

        if (!replicateOutputUrl) {
          throw new Error('No output URL received from Replicate');
        }

        try {
          console.log(
            `[Replicate Predict Done]${requestId ? ` [requestId=${requestId}]` : ''} id=${prediction?.id ?? 'n/a'}, replicateOutputUrl=${replicateOutputUrl}`
          );
        } catch {}

        // 4) Download Replicate output and upload to R2
        console.log(
          `[R2 Upload] Starting upload of Replicate output to R2 [requestId=${requestId}]`
        );
        const r2OutputUrl = await downloadAndUploadToR2(
          replicateOutputUrl,
          requestId
        );

        console.log(
          `Completed nano-banana request [requestId=${requestId}, model=${modelId}, elapsed=${(
            (performance.now() - startstamp) / 1000
          ).toFixed(1)}s, r2OutputUrl=${r2OutputUrl}].`
        );

        return {
          provider: 'replicate',
          image: r2OutputUrl, // Return R2 URL instead of Replicate URL
        };
      })();

      result = await withTimeout(generatePromise, TIMEOUT_MILLIS);
    } else {
      // Handle other models
      const generatePromise = generateImage({
        model: replicate.image(modelId),
        prompt: effectivePrompt,
        size: '1024x1024',
        seed: Math.floor(Math.random() * 1000000),
        providerOptions: { vertex: { addWatermark: false } },
      }).then(async ({ image, warnings }) => {
        if (warnings?.length > 0) {
          console.warn(
            `Warnings [requestId=${requestId}, provider=replicate, model=${modelId}]: `,
            warnings
          );
        }

        // Convert base64 to buffer and upload to R2
        const base64Data = image.base64.replace(
          /^data:image\/[a-z]+;base64,/,
          ''
        );
        const buffer = Buffer.from(base64Data, 'base64');

        const { uploadFile } = await import('@/storage');
        const result = await uploadFile(
          buffer,
          `ai-output-${Date.now()}.jpg`,
          'image/jpeg',
          'ai-generations'
        );

        console.log(
          `[R2 Upload] Uploaded other model output to R2: ${result.url} [requestId=${requestId}]`
        );

        console.log(
          `Completed image request [requestId=${requestId}, provider=replicate, model=${modelId}, elapsed=${(
            (performance.now() - startstamp) / 1000
          ).toFixed(1)}s, r2OutputUrl=${result.url}].`
        );

        return {
          provider: 'replicate',
          image: result.url, // Return R2 URL instead of base64
        };
      });

      result = await withTimeout(generatePromise, TIMEOUT_MILLIS);
    }

    // Consume 1 credit after successful image generation
    if ('image' in result && result.image) {
      try {
        await consumeCredits({
          userId: session.user.id,
          amount: 1,
          description: `Image generation: ${modelId}`,
        });
        console.log(
          `[Generate Images API] [requestId=${requestId}] Consumed 1 credit for user ${session.user.id}`
        );
      } catch (error) {
        console.error(
          `[Generate Images API] [requestId=${requestId}] Failed to consume credits:`,
          error
        );
        // Don't fail the request if credit consumption fails, but log it
      }
    }

    return NextResponse.json(result, {
      status: 'image' in result ? 200 : 500,
    });
  } catch (error) {
    // Log full error detail on the server, but return a generic error message
    // to avoid leaking any sensitive information to the client.
    console.error(
      `Error generating image [requestId=${requestId}, provider=replicate, model=${modelId}]: `,
      error
    );
    return NextResponse.json(
      {
        error: 'Failed to generate image. Please try again later.',
      },
      { status: 500 }
    );
  }
}
