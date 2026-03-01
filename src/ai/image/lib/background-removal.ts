/**
 * Client-side background removal using U²-Net / MODNet ONNX models
 *
 * This implementation uses onnxruntime-web for running ONNX models in the browser.
 * Models can be loaded from CDN (e.g., Hugging Face) or local /public/models/ directory.
 */

import * as ort from 'onnxruntime-web';

// Model type
type ModelType = 'u2net' | 'modnet';

// Model configuration
interface ModelConfig {
  url: string;
  inputSize: number;
  type: ModelType;
}

// Default model configurations
const MODELS: Record<ModelType, ModelConfig> = {
  u2net: {
    // Using a publicly available U²-Net ONNX model
    // You can host this locally at /public/models/u2net.onnx or use your own CDN
    // Alternative models:
    // - https://github.com/levindabhi/onnx-models (hosted models)
    // - https://huggingface.co/briaai/RMBG-1.4-onnx (RMBG model, different from U²-Net)
    url: '/models/u2net.onnx', // Default to local model, will try CDN if local fails
    inputSize: 320,
    type: 'u2net',
  },
  modnet: {
    // Using MODNet ONNX model
    // You can host this locally at /public/models/modnet.onnx
    url: '/models/modnet.onnx', // Default to local model
    inputSize: 512,
    type: 'modnet',
  },
};

// Fallback CDN URLs if local models are not available
const CDN_FALLBACKS: Record<ModelType, string[]> = {
  u2net: [
    'https://github.com/levindabhi/onnx-models/raw/main/u2net/u2net.onnx',
    'https://raw.githubusercontent.com/levindabhi/onnx-models/main/u2net/u2net.onnx',
  ],
  modnet: [
    'https://github.com/ZHKKKe/MODNet/raw/master/onnx/model_repository/modnet_web/1/modnet.onnx',
    'https://raw.githubusercontent.com/ZHKKKe/MODNet/master/onnx/model_repository/modnet_web/1/modnet.onnx',
  ],
};

// Cache for loaded models
let modelSession: ort.InferenceSession | null = null;
let currentModelType: ModelType | null = null;

/**
 * Initialize and load ONNX model
 */
async function initONNXModel(
  modelType: ModelType = 'u2net'
): Promise<ort.InferenceSession> {
  // Return cached session if same model is already loaded
  if (modelSession && currentModelType === modelType) {
    return modelSession;
  }

  const modelConfig = MODELS[modelType];

  try {
    // Configure ONNX Runtime
    ort.env.wasm.simd = true;
    ort.env.wasm.numThreads = 1;

    // Try multiple execution providers: webgl (faster) -> wasm (more compatible)
    // WebGL may not be available in all browsers or contexts
    const loadOptions = {
      executionProviders: ['wasm'] as const,
      graphOptimizationLevel: 'all' as const,
    };

    // Try local model first
    console.log(
      `[Background Removal] Loading ${modelType} model from ${modelConfig.url}`
    );

    try {
      console.log(
        `[Background Removal] Attempting to load model from: ${modelConfig.url}`
      );

      // Fetch the model file first and load from ArrayBuffer
      // ONNX Runtime sometimes has issues with direct URL loading
      console.log('[Background Removal] Fetching model file as ArrayBuffer...');
      const fetchResponse = await fetch(modelConfig.url);
      if (!fetchResponse.ok) {
        throw new Error(
          `HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`
        );
      }
      const modelData = await fetchResponse.arrayBuffer();
      console.log(
        `[Background Removal] Model file fetched successfully (${modelData.byteLength} bytes)`
      );

      console.log(
        '[Background Removal] Creating ONNX session from ArrayBuffer...'
      );
      modelSession = await ort.InferenceSession.create(modelData, loadOptions);
      currentModelType = modelType;
      console.log(
        `[Background Removal] Model ${modelType} loaded successfully from local path`
      );
      console.log(
        '[Background Removal] Model input names:',
        modelSession.inputNames
      );
      console.log(
        '[Background Removal] Model output names:',
        modelSession.outputNames
      );
      return modelSession;
    } catch (localError) {
      console.warn(
        '[Background Removal] Local model failed, trying CDN fallbacks...'
      );
      console.warn('[Background Removal] Local error details:', {
        message:
          localError instanceof Error ? localError.message : String(localError),
        stack: localError instanceof Error ? localError.stack : undefined,
        url: modelConfig.url,
      });

      // Try CDN fallbacks
      const fallbacks = CDN_FALLBACKS[modelType];
      for (const cdnUrl of fallbacks) {
        try {
          console.log(`[Background Removal] Trying CDN: ${cdnUrl}`);
          modelSession = await ort.InferenceSession.create(cdnUrl, loadOptions);
          currentModelType = modelType;
          console.log(
            `[Background Removal] Model ${modelType} loaded successfully from CDN`
          );
          return modelSession;
        } catch (cdnError) {
          console.warn(
            `[Background Removal] CDN ${cdnUrl} failed, trying next...`
          );
        }
      }

      // All attempts failed
      throw new Error(
        `Failed to load ${modelType} model from local path and all CDN fallbacks`
      );
    }
  } catch (error) {
    console.error(
      `[Background Removal] Failed to load model ${modelType}:`,
      error
    );
    throw error;
  }
}

/**
 * Preprocess image for ONNX model input
 */
function preprocessImage(
  image: HTMLImageElement | HTMLCanvasElement,
  targetSize: number
): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Draw image to canvas with proper aspect ratio
  const aspectRatio = image.width / image.height;
  let drawWidth = targetSize;
  let drawHeight = targetSize;
  let offsetX = 0;
  let offsetY = 0;

  if (aspectRatio > 1) {
    // Width is larger
    drawHeight = targetSize / aspectRatio;
    offsetY = (targetSize - drawHeight) / 2;
  } else {
    // Height is larger or equal
    drawWidth = targetSize * aspectRatio;
    offsetX = (targetSize - drawWidth) / 2;
  }

  // Fill with white background (better for most segmentation models)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetSize, targetSize);

  // Draw image
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  // Get image data and normalize to [0, 1]
  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  const data = imageData.data;
  const tensor = new Float32Array(targetSize * targetSize * 3);

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    // Normalize RGB values to [0, 1] and rearrange to CHW format
    tensor[pixelIndex] = data[i] / 255.0; // R
    tensor[targetSize * targetSize + pixelIndex] = data[i + 1] / 255.0; // G
    tensor[2 * targetSize * targetSize + pixelIndex] = data[i + 2] / 255.0; // B
  }

  return tensor;
}

/**
 * Postprocess ONNX model output to create mask
 */
function postprocessMask(
  output: ort.Tensor,
  originalWidth: number,
  originalHeight: number,
  inputSize: number,
  invert = false
): ImageData {
  const maskData = output.data as Float32Array;
  const dims = output.dims;

  // Handle different output shapes: (1,1,H,W), (1,H,W), or (H,W)
  let maskHeight: number;
  let maskWidth: number;

  if (dims.length === 4) {
    // Shape: (batch, channel, height, width)
    maskHeight = dims[2];
    maskWidth = dims[3];
  } else if (dims.length === 3) {
    // Shape: (batch, height, width)
    maskHeight = dims[1];
    maskWidth = dims[2];
  } else if (dims.length === 2) {
    // Shape: (height, width)
    maskHeight = dims[0];
    maskWidth = dims[1];
  } else {
    // 1D array, assume square
    maskHeight = Math.sqrt(maskData.length);
    maskWidth = maskHeight;
  }

  const canvas = document.createElement('canvas');
  canvas.width = originalWidth;
  canvas.height = originalHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Create mask image data
  const maskImageData = ctx.createImageData(originalWidth, originalHeight);

  // Extract mask values from tensor
  // Handle different tensor layouts
  let maskValues: Float32Array;
  if (dims.length === 4) {
    // (batch, channel, height, width) or (batch, height, width, channel)
    if (dims[1] === 1) {
      // (1,1,H,W) -> extract the first channel
      const size = maskHeight * maskWidth;
      maskValues = maskData.slice(0, size);
    } else if (dims[3] === 1) {
      // (1,H,W,1) -> NHWC format, extract first channel
      const size = maskHeight * maskWidth;
      maskValues = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        maskValues[i] = maskData[i * dims[3]];
      }
    } else {
      // Use first channel if multiple channels
      const size = maskHeight * maskWidth * dims[1];
      maskValues = maskData.slice(0, maskHeight * maskWidth);
    }
  } else if (dims.length === 3) {
    // (1,H,W) or (H,W,1) -> skip batch dimension or channel dimension
    const size = maskHeight * maskWidth;
    if (dims[0] === 1) {
      // (1,H,W)
      maskValues = maskData.slice(0, size);
    } else {
      // (H,W,1) or (H,W)
      maskValues = maskData;
    }
  } else {
    maskValues = maskData;
  }

  // Use loop instead of spread operator to avoid stack overflow for large arrays
  let maskMin = maskValues[0];
  let maskMax = maskValues[0];
  for (let i = 1; i < maskValues.length; i++) {
    const val = maskValues[i];
    if (val < maskMin) maskMin = val;
    if (val > maskMax) maskMax = val;
  }
  console.log('[Background Removal] Mask values range:', {
    min: maskMin,
    max: maskMax,
    count: maskValues.length,
  });

  // Upscale mask to original image size using bilinear interpolation
  for (let y = 0; y < originalHeight; y++) {
    for (let x = 0; x < originalWidth; x++) {
      const maskX = (x / originalWidth) * maskWidth;
      const maskY = (y / originalHeight) * maskHeight;

      // Bilinear interpolation
      const x1 = Math.floor(maskX);
      const y1 = Math.floor(maskY);
      const x2 = Math.min(x1 + 1, maskWidth - 1);
      const y2 = Math.min(y1 + 1, maskHeight - 1);

      const fx = maskX - x1;
      const fy = maskY - y1;

      const idx11 = y1 * maskWidth + x1;
      const idx21 = y1 * maskWidth + x2;
      const idx12 = y2 * maskWidth + x1;
      const idx22 = y2 * maskWidth + x2;

      const v11 = maskValues[idx11] ?? 0;
      const v21 = maskValues[idx21] ?? 0;
      const v12 = maskValues[idx12] ?? 0;
      const v22 = maskValues[idx22] ?? 0;

      const v1 = v11 * (1 - fx) + v21 * fx;
      const v2 = v12 * (1 - fx) + v22 * fx;
      const maskValue = v1 * (1 - fy) + v2 * fy;

      const pixelIndex = (y * originalWidth + x) * 4;
      // Clamp mask value to [0, 1]
      const clampedValue = Math.max(0, Math.min(1, maskValue));

      // Set alpha channel based on mask value
      // MODNet/U²-Net: typically 1.0 = foreground (keep), 0.0 = background (remove)
      // But some models may output inverted values, so we support inversion
      maskImageData.data[pixelIndex] = 255; // R
      maskImageData.data[pixelIndex + 1] = 255; // G
      maskImageData.data[pixelIndex + 2] = 255; // B

      // Apply inversion if needed
      let finalValue = clampedValue;
      if (invert) {
        finalValue = 1.0 - clampedValue;
      }

      // Apply threshold to ensure clear separation
      // Values > threshold = foreground (keep), < threshold = background (remove)
      // Use a lower threshold (0.25) to be more conservative and preserve more foreground details
      const threshold = 0.25; // Lower threshold to preserve more foreground, reduce false removals
      let alpha = 0;

      if (finalValue > threshold) {
        // Foreground: scale from [threshold, 1.0] to [200, 255] for better preservation
        // Use 200-255 range to ensure foreground is clearly visible and reduce edge artifacts
        // Also handle values close to threshold with gradual alpha increase
        if (finalValue > 0.5) {
          // High confidence foreground: full opacity
          alpha = 255;
        } else {
          // Medium confidence: gradual alpha from threshold to 0.5
          alpha = Math.min(
            255,
            Math.floor(
              200 + ((finalValue - threshold) / (0.5 - threshold)) * 55
            )
          );
        }
      } else {
        // Background: make transparent
        alpha = 0;
      }

      maskImageData.data[pixelIndex + 3] = alpha; // A (0-255)
    }
  }

  return maskImageData;
}

/**
 * Apply mask to original image
 */
function applyMask(
  originalImage: HTMLImageElement | HTMLCanvasElement,
  mask: ImageData
): string {
  const canvas = document.createElement('canvas');
  canvas.width = originalImage.width;
  canvas.height = originalImage.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Draw original image
  ctx.drawImage(originalImage, 0, 0);

  // Get image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const maskPixels = mask.data;

  // Apply mask to alpha channel
  // Note: MODNet/U²-Net outputs mask where 1.0 = foreground (keep) and 0.0 = background (remove)
  for (let i = 0; i < pixels.length; i += 4) {
    const maskAlpha = maskPixels[i + 3]; // Get alpha from mask (0-255)
    // Use mask alpha directly: higher value = foreground (keep), lower value = background (remove)
    pixels[i + 3] = maskAlpha; // Apply to image alpha
  }

  // Put modified image data back
  ctx.putImageData(imageData, 0, 0);

  // Return as data URL
  return canvas.toDataURL('image/png');
}

/**
 * Remove background using ONNX model (U²-Net or MODNet)
 */
export async function removeBackgroundONNX(
  imageDataUrl: string,
  modelType: ModelType = 'u2net'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      try {
        console.log(
          `[Background Removal] Image loaded: ${img.width}x${img.height}`
        );
        // Load model
        const session = await initONNXModel(modelType);
        const modelConfig = MODELS[modelType];

        // Preprocess image
        const inputTensor = preprocessImage(img, modelConfig.inputSize);
        const inputShape = [1, 3, modelConfig.inputSize, modelConfig.inputSize];
        const tensor = new ort.Tensor('float32', inputTensor, inputShape);

        // Run inference
        console.log(
          `[Background Removal] Running inference with ${modelType}...`
        );
        const feeds: Record<string, ort.Tensor> = {};

        // Different models have different input names
        // Use the actual input name from the session
        const inputName = session.inputNames[0] || 'input';
        console.log(`[Background Removal] Using input name: ${inputName}`);
        feeds[inputName] = tensor;

        const outputMap = await session.run(feeds);

        // Get output tensor (usually named 'output' or similar)
        const outputTensor =
          outputMap.output || outputMap[Object.keys(outputMap)[0]];

        if (!outputTensor) {
          throw new Error('Failed to get output from model');
        }

        const outputData = outputTensor.data as Float32Array;
        // Use loop instead of spread operator to avoid stack overflow for large arrays
        let outputMin = outputData[0];
        let outputMax = outputData[0];
        let outputSum = 0;
        for (let i = 0; i < outputData.length; i++) {
          const val = outputData[i];
          if (val < outputMin) outputMin = val;
          if (val > outputMax) outputMax = val;
          outputSum += val;
        }
        const outputMean = outputSum / outputData.length;

        console.log(
          '[Background Removal] Model output shape:',
          outputTensor.dims
        );
        console.log('[Background Removal] Model output range:', {
          min: outputMin,
          max: outputMax,
          mean: outputMean,
        });

        // Postprocess mask
        // Check if mask needs inversion
        // MODNet typically outputs: 1.0 = foreground, 0.0 = background
        // U²-Net typically outputs: 1.0 = foreground, 0.0 = background
        // But some models may output inverted values
        // Use a very conservative approach: only invert if mean is extremely high (>0.9)
        // This ensures we don't accidentally invert a correct mask
        const needsInversion = outputMean > 0.9 && outputMax > 0.95; // Very conservative check to avoid false inversions
        console.log(
          '[Background Removal] Mask inversion needed:',
          needsInversion,
          '(mean:',
          outputMean.toFixed(3),
          ', max:',
          outputMax.toFixed(3),
          ')'
        );

        const mask = postprocessMask(
          outputTensor,
          img.width,
          img.height,
          modelConfig.inputSize,
          needsInversion
        );

        // Apply mask to original image
        const result = applyMask(img, mask);

        console.log('[Background Removal] Background removed successfully');
        console.log(
          '[Background Removal] Result data URL length:',
          result.length
        );

        if (!result || result.length < 100) {
          throw new Error('Failed to generate valid result');
        }

        resolve(result);
      } catch (error) {
        console.error(
          '[Background Removal] Error during ONNX inference:',
          error
        );
        console.error('[Background Removal] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        reject(error);
      }
    };

    img.onerror = (error) => {
      console.error('[Background Removal] Image load error:', error);
      reject(new Error('Failed to load image for background removal'));
    };
    img.src = imageDataUrl;
  });
}

/**
 * Remove background using improved edge detection and flood fill (fallback)
 * This is a better implementation that uses edge detection and flood fill from corners
 */
export async function removeBackgroundSimple(
  imageDataUrl: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw image to canvas
        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // Sample corner colors to determine background color
        const getPixelColor = (x: number, y: number) => {
          const idx = (y * width + x) * 4;
          return {
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
          };
        };

        // Sample corners and edges to estimate background color
        const samplePoints: Array<[number, number]> = [
          [0, 0],
          [width - 1, 0],
          [0, height - 1],
          [width - 1, height - 1],
          [Math.floor(width / 2), 0],
          [Math.floor(width / 2), height - 1],
          [0, Math.floor(height / 2)],
          [width - 1, Math.floor(height / 2)],
        ];

        // Get average background color from corners
        let avgR = 0;
        let avgG = 0;
        let avgB = 0;
        for (const [x, y] of samplePoints) {
          const color = getPixelColor(x, y);
          avgR += color.r;
          avgG += color.g;
          avgB += color.b;
        }
        avgR = Math.floor(avgR / samplePoints.length);
        avgG = Math.floor(avgG / samplePoints.length);
        avgB = Math.floor(avgB / samplePoints.length);

        // Calculate color distance threshold
        const threshold = 40;

        // Remove background based on color similarity
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Calculate color distance
          const colorDiff =
            Math.abs(r - avgR) + Math.abs(g - avgG) + Math.abs(b - avgB);

          // Also check if pixel is near edges (likely background)
          const pixelIndex = i / 4;
          const x = pixelIndex % width;
          const y = Math.floor(pixelIndex / width);
          const edgeDistance = Math.min(x, y, width - x, height - y);
          const isNearEdge = edgeDistance < Math.min(width, height) * 0.1;

          // If color is similar to background AND near edge, make transparent
          if (
            colorDiff < threshold ||
            (isNearEdge && colorDiff < threshold * 1.5)
          ) {
            data[i + 3] = 0; // Make transparent
          }
        }

        // Put modified data back
        ctx.putImageData(imageData, 0, 0);

        // Convert to data URL
        try {
          const resultDataUrl = canvas.toDataURL('image/png');
          if (!resultDataUrl || resultDataUrl.length < 100) {
            console.error(
              `[Background Removal] Invalid data URL length: ${resultDataUrl?.length || 0}`
            );
            throw new Error('Failed to generate valid data URL from canvas');
          }
          console.log(
            `[Background Removal] Simple method result length: ${resultDataUrl.length}`
          );
          resolve(resultDataUrl);
        } catch (toDataUrlError) {
          console.error(
            '[Background Removal] toDataURL failed:',
            toDataUrlError
          );
          // If toDataURL fails (e.g., CORS issue), try to create a blob URL instead
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to convert canvas to blob'));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              if (!dataUrl || dataUrl.length < 100) {
                reject(new Error('Failed to read blob as valid data URL'));
                return;
              }
              resolve(dataUrl);
            };
            reader.onerror = () =>
              reject(new Error('Failed to read blob as data URL'));
            reader.readAsDataURL(blob);
          }, 'image/png');
        }
      } catch (error) {
        console.error('[Background Removal] Simple method error:', error);
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
}

/**
 * Remove background with automatic fallback
 * Tries ONNX model first, falls back to simple method if ONNX fails
 */
export async function removeBackground(
  imageDataUrl: string,
  modelType: ModelType = 'u2net',
  useFallback = true
): Promise<string> {
  console.log(
    `[Background Removal] Starting background removal with ${modelType} model...`
  );

  try {
    console.log('[Background Removal] Attempting ONNX model...');
    const result = await removeBackgroundONNX(imageDataUrl, modelType);
    console.log('[Background Removal] ONNX model succeeded!');
    return result;
  } catch (error) {
    console.warn('[Background Removal] ONNX model failed, error:', error);
    console.warn(
      '[Background Removal] This is expected if model files are not available.'
    );

    if (useFallback) {
      console.log('[Background Removal] Falling back to simple method...');
      try {
        const result = await removeBackgroundSimple(imageDataUrl);
        console.log('[Background Removal] Simple method succeeded!');
        return result;
      } catch (fallbackError) {
        console.error(
          '[Background Removal] Both methods failed:',
          fallbackError
        );
        throw fallbackError;
      }
    }

    throw error;
  }
}
