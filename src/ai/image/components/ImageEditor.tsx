'use client';

import type { KonvaEventObject } from 'konva/lib/Node';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
} from 'react-konva';

interface ImageEditorProps {
  mainImageUrl: string | null;
  backgroundColor: string | null;
  backgroundImageUrl: string | null;
  showGrid: boolean;
  isEraserMode?: boolean;
  eraserSize?: number;
  onImageTransform?: (transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  }) => void;
  initialTransform?: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  };
  stageRef?: React.RefObject<any>;
}

// Checkerboard pattern for transparent background
const createCheckerboardPattern = (size = 20): HTMLImageElement | null => {
  // Only create pattern in browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Light gray background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, size * 2, size * 2);

    // Dark gray squares
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, 0, size, size);
    ctx.fillRect(size, size, size, size);

    const img = new window.Image();
    img.src = canvas.toDataURL();
    return img;
  } catch (error) {
    console.error('Failed to create checkerboard pattern:', error);
    return null;
  }
};

export function ImageEditor({
  mainImageUrl,
  backgroundColor,
  backgroundImageUrl,
  showGrid,
  isEraserMode = false,
  eraserSize = 20,
  onImageTransform,
  initialTransform,
  stageRef: externalStageRef,
}: ImageEditorProps) {
  const [stageSize, setStageSize] = useState({ width: 600, height: 400 });
  const [mainImage, setMainImage] = useState<HTMLImageElement | null>(null);
  const [backgroundImage, setBackgroundImage] =
    useState<HTMLImageElement | null>(null);
  const [checkerboardPattern, setCheckerboardPattern] =
    useState<HTMLImageElement | null>(null);
  const [imageTransform, setImageTransform] = useState({
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
  });
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [eraserMask, setEraserMask] = useState<HTMLImageElement | null>(null);
  const [eraserMaskCanvas, setEraserMaskCanvas] =
    useState<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [eraserLines, setEraserLines] = useState<number[][]>([]);
  const [maskUpdateCounter, setMaskUpdateCounter] = useState(0);
  const maskUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const internalStageRef = useRef<any>(null);
  const stageRef = externalStageRef || internalStageRef;
  const mainImageRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const eraserLayerRef = useRef<any>(null);

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [containerDimensions, setContainerDimensions] = useState({
    width: 0,
    height: 0,
  });

  // Handle stage resizing to fit container
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width > 0 && height > 0) {
          setContainerDimensions({ width, height });
        }
      }
    };

    // Initial size
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Load main image
  useEffect(() => {
    if (!mainImageUrl) {
      console.log('[ImageEditor] No mainImageUrl provided');
      setMainImage(null);
      return;
    }

    // Clean up previous blob URL if exists
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    console.log('[ImageEditor] Loading main image from URL:', mainImageUrl);

    // Reset error and loading state
    setImageLoadError(null);
    setIsLoadingImage(true);
    setMainImage(null);

    // Use proxy API to avoid CORS and CSP issues
    const loadImageViaProxy = () => {
      // Check if URL is from R2 storage (needs proxy)
      const isR2Url = mainImageUrl.includes('.r2.dev');
      const isCustomDomain = mainImageUrl.includes('hintergrundentfernenki.de');

      // Use proxy for R2 URLs and custom domain, direct for others
      const imageUrl =
        isR2Url || isCustomDomain
          ? `/api/proxy-image?url=${encodeURIComponent(mainImageUrl)}`
          : mainImageUrl;

      const img = new window.Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        console.log(
          '[ImageEditor] Main image loaded, dimensions:',
          img.width,
          'x',
          img.height
        );
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          setMainImage(img);
          setIsLoadingImage(false);
          setImageLoadError(null);
          console.log('[ImageEditor] Main image loaded');
        } else {
          setIsLoadingImage(false);
          setImageLoadError('Image loaded but invalid dimensions');
        }
      };

      img.onerror = (err) => {
        console.error('[ImageEditor] Failed to load main image:', {
          error: err,
          originalUrl: mainImageUrl,
          proxyUrl: imageUrl,
          isR2Url: mainImageUrl.includes('.r2.dev'),
          isCustomDomain: mainImageUrl.includes('hintergrundentfernenki.de'),
        });
        setMainImage(null);
        setIsLoadingImage(false);
        setImageLoadError(
          `Failed to load image from ${mainImageUrl}. Please check the URL or try again.`
        );
      };

      console.log('[ImageEditor] Setting image source:', {
        originalUrl: mainImageUrl,
        proxyUrl: imageUrl,
        isR2Url: mainImageUrl.includes('.r2.dev'),
        isCustomDomain: mainImageUrl.includes('hintergrundentfernenki.de'),
      });
      img.src = imageUrl;
    };

    // Start loading via proxy
    loadImageViaProxy();

    // Cleanup function
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [mainImageUrl]);

  // Load background image
  useEffect(() => {
    if (!backgroundImageUrl) {
      setBackgroundImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBackgroundImage(img);
    };
    img.onerror = () => {
      console.error('Failed to load background image');
      setBackgroundImage(null);
    };
    img.src = backgroundImageUrl;
  }, [backgroundImageUrl]);

  // Initialize checkerboard pattern (only on client)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCheckerboardPattern(createCheckerboardPattern(20));
    }
  }, []);

  // Initialize eraser mask canvas when eraser mode is enabled
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      mainImage &&
      mainImage.complete &&
      isEraserMode
    ) {
      console.log('[ImageEditor] Initializing eraser mask', {
        imgWidth: mainImage.naturalWidth || mainImage.width,
        imgHeight: mainImage.naturalHeight || mainImage.height,
        isEraserMode,
      });

      const canvas = document.createElement('canvas');
      const imgWidth = mainImage.naturalWidth || mainImage.width;
      const imgHeight = mainImage.naturalHeight || mainImage.height;
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Start with white (fully opaque)
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, imgWidth, imgHeight);
      }

      setEraserMaskCanvas(canvas);

      // Create an Image object from the canvas for Konva
      const maskImage = new window.Image();
      maskImage.src = canvas.toDataURL();
      maskImage.onload = () => {
        console.log('[ImageEditor] Eraser mask image loaded');
        setEraserMask(maskImage);
        setEraserLines([]);
        setMaskUpdateCounter(0);
      };
    } else if (!isEraserMode) {
      // Reset mask when eraser mode is disabled
      setEraserMask(null);
      setEraserMaskCanvas(null);
      setEraserLines([]);
    }
  }, [mainImage, isEraserMode]);

  // Stage size is now set based on image dimensions, no need for container-based sizing

  // Scale image to fit within stage size, maintaining aspect ratio
  // Since stage size matches image size, scale should be 1
  useEffect(() => {
    if (
      mainImage &&
      mainImage.complete &&
      mainImage.naturalWidth > 0 &&
      mainImage.naturalHeight > 0
    ) {
      const imgWidth = mainImage.naturalWidth;
      const imgHeight = mainImage.naturalHeight;

      // Set stage size to match image dimensions
      setStageSize({ width: imgWidth, height: imgHeight });

      // Reset transform to 1:1 if no initial transform
      if (!initialTransform) {
        setImageTransform({
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
        });
      }
    }
  }, [mainImage, initialTransform]);

  // Notify parent of transform changes

  // Notify parent of transform changes
  useEffect(() => {
    if (onImageTransform) {
      onImageTransform(imageTransform);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageTransform]);

  const handleDragEnd = useCallback((e: KonvaEventObject<DragEvent>) => {
    const node = e.target;
    setImageTransform({
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
  }, []);

  const handleTransformEnd = useCallback((e: KonvaEventObject<Event>) => {
    const node = e.target;
    setImageTransform({
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
  }, []);

  // Function to update mask image from canvas (throttled for performance)
  const updateMaskImage = useCallback(
    (canvas: HTMLCanvasElement, immediate = false) => {
      // Clear any pending update
      if (maskUpdateTimeoutRef.current) {
        clearTimeout(maskUpdateTimeoutRef.current);
        maskUpdateTimeoutRef.current = null;
      }

      const update = () => {
        const img = new window.Image();
        img.src = canvas.toDataURL();
        img.onload = () => {
          setEraserMask(img);
          setMaskUpdateCounter((prev) => prev + 1);
        };
      };

      if (immediate) {
        update();
      } else {
        // Throttle updates during mouse move
        maskUpdateTimeoutRef.current = setTimeout(update, 16); // ~60fps
      }
    },
    []
  );

  // Eraser drawing handlers
  const handleEraserMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (!isEraserMode || !mainImage || !eraserMaskCanvas) {
        console.log('[ImageEditor] Eraser mouse down blocked', {
          isEraserMode,
          hasMainImage: !!mainImage,
          hasMaskCanvas: !!eraserMaskCanvas,
        });
        return;
      }
      e.cancelBubble = true;
      setIsDrawing(true);
      const stage = e.target.getStage();
      if (!stage) return;

      const point = stage.getPointerPosition();
      if (!point) return;

      // Convert stage coordinates to image coordinates
      const imgWidth = mainImage.naturalWidth || mainImage.width;
      const imgHeight = mainImage.naturalHeight || mainImage.height;
      const scaleX = imageTransform.scaleX;
      const scaleY = imageTransform.scaleY;

      const imgX = (point.x - imageTransform.x) / scaleX;
      const imgY = (point.y - imageTransform.y) / scaleY;

      console.log('[ImageEditor] Eraser mouse down', {
        point,
        imgX,
        imgY,
        imgWidth,
        imgHeight,
      });

      if (imgX >= 0 && imgX <= imgWidth && imgY >= 0 && imgY <= imgHeight) {
        // Initialize first point and draw it
        const ctx = eraserMaskCanvas.getContext('2d');
        if (ctx) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = 'black';
          ctx.beginPath();
          ctx.arc(imgX, imgY, eraserSize / 2, 0, Math.PI * 2);
          ctx.fill();
          console.log('[ImageEditor] Drew first eraser point');
          updateMaskImage(eraserMaskCanvas, true); // Immediate update on mouse down
        }
        setEraserLines([[imgX, imgY]]);
      }
    },
    [
      isEraserMode,
      mainImage,
      imageTransform,
      eraserMaskCanvas,
      eraserSize,
      updateMaskImage,
    ]
  );

  const handleEraserMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (!isEraserMode || !isDrawing || !mainImage || !eraserMaskCanvas)
        return;

      const stage = e.target.getStage();
      if (!stage) return;

      const point = stage.getPointerPosition();
      if (!point) return;

      // Convert stage coordinates to image coordinates
      const imgWidth = mainImage.naturalWidth || mainImage.width;
      const imgHeight = mainImage.naturalHeight || mainImage.height;
      const scaleX = imageTransform.scaleX;
      const scaleY = imageTransform.scaleY;

      const imgX = (point.x - imageTransform.x) / scaleX;
      const imgY = (point.y - imageTransform.y) / scaleY;

      if (imgX >= 0 && imgX <= imgWidth && imgY >= 0 && imgY <= imgHeight) {
        // Update mask canvas
        const ctx = eraserMaskCanvas.getContext('2d');
        if (ctx) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = 'black';
          ctx.strokeStyle = 'black';

          // Draw circle at current point
          ctx.beginPath();
          ctx.arc(imgX, imgY, eraserSize / 2, 0, Math.PI * 2);
          ctx.fill();

          // If we have previous points, draw line
          setEraserLines((prev) => {
            const newLines = [...prev, [imgX, imgY]];
            if (prev.length > 0) {
              const lastPoint = prev[prev.length - 1];
              ctx.beginPath();
              ctx.moveTo(lastPoint[0], lastPoint[1]);
              ctx.lineTo(imgX, imgY);
              ctx.lineWidth = eraserSize;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.stroke();
            }
            // Update mask image to trigger Konva re-render
            updateMaskImage(eraserMaskCanvas);
            return newLines;
          });
        }
      }
    },
    [
      isEraserMode,
      isDrawing,
      mainImage,
      eraserMaskCanvas,
      imageTransform,
      eraserSize,
      updateMaskImage,
    ]
  );

  const handleEraserMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Calculate background size and position
  const getBackgroundSize = () => {
    if (backgroundImage) {
      const imageAspect = backgroundImage.width / backgroundImage.height;
      const stageAspect = stageSize.width / stageSize.height;

      if (imageAspect > stageAspect) {
        // Image is wider - fit to width
        return {
          width: stageSize.width,
          height: stageSize.width / imageAspect,
          x: 0,
          y: (stageSize.height - stageSize.width / imageAspect) / 2,
        };
      } else {
        // Image is taller - fit to height
        return {
          width: stageSize.height * imageAspect,
          height: stageSize.height,
          x: (stageSize.width - stageSize.height * imageAspect) / 2,
          y: 0,
        };
      }
    }
    return { width: stageSize.width, height: stageSize.height, x: 0, y: 0 };
  };

  const bgSize = getBackgroundSize();

  // Debug: Log current state (must be before any conditional returns)
  useEffect(() => {
    console.log('[ImageEditor] Current state:', {
      mainImageUrl,
      hasMainImage: !!mainImage,
      mainImageDimensions: mainImage
        ? `${mainImage.width}x${mainImage.height}`
        : 'N/A',
      mainImageComplete: mainImage?.complete,
      stageSize,
      imageTransform,
      stageRefExists: !!stageRef.current,
      stageContainer: stageRef.current?.container() ? 'exists' : 'missing',
    });
  }, [mainImageUrl, mainImage, stageSize, imageTransform]);

  // Show loading state during SSR or before mount
  if (!isMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted rounded-lg min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-sm text-muted-foreground">Loading editor...</p>
      </div>
    );
  }

  if (!mainImageUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg min-h-[400px]">
        <p className="text-muted-foreground">No image URL provided</p>
      </div>
    );
  }

  // Show error state
  if (imageLoadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted rounded-lg min-h-[400px] p-8">
        <p className="text-destructive font-medium mb-2">Error loading image</p>
        <p className="text-sm text-muted-foreground text-center">
          {imageLoadError}
        </p>
        <p className="text-xs text-muted-foreground mt-4 break-all">
          {mainImageUrl}
        </p>
      </div>
    );
  }

  // Show loading state
  if (isLoadingImage || (!mainImage && mainImageUrl)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted rounded-lg min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-sm text-muted-foreground">Loading image...</p>
      </div>
    );
  }

  // Add a fallback display if Konva doesn't work
  if (mainImage && mainImageUrl && !mainImage.complete) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground">Loading image...</p>
        </div>
      </div>
    );
  }

  // Get device pixel ratio for high DPI displays
  const pixelRatio =
    typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center"
      style={{
        cursor: isEraserMode
          ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21'/%3E%3Cpath d='M22 21H7'/%3E%3Cpath d='m5 11 9 9'/%3E%3C/svg%3E\") 12 12, auto"
          : 'default',
        // Fix: Use flex to center the stage, allow stage to be smaller than container
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
      }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          // object-fit: contain behavior for the canvas
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
        }}
        pixelRatio={pixelRatio}
      >
        {/* Background Layer */}
        <Layer pixelRatio={pixelRatio}>
          {/* Default: transparent background (checkerboard) */}
          {!backgroundColor && !backgroundImageUrl ? (
            // Default: show checkerboard pattern for transparent background
            checkerboardPattern ? (
              <Rect
                width={stageSize.width}
                height={stageSize.height}
                fillPatternImage={checkerboardPattern}
                fillPatternScaleX={1}
                fillPatternScaleY={1}
              />
            ) : (
              <Rect
                width={stageSize.width}
                height={stageSize.height}
                fill="#f0f0f0"
              />
            )
          ) : backgroundColor ? (
            // Solid color background
            <Rect
              width={stageSize.width}
              height={stageSize.height}
              fill={backgroundColor}
            />
          ) : backgroundImage && backgroundImageUrl ? (
            // Background image
            <KonvaImage image={backgroundImage} {...bgSize} listening={false} />
          ) : // Fallback: checkerboard for transparent background
          checkerboardPattern ? (
            <Rect
              width={stageSize.width}
              height={stageSize.height}
              fillPatternImage={checkerboardPattern}
              fillPatternScaleX={1}
              fillPatternScaleY={1}
            />
          ) : (
            <Rect
              width={stageSize.width}
              height={stageSize.height}
              fill="#f0f0f0"
            />
          )}
        </Layer>

        {/* Main Image Layer - This should be on top of background */}
        {mainImage && mainImage.complete ? (
          <Layer pixelRatio={pixelRatio}>
            <Group
              ref={mainImageRef}
              draggable={!isEraserMode}
              x={imageTransform.x}
              y={imageTransform.y}
              scaleX={imageTransform.scaleX}
              scaleY={imageTransform.scaleY}
              onDragEnd={handleDragEnd}
              onTransformEnd={handleTransformEnd}
            >
              <Group>
                <KonvaImage
                  image={mainImage}
                  width={mainImage.naturalWidth || mainImage.width}
                  height={mainImage.naturalHeight || mainImage.height}
                  listening={!isEraserMode}
                  onLoad={() => console.log('[ImageEditor] KonvaImage loaded')}
                />
                {eraserMask && isEraserMode && (
                  <KonvaImage
                    key={`mask-${maskUpdateCounter}`}
                    image={eraserMask}
                    width={mainImage.naturalWidth || mainImage.width}
                    height={mainImage.naturalHeight || mainImage.height}
                    globalCompositeOperation="destination-in"
                    listening={false}
                  />
                )}
              </Group>
            </Group>
          </Layer>
        ) : mainImageUrl ? (
          <Layer>
            <Rect
              width={stageSize.width}
              height={stageSize.height}
              fill="#f0f0f0"
            />
          </Layer>
        ) : null}

        {/* Eraser Layer - for drawing eraser strokes */}
        {isEraserMode &&
          mainImage &&
          mainImage.complete &&
          eraserMaskCanvas && (
            <Layer ref={eraserLayerRef} pixelRatio={pixelRatio}>
              {/* Transparent rect to capture mouse events */}
              <Rect
                width={stageSize.width}
                height={stageSize.height}
                fill="transparent"
                listening={true}
                onMouseDown={handleEraserMouseDown}
                onMouseMove={handleEraserMouseMove}
                onMouseUp={handleEraserMouseUp}
                onMouseLeave={handleEraserMouseUp}
              />
              <Group
                x={imageTransform.x}
                y={imageTransform.y}
                scaleX={imageTransform.scaleX}
                scaleY={imageTransform.scaleY}
                listening={false}
              >
                {/* Draw eraser preview circle */}
                {isDrawing && eraserLines.length > 0 && (
                  <Line
                    points={eraserLines.flat()}
                    stroke="rgba(255, 0, 0, 0.5)"
                    strokeWidth={eraserSize}
                    lineCap="round"
                    lineJoin="round"
                    listening={false}
                  />
                )}
              </Group>
            </Layer>
          )}
      </Stage>
    </div>
  );
}
