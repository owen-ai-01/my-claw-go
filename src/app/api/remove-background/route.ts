import { auth } from '@/lib/auth'; // Import auth
import { validateTurnstileToken } from '@/lib/captcha';
import { type NextRequest, NextResponse, after } from 'next/server';

// Allow longer duration for background removal (up to 5 minutes)
export const maxDuration = 300;

/**
 * Remove background using Replicate's men1scus/birefnet model
 * No login required, but protected by Turnstile Captcha
 */
export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const apiStartTime = Date.now();
  const { imageBase64, imageUrl, token } = await req.json();

  // Check for session
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  // If no session, enforce Turnstile
  if (!session) {
    if (!token) {
      return NextResponse.json(
        { error: 'Captcha-Überprüfung fehlgeschlagen (fehlendes Token)' },
        { status: 401 }
      );
    }

    const isHuman = await validateTurnstileToken(token);
    if (!isHuman) {
      return NextResponse.json(
        { error: 'Captcha-Überprüfung fehlgeschlagen' },
        { status: 401 }
      );
    }
  }

  if (!imageBase64 && !imageUrl) {
    return NextResponse.json(
      { error: 'Bild ist erforderlich' },
      { status: 400 }
    );
  }

  console.log(
    `[Remove Background API] [requestId=${requestId}] Incoming request`,
    {
      hasImageBase64: !!imageBase64,
      imageUrl,
      timestamp: new Date().toISOString(),
    }
  );

  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error('Missing REPLICATE_API_TOKEN');

    // Upload image to Replicate if needed
    let replicateImageUrl: string;
    if (imageUrl) {
      replicateImageUrl = imageUrl;
      console.log(
        `[Replicate] Using R2 URL: ${imageUrl} [requestId=${requestId}]`
      );
    } else if (imageBase64) {
      // Upload base64 to Replicate Files API
      const match = imageBase64.match(/^data:(.*?);base64,(.*)$/);
      const mime = match?.[1] || 'image/png';
      const b64 =
        match?.[2] ||
        imageBase64.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');

      const buffer = Buffer.from(b64, 'base64');
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
      replicateImageUrl = json?.urls?.get || json?.url;
      if (!replicateImageUrl) throw new Error('Upload response missing URL');
    } else {
      throw new Error('No image provided');
    }

    // Run prediction with men1scus/birefnet model
    // Try using /v1/predictions endpoint with version ID if model path doesn't work
    const modelPath = 'men1scus/birefnet';
    const input = {
      image: replicateImageUrl,
    };

    const requestBody = {
      input: input,
    };

    // Log request parameters
    console.log(`[Replicate Prediction Request] [requestId=${requestId}]`, {
      model: modelPath,
      requestBody: JSON.stringify(requestBody, null, 2),
      imageUrl: replicateImageUrl,
      timestamp: new Date().toISOString(),
    });

    // Try model path first, if it fails, we'll try version ID
    const replicateStartTime = Date.now();

    let createRes = await fetch(
      `https://api.replicate.com/v1/models/${modelPath}/predictions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    // If model path returns 404, try using /v1/predictions with version lookup
    if (!createRes.ok && createRes.status === 404) {
      console.log(
        `[Replicate] Model path not found, trying to get model version [requestId=${requestId}]`
      );

      // First, try to get the model info to find the latest version
      const modelInfoRes = await fetch(
        `https://api.replicate.com/v1/models/${modelPath}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log(`[Replicate Model Info Response] [requestId=${requestId}]`, {
        status: modelInfoRes.status,
        statusText: modelInfoRes.statusText,
      });

      if (modelInfoRes.ok) {
        const modelInfo: any = await modelInfoRes.json();
        console.log(`[Replicate Model Info] [requestId=${requestId}]`, {
          modelInfo: JSON.stringify(modelInfo, null, 2),
        });

        const latestVersion = modelInfo?.latest_version?.id;

        if (latestVersion) {
          console.log(
            `[Replicate] Using version ID: ${latestVersion} [requestId=${requestId}]`
          );

          const versionRequestBody = {
            version: latestVersion,
            input: input,
          };

          console.log(
            `[Replicate Prediction Request with Version] [requestId=${requestId}]`,
            {
              version: latestVersion,
              requestBody: JSON.stringify(versionRequestBody, null, 2),
            }
          );

          // Use /v1/predictions with version ID
          createRes = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(versionRequestBody),
          });
        } else {
          console.error(
            `[Replicate] No latest version found in model info [requestId=${requestId}]`
          );
        }
      } else {
        const modelInfoText = await modelInfoRes.text();
        console.error(
          `[Replicate Model Info Failed] [requestId=${requestId}]`,
          {
            status: modelInfoRes.status,
            statusText: modelInfoRes.statusText,
            responseBody: modelInfoText,
          }
        );
      }
    }

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error(
        `[Replicate Prediction Create Failed] [requestId=${requestId}]`,
        {
          status: createRes.status,
          statusText: createRes.statusText,
          responseBody: text,
        }
      );
      throw new Error(
        `Failed to create prediction: ${createRes.status} ${text}`
      );
    }

    const created: any = await createRes.json();

    // Log response from creating prediction
    console.log(
      `[Replicate Prediction Create Response] [requestId=${requestId}]`,
      {
        responseBody: JSON.stringify(created, null, 2),
        predictionId: created?.id,
        status: created?.status,
        urls: created?.urls,
      }
    );

    const predictionId = created?.id;
    const getUrl = created?.urls?.get;

    if (!predictionId && !getUrl) {
      throw new Error('Vorhersage-Antwort fehlt id/url');
    }

    // Poll until status is succeeded or failed
    const replicatePollStartTime = Date.now();
    const timeoutMs = 120 * 1000; // 2 minutes timeout

    while (true) {
      if (Date.now() - replicatePollStartTime > timeoutMs) {
        throw new Error('Request timed out');
      }

      // Adaptive polling: Check faster initially
      const pollInterval =
        Date.now() - replicatePollStartTime < 3000 ? 500 : 1000;
      await new Promise((r) => setTimeout(r, pollInterval));

      const statusRes = await fetch(
        getUrl || `https://api.replicate.com/v1/predictions/${predictionId}`,
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
      const status = statusJson?.status;

      // Log polling response
      console.log(`[Replicate Poll Response] [requestId=${requestId}]`, {
        status: status,
        responseBody: JSON.stringify(statusJson, null, 2),
        output: statusJson?.output,
      });

      if (status === 'succeeded') {
        // Extract output URL
        const output = statusJson?.output;
        const outputUrl: string | undefined = Array.isArray(output)
          ? output.find((o: any) => typeof o === 'string')
          : typeof output === 'string'
            ? output
            : undefined;

        if (!outputUrl) {
          console.error(`[Replicate No Output URL] [requestId=${requestId}]`, {
            output: output,
            fullResponse: JSON.stringify(statusJson, null, 2),
          });
          throw new Error('Keine Ausgabe-URL von Replicate erhalten');
        }

        const replicateEndTime = Date.now();

        // Log successful output + timing
        console.log(
          `[Replicate Prediction Succeeded] [requestId=${requestId}]`,
          {
            outputUrl: outputUrl,
            fullOutput: output,
            timings: {
              // 从接口开始到创建 prediction 请求发出之间的时间（一般很短）
              createRequestLatencyMs: replicateStartTime - apiStartTime,
              // 从创建 prediction 后到 Replicate 返回成功为止（排队 + 处理）
              replicateProcessingMs: replicateEndTime - replicateStartTime,
            },
          }
        );

        // Upload to R2 in the background using Next.js 15 after()
        // This allows we to return the Replicate URL immediately to the user for faster display
        // while ensuring the image is persisted to R2.
        after(async () => {
          try {
            const downloadAndUploadStartTime = Date.now();
            console.log(
              `[Background R2 Upload] Starting for requestId=${requestId}`
            );

            const response = await fetch(outputUrl);
            if (!response.ok) {
              throw new Error(
                `Failed to download image: ${response.status} ${response.statusText}`
              );
            }
            const imageBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(imageBuffer);

            const { uploadFile } = await import('@/storage');
            const result = await uploadFile(
              buffer,
              `bg-removed-${Date.now()}.png`,
              'image/png',
              'ai-generations'
            );

            const r2OutputUrl = result.url;
            const downloadAndUploadEndTime = Date.now();

            console.log(
              `[Background R2 Upload] Completed for requestId=${requestId}`,
              {
                r2OutputUrl,
                durationMs:
                  downloadAndUploadEndTime - downloadAndUploadStartTime,
              }
            );
          } catch (error) {
            console.error(
              `[Background R2 Upload] Failed for requestId=${requestId}:`,
              error
            );
          }
        });

        const apiEndTime = Date.now();
        console.log(
          `[Remove Background API] [requestId=${requestId}] Timing summary (Optimized)`,
          {
            timingsMs: {
              totalApiDuration: apiEndTime - apiStartTime,
              replicateProcessing: replicateEndTime - replicateStartTime,
            },
            timingsSeconds: {
              totalApiDuration: (apiEndTime - apiStartTime) / 1000,
              replicateProcessing:
                (replicateEndTime - replicateStartTime) / 1000,
            },
            outputUrl, // Returning Replicate URL now
          }
        );

        return NextResponse.json({
          success: true,
          image: outputUrl, // Return Replicate URL immediately
        });
      }

      if (status === 'failed' || status === 'canceled') {
        throw new Error(`Prediction ${status}`);
      }
    }
  } catch (error) {
    console.error(
      `Error removing background [requestId=${requestId}]: `,
      error
    );
    return NextResponse.json(
      {
        error:
          'Hintergrundentfernung fehlgeschlagen. Bitte versuche es später erneut.',
      },
      { status: 500 }
    );
  }
}
