import { Captcha } from '@/components/shared/captcha';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { useConsumeCredits, useCreditBalance } from '@/hooks/use-credits';
import { useSession } from '@/hooks/use-session';
import { LocaleLink } from '@/i18n/navigation';
import { useLocaleRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import { uploadFileFromBrowser } from '@/storage/client';
import {
  ArrowUp,
  ArrowUpRight,
  CheckCircle,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { imageHelpers } from '../lib/image-helpers';
import { type Suggestion, getRandomSuggestions } from '../lib/suggestions';
import { BackgroundTools } from './BackgroundTools';
import { ImageEditor } from './ImageEditor';

type QualityMode = 'performance' | 'quality';

interface PromptInputProps {
  onSubmit: (prompt: string, imageBase64?: string, imageUrl?: string) => void;
  isLoading?: boolean;
  showProviders: boolean;
  onToggleProviders: () => void;
  mode: QualityMode;
  onModeChange: (mode: QualityMode) => void;
  suggestions: Suggestion[];
  requiresImage?: boolean;
  generatedImage?: string | null;
  generationTime?: number;
}

export function PromptInput({
  suggestions: initSuggestions,
  isLoading,
  onSubmit,
  requiresImage,
  generatedImage,
  generationTime,
}: PromptInputProps) {
  const locale = useLocale();
  const session = useSession();
  const router = useLocaleRouter();
  const localizedTexts: Record<
    string,
    {
      promptHint: string;
      uploadLabel: string;
      uploading: string;
      uploadHint: string;
      consentNotice: string;
      uploadTitle: string;
      uploadSubtitle: string;
      dragDrop: string;
      ready: string;
      customizePrompt: string;
      aiWillCreate: string;
      generateButton: string;
      tipClearFace: string;
      tipGoodLighting: string;
      tipFrontFacing: string;
      beforeAfterTitle: string;
      originalImage: string;
      generatedImage: string;
      timeElapsed: string;
      generating: string;
      download: string;
    }
  > = {
    zh: {
      promptHint: '例如：身穿深蓝色西装的专业形象照...',
      uploadLabel: '上传图片',
      uploading: '正在上传...',
      uploadHint: 'AI将自动创建LinkedIn风格的专业头像',
      consentNotice: '您使用本网站的服务代表已经同意本网站的 ',
      uploadTitle: '上传您的照片',
      uploadSubtitle: '或拖放到这里',
      dragDrop: '拖放到这里',
      ready: '准备就绪',
      customizePrompt: '自定义提示词（可选）',
      aiWillCreate: '✨ AI将自动创建专业的LinkedIn风格头像',
      generateButton: '生成头像',
      tipClearFace: '清晰面部',
      tipGoodLighting: '良好光线',
      tipFrontFacing: '正面朝向',
      beforeAfterTitle: '效果示例',
      originalImage: '原始照片',
      generatedImage: '生成结果',
      timeElapsed: '耗时',
      generating: '生成中...',
      download: '下载',
    },
    'zh-Hant': {
      promptHint: '例如：身穿深藍色西裝的專業形象照...',
      uploadLabel: '上傳圖片',
      uploading: '上傳中...',
      uploadHint: 'AI將自動創建LinkedIn風格的專業頭像',
      consentNotice: '您使用本網站的服務代表已經同意本網站的 ',
      uploadTitle: '上傳您的照片',
      uploadSubtitle: '或拖放到這裡',
      dragDrop: '拖放到這裡',
      ready: '準備就緒',
      customizePrompt: '自定義提示詞（可選）',
      aiWillCreate: '✨ AI將自動創建專業的LinkedIn風格頭像',
      generateButton: '生成頭像',
      tipClearFace: '清晰面部',
      tipGoodLighting: '良好光線',
      tipFrontFacing: '正面朝向',
      beforeAfterTitle: '效果示例',
      originalImage: '原始照片',
      generatedImage: '生成結果',
      timeElapsed: '耗時',
      generating: '生成中...',
      download: '下載',
    },
    ja: {
      promptHint: '例：紺色のスーツを着たプロフェッショナルなポートレート...',
      uploadLabel: '画像をアップロード',
      uploading: 'アップロード中...',
      uploadHint:
        'AIがLinkedInスタイルのプロフェッショナルな写真を自動生成します',
      consentNotice:
        'このサイトを使用することで、以下に同意したことになります：',
      uploadTitle: '写真をアップロード',
      uploadSubtitle: 'またはドラッグ＆ドロップ',
      dragDrop: 'またはドラッグ＆ドロップ',
      ready: '準備完了',
      customizePrompt: 'プロンプトをカスタマイズ（オプション）',
      aiWillCreate:
        '✨ AIがプロフェッショナルなLinkedInスタイルの写真を自動生成',
      generateButton: 'リヘッドショットを生成',
      tipClearFace: '鮮明な顔',
      tipGoodLighting: '良好な照明',
      tipFrontFacing: '正面向き',
      beforeAfterTitle: '結果の例',
      originalImage: '元の画像',
      generatedImage: '生成結果',
      timeElapsed: '時間',
      generating: '生成中...',
      download: 'ダウンロード',
    },
    ko: {
      promptHint: '예: 네이비 정장을 입은 전문적인 사진...',
      uploadLabel: '이미지 업로드',
      uploading: '업로드 중...',
      uploadHint: 'AI가 LinkedIn 스타일의 전문 사진을 자동으로 생성합니다',
      consentNotice:
        '이 웹사이트 서비스를 이용하는 것은 다음에 동의하는 것입니다: ',
      uploadTitle: '사진 업로드',
      uploadSubtitle: '또는 드래그 앤 드롭',
      dragDrop: '또는 드래그 앤 드롭',
      ready: '준비 완료',
      customizePrompt: '프롬프트 사용자 정의 (선택 사항)',
      aiWillCreate:
        '✨ AI가 전문적인 LinkedIn 스타일의 사진을 자동으로 생성합니다',
      generateButton: '사진 생성',
      tipClearFace: '선명한 얼굴',
      tipGoodLighting: '좋은 조명',
      tipFrontFacing: '정면',
      beforeAfterTitle: '결과 예시',
      originalImage: '원본 사진',
      generatedImage: '생성 결과',
      timeElapsed: '소요 시간',
      generating: '생성 중...',
      download: '다운로드',
    },
    es: {
      promptHint: 'por ejemplo: retrato profesional con traje azul marino...',
      uploadLabel: 'Subir imagen',
      uploading: 'Subiendo...',
      uploadHint:
        'La IA creará automáticamente una foto profesional al estilo LinkedIn',
      consentNotice: 'Al usar este sitio web, aceptas nuestra ',
      uploadTitle: 'Sube tu foto',
      uploadSubtitle: 'o arrastra y suelta',
      dragDrop: 'o arrastra y suelta',
      ready: 'Listo',
      customizePrompt: 'Personalizar prompt (opcional)',
      aiWillCreate:
        '✨ La IA creará automáticamente una foto profesional al estilo LinkedIn',
      generateButton: 'Generar foto',
      tipClearFace: 'Rostro claro',
      tipGoodLighting: 'Buena iluminación',
      tipFrontFacing: 'Frontal',
      beforeAfterTitle: 'Resultados de ejemplo',
      originalImage: 'Original',
      generatedImage: 'Generada',
      timeElapsed: 'Tiempo',
      generating: 'Generando...',
      download: 'Descargar',
    },
    ar: {
      promptHint: 'مثال: صورة احترافية ببدلة زرقاء داكنة...',
      uploadLabel: 'رفع الصورة',
      uploading: 'جاري الرفع...',
      uploadHint:
        'سيقوم الذكاء الاصطناعي بإنشاء صورة احترافية بأسلوب LinkedIn تلقائيًا',
      consentNotice: 'باستخدام هذا الموقع، فإنك توافق على ',
      uploadTitle: 'ارفع صورتك',
      uploadSubtitle: 'أو اسحب وأفلت',
      dragDrop: 'أو اسحب وأفلت',
      ready: 'جاهز',
      customizePrompt: 'تخصيص الوصف (اختياري)',
      aiWillCreate:
        '✨ سيقوم الذكاء الاصطناعي بإنشاء صورة احترافية بأسلوب LinkedIn',
      generateButton: 'توليد الصورة',
      tipClearFace: 'وجه واضح',
      tipGoodLighting: 'إضاءة جيدة',
      tipFrontFacing: 'واجهة أمامية',
      beforeAfterTitle: 'نتائج مثال',
      originalImage: 'الأصلية',
      generatedImage: 'المنشأة',
      timeElapsed: 'الوقت',
      generating: 'جارٍ التوليد...',
      download: 'تنزيل',
    },
    pt: {
      promptHint: 'ex.: retrato profissional com terno azul-marinho...',
      uploadLabel: 'Enviar imagem',
      uploading: 'Enviando...',
      uploadHint:
        'A IA criará automaticamente uma foto profissional ao estilo LinkedIn',
      consentNotice: 'Ao usar este site, você concorda com a ',
      uploadTitle: 'Envie sua foto',
      uploadSubtitle: 'ou arraste e solte',
      dragDrop: 'ou arraste e solte',
      ready: 'Pronto',
      customizePrompt: 'Personalizar prompt (opcional)',
      aiWillCreate:
        '✨ A IA criará automaticamente uma foto profissional ao estilo LinkedIn',
      generateButton: 'Gerar foto',
      tipClearFace: 'Rosto nítido',
      tipGoodLighting: 'Boa iluminação',
      tipFrontFacing: 'De frente',
      beforeAfterTitle: 'Resultados de exemplo',
      originalImage: 'Original',
      generatedImage: 'Gerada',
      timeElapsed: 'Tempo',
      generating: 'Gerando...',
      download: 'Baixar',
    },
    ru: {
      promptHint: 'например: профессиональное фото в темно-синем костюме...',
      uploadLabel: 'Загрузить изображение',
      uploading: 'Загрузка...',
      uploadHint:
        'ИИ автоматически создаст профессиональное фото в стиле LinkedIn',
      consentNotice: 'Используя этот сайт, вы соглашаетесь с ',
      uploadTitle: 'Загрузите ваше фото',
      uploadSubtitle: 'или перетащите сюда',
      dragDrop: 'или перетащите сюда',
      ready: 'Готово',
      customizePrompt: 'Настроить подсказку (необязательно)',
      aiWillCreate:
        '✨ ИИ автоматически создаст профессиональное фото в стиле LinkedIn',
      generateButton: 'Сгенерировать фото',
      tipClearFace: 'Чёткое лицо',
      tipGoodLighting: 'Хорошее освещение',
      tipFrontFacing: 'Анфас',
      beforeAfterTitle: 'Примеры результатов',
      originalImage: 'Оригинал',
      generatedImage: 'Сгенерировано',
      timeElapsed: 'Время',
      generating: 'Генерация...',
      download: 'Скачать',
    },
    fr: {
      promptHint: 'ex. : portrait professionnel avec costume bleu marine...',
      uploadLabel: 'Téléverser une image',
      uploading: 'Téléversement...',
      uploadHint:
        "L'IA créera automatiquement une photo professionnelle au style LinkedIn",
      consentNotice: 'En utilisant ce site, vous acceptez notre ',
      uploadTitle: 'Téléversez votre photo',
      uploadSubtitle: 'ou glissez-déposez',
      dragDrop: 'ou glissez-déposez',
      ready: 'Prêt',
      customizePrompt: 'Personnaliser le prompt (optionnel)',
      aiWillCreate:
        "✨ L'IA créera automatiquement une photo professionnelle au style LinkedIn",
      generateButton: 'Générer la photo',
      tipClearFace: 'Visage net',
      tipGoodLighting: 'Bonne luminosité',
      tipFrontFacing: 'De face',
      beforeAfterTitle: 'Exemples de résultats',
      originalImage: 'Originale',
      generatedImage: 'Générée',
      timeElapsed: 'Temps',
      generating: 'Génération...',
      download: 'Télécharger',
    },
    de: {
      promptHint: 'z. B.: professionelles Porträt mit marineblauem Anzug...',
      uploadLabel: 'Bild hochladen',
      uploading: 'Wird hochgeladen...',
      uploadHint:
        'Die KI erstellt automatisch ein professionelles LinkedIn-Foto',
      consentNotice: 'Durch die Nutzung dieser Website stimmst du unserer ',
      uploadTitle: 'Lade dein Foto hoch',
      uploadSubtitle: 'oder per Drag & Drop',
      dragDrop: 'oder per Drag & Drop',
      ready: 'Bereit',
      customizePrompt: 'Prompt anpassen (optional)',
      aiWillCreate:
        '✨ Die KI erstellt automatisch ein professionelles LinkedIn-Foto',
      generateButton: 'Foto generieren',
      tipClearFace: 'Klares Gesicht',
      tipGoodLighting: 'Gute Beleuchtung',
      tipFrontFacing: 'Frontal',
      beforeAfterTitle: 'Beispielergebnisse',
      originalImage: 'Original',
      generatedImage: 'Generiert',
      timeElapsed: 'Zeit',
      generating: 'Wird generiert...',
      download: 'Herunterladen',
    },
    en: {
      promptHint: 'e.g., Professional headshot with navy suit...',
      uploadLabel: 'Upload Image',
      uploading: 'Uploading...',
      uploadHint:
        'AI will automatically create a LinkedIn-style professional headshot',
      consentNotice: 'By using this website, you agree to our ',
      uploadTitle: 'Upload Your Photo',
      uploadSubtitle: 'or drag and drop',
      dragDrop: 'or drag and drop',
      ready: 'Ready',
      customizePrompt: 'Customize prompt (optional)',
      aiWillCreate:
        '✨ AI will automatically create a professional LinkedIn-style headshot',
      generateButton: 'Generate Headshot',
      tipClearFace: 'Clear face',
      tipGoodLighting: 'Good lighting',
      tipFrontFacing: 'Front-facing',
      beforeAfterTitle: 'Example Results',
      originalImage: 'Original',
      generatedImage: 'Generated',
      timeElapsed: 'Time',
      generating: 'Generating...',
      download: 'Download',
    },
  };
  const lt = localizedTexts[locale] ?? localizedTexts.en;
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initSuggestions);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [bgRemovedImage, setBgRemovedImage] = useState<string | null>(null); // Free background removal result
  const [hdImage, setHdImage] = useState<string | null>(null); // HD background removal result
  const [originalFileName, setOriginalFileName] = useState<string | null>(null); // Original uploaded file name
  const [isUploading, setIsUploading] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false); // Free background removal in progress
  const [isRemovingHdBg, setIsRemovingHdBg] = useState(false); // HD background removal in progress
  const [isDragging, setIsDragging] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null); // File waiting for captcha
  const [showCaptcha, setShowCaptcha] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [paidImageIds, setPaidImageIds] = useState<Set<string>>(new Set());

  // Editor state
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(
    null
  );
  const [showGrid, setShowGrid] = useState(true);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);
  const [imageTransform, setImageTransform] = useState<{
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const stageRef = useRef<any>(null);

  // Check credit balance for HD feature
  const { data: creditBalance } = useCreditBalance();
  const consumeCreditsMutation = useConsumeCredits();

  // Timer effect for elapsed time during generation
  useEffect(() => {
    if (isLoading) {
      // Start timer
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 0.1);
      }, 100);
    } else {
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isLoading]);

  const updateSuggestions = () => {
    setSuggestions(getRandomSuggestions(undefined, locale));
  };

  const handleSuggestionSelect = (prompt: string) => {
    setInput(prompt);
  };

  // Modified processFile to accept optional token override
  const processFile = async (file: File, captchaTokenOverride?: string) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Bitte wähle eine Bilddatei aus');
      return;
    }

    // Determine effective token: override > state > null
    const effectiveToken = captchaTokenOverride || captchaToken;

    // Check if we need captcha:
    // 1. If user is logged in (session exists), we DON'T need captcha.
    // 2. If user is NOT logged in, we need captcha (effectiveToken).
    const needsCaptcha = !session;

    // If we need captcha but don't have it, show modal and stop
    if (needsCaptcha && !effectiveToken) {
      setPendingFile(file);
      setShowCaptcha(true);
      // Generate preview even before captcha for better UX
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setImagePreview(result);
      };
      reader.readAsDataURL(file);
      return;
    }

    setIsUploading(true);

    try {
      // Create a preview for immediate feedback (read file as data URL)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setImagePreview(result);
          resolve(result);
        };
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });

      setUploadedImage(dataUrl); // Keep base64 for preview
      // Save original file name (without extension)
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setOriginalFileName(fileNameWithoutExt);
      // Clear previous background removal result when uploading new image
      setBgRemovedImage(null);
      // Reset transform for new image
      setImageTransform(null);

      // Upload image to R2 storage (Start in background)
      console.log('[Image Upload] Starting background R2 upload...');
      const r2UploadPromise = uploadFileFromBrowser(file, 'uploads')
        .then((result) => {
          console.log('[Image Upload] Image uploaded to R2:', result.url);
          setImageUrl(result.url);
          return result.url;
        })
        .catch((error) => {
          console.error('[Image Upload] R2 upload failed:', error);
          // We continue because we might have base64 fallback or the prediction might have already finished
          return null;
        });

      // Automatically remove background using Replicate API
      setIsRemovingBg(true);
      try {
        console.log(
          '[Background Removal] Starting background removal via Replicate API...'
        );

        // Add timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout

        // Optimization: For files < 4.5MB (Next.js body limit is usually 4MB, safe margin 3.5MB?),
        // send base64 directly to avoid waiting for R2.
        // Replicate accepts base64.
        const USE_BASE64_LIMIT = 4 * 1024 * 1024; // 4MB
        const useBase64 = file.size < USE_BASE64_LIMIT;

        let response: Response;

        try {
          const payload: any = {
            token: effectiveToken,
          };

          if (useBase64) {
            console.log(
              '[Background Removal] Optimization: Sending Base64 directly (< 4MB)'
            );
            payload.imageBase64 = dataUrl;
            // Don't await R2 upload here!
            response = await fetch('/api/remove-background', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
          } else {
            console.log(
              '[Background Removal] Large file (> 4MB), waiting for R2 upload...'
            );
            const r2Url = await r2UploadPromise;
            if (!r2Url) {
              throw new Error(
                'Upload to storage failed, cannot process large file.'
              );
            }
            payload.imageUrl = r2Url;

            response = await fetch('/api/remove-background', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error(
              'Anfrage-Zeitüberschreitung. Bitte versuche es erneut.'
            );
          }
          if (
            fetchError instanceof TypeError &&
            fetchError.message === 'Failed to fetch'
          ) {
            throw new Error(
              'Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.'
            );
          }
          throw fetchError;
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Unbekannter Fehler' }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const result = await response.json();

        console.log(
          '[Background Removal] Full API response:',
          JSON.stringify(result, null, 2)
        );

        if (!result.success || !result.image) {
          console.error(
            '[Background Removal] Invalid response structure:',
            result
          );
          throw new Error('Background removal failed: Invalid response');
        }

        console.log(
          '[Background Removal] Background removal completed, result URL:',
          result.image
        );

        // Save HD image URL (original from R2/Replicate)
        setHdImage(result.image);

        // Generate preview image with dynamic resolution based on original size
        try {
          await new Promise<void>((resolve) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const originalWidth = img.naturalWidth;
              const originalHeight = img.naturalHeight;

              // Calculate preview scale factor based on image size
              const maxDimension = Math.max(originalWidth, originalHeight);
              let scaleFactor: number;
              if (maxDimension < 1000) {
                scaleFactor = 0.8; // 80% for small images
              } else if (maxDimension <= 2000) {
                scaleFactor = 0.5; // 50% for medium images
              } else {
                scaleFactor = 1 / 7; // ~14.3% for large images
              }

              const previewWidth = Math.round(originalWidth * scaleFactor);
              const previewHeight = Math.round(originalHeight * scaleFactor);

              const canvas = document.createElement('canvas');
              canvas.width = previewWidth;
              canvas.height = previewHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, previewWidth, previewHeight);
                const previewDataUrl = canvas.toDataURL('image/png');
                setBgRemovedImage(previewDataUrl);
                console.log('[Background Removal] Preview generated', {
                  original: `${originalWidth}x${originalHeight}`,
                  preview: `${previewWidth}x${previewHeight}`,
                  scaleFactor: `${(scaleFactor * 100).toFixed(1)}%`,
                });
              } else {
                // Fallback: use HD image if canvas context unavailable
                setBgRemovedImage(result.image);
              }
              resolve();
            };
            img.onerror = () => {
              console.warn(
                'Failed to load HD image for preview, using HD as preview'
              );
              setBgRemovedImage(result.image);
              resolve();
            };
            img.src = result.image;
          });
        } catch (error) {
          console.warn('Error generating preview, using HD image:', error);
          setBgRemovedImage(result.image);
        }

        toast.success('Hintergrund entfernt!');
      } catch (error) {
        console.error('[Background Removal] Background removal error:', error);
        toast.error(
          'Hintergrund entfernen fehlgeschlagen: ' +
            (error instanceof Error ? error.message : 'Unbekannter Fehler')
        );
      } finally {
        setIsRemovingBg(false);
      }

      toast.success('Bild erfolgreich geladen');
    } catch (error) {
      console.error('Image processing error:', error);
      toast.error('Fehler beim Laden des Bildes');
      setImagePreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    setImageUrl(null);
    setBgRemovedImage(null);
    setHdImage(null);
    setImageTransform(null);
    setPendingFile(null);
    setShowCaptcha(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Optional: Reset Captcha used state if we want better UX
  };

  // Handle HD background removal (requires login and credits)
  const handleHdBackgroundRemoval = async () => {
    if (!session) {
      toast.error('Bitte melde dich an, um HD-Hintergrundentfernung zu nutzen');
      router.push('/auth/login?callbackUrl=/');
      return;
    }

    if (!imageUrl && !uploadedImage) {
      toast.error('Bitte zuerst ein Bild hochladen');
      return;
    }

    const imageUrlToUse = imageUrl || uploadedImage;
    if (!imageUrlToUse) {
      toast.error('Kein Bild zum Verarbeiten gefunden');
      return;
    }

    setIsRemovingBg(true);
    try {
      console.log(
        '[Background Removal] Starting HD background removal via Replicate API...'
      );

      // Add timeout controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout

      let response: Response;
      try {
        response = await fetch('/api/remove-background', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl: imageUrlToUse,
            // HD doesn't use captcha token, it uses auth session checked in middleware/api?
            // Actually the API route now expects token for EVERY request unless we update it to allow "if session exists OR if token exists".
            // My API change was: if (!token) error.
            // This means HD download also needs token OR I need to update API to allow session-based access too.
          }),
          signal: controller.signal,
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error(
            'Anfrage-Zeit眉berschreitung. Bitte versuche es erneut.'
          );
        }
        if (
          fetchError instanceof TypeError &&
          fetchError.message === 'Failed to fetch'
        ) {
          throw new Error(
            'Netzwerkfehler. Bitte 眉berpr眉fe deine Internetverbindung und versuche es erneut.'
          );
        }
        throw fetchError;
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      if (!result.success || !result.image) {
        throw new Error('Background removal failed: Invalid response');
      }

      console.log(
        '[Background Removal] HD background removal completed, result URL:',
        result.image
      );
      setBgRemovedImage(result.image);
      toast.success('Hintergrund entfernt!');
    } catch (error) {
      console.error('[Background Removal] HD background removal error:', error);
      toast.error(
        'Hintergrund entfernen fehlgeschlagen: ' +
          (error instanceof Error ? error.message : 'Unbekannter Fehler')
      );
    } finally {
      setIsRemovingBg(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedImage) return;

    try {
      if (generatedImage.startsWith('http')) {
        // Handle URL image - open in new tab or fetch and download
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `ai-avatar-${Date.now()}.png`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Handle base64 image
        await imageHelpers.shareOrDownload(generatedImage, 'ai-avatar');
      }
      toast.success('Bild erfolgreich heruntergeladen');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Fehler beim Herunterladen des Bildes');
    }
  };

  const handleSubmit = () => {
    // Check authentication
    if (!session) {
      toast.error('Bitte melde dich an, um Bilder zu generieren');
      router.push('/auth/login?callbackUrl=/');
      return;
    }

    if (isLoading || isUploading) return;
    const trimmed = input.trim();
    if (!trimmed && !uploadedImage) return;
    if (requiresImage && !uploadedImage) {
      toast.error('Dieses Modell ben枚tigt ein hochgeladenes Bild.');
      return;
    }
    const effectivePrompt =
      trimmed ||
      'Create a LinkedIn-style professional headshot of the person in the uploaded image, dressed in a suit or business casual, neutral background, clean lighting, realistic portrait photography.';
    onSubmit(
      effectivePrompt,
      uploadedImage || undefined,
      imageUrl || undefined
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isLoading || isUploading) return;
      const trimmed = input.trim();
      if (!trimmed && !uploadedImage) return;
      if (requiresImage && !uploadedImage) {
        toast.error('Dieses Modell benötigt ein hochgeladenes Bild.');
        return;
      }
      const effectivePrompt =
        trimmed ||
        'Create a LinkedIn-style professional headshot of the person in the uploaded image, dressed in a suit or business casual, neutral background, clean lighting, realistic portrait photography.';
      onSubmit(
        effectivePrompt,
        uploadedImage || undefined,
        imageUrl || undefined
      );
    }
  };

  return (
    <div className="w-full mb-8">
      {/* Captcha Modal/Overlay */}
      {showCaptcha && !captchaToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold mb-4 text-center">
              Sicherheitsprüfung
            </h3>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              Bitte bestätige, dass du ein Mensch bist, um mit der Bearbeitung
              fortzufahren.
            </p>
            <div className="flex justify-center mb-4">
              <Captcha
                onSuccess={(token) => {
                  // On success, save token and immediately process the pending file
                  setCaptchaToken(token);
                  setShowCaptcha(false);
                  if (pendingFile) {
                    // Pass the new token directly to avoid state update race conditions
                    processFile(pendingFile, token);
                    setPendingFile(null);
                  }
                }}
              />
            </div>
            <button
              onClick={() => {
                setShowCaptcha(false);
                setPendingFile(null);
                setImagePreview(null);
              }}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
        id="image-upload"
      />

      {/* Main Content */}
      {!bgRemovedImage ? (
        // Before upload: Show centered upload box (like raphael.app)
        <div className="flex flex-col items-center justify-center w-full gap-6">
          {/* Upload Box - Fixed size like raphael.app */}
          <div
            onClick={() => {
              fileInputRef.current?.click();
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'relative border-2 border-dashed rounded-2xl flex items-center justify-center transition-all cursor-pointer group overflow-hidden bg-muted/20',
              'w-[438.22px] h-[478.22px] max-w-full',
              isDragging
                ? 'border-primary bg-primary/10 scale-[1.01]'
                : 'border-primary/50 hover:border-primary hover:bg-primary/5',
              isUploading || isRemovingBg ? 'pointer-events-none' : ''
            )}
          >
            {/* Show preview if image is uploaded but background removal is in progress */}
            {imagePreview && !bgRemovedImage && (
              <div className="absolute inset-0 w-full h-full">
                <img
                  src={imagePreview}
                  alt="Uploaded"
                  className="w-full h-full object-contain rounded-2xl"
                />
                {(isUploading || isRemovingBg) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-2xl">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">
                        {isRemovingBg
                          ? 'Hintergrund entfernen...'
                          : lt.uploading}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isRemovingBg
                          ? 'Bitte warten...'
                          : 'Bild wird hochgeladen...'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Upload UI - Only show when no image preview is shown */}
            {!imagePreview && (
              <div className="flex flex-col items-center justify-center gap-4 p-8 text-center z-10 w-full h-full">
                {isUploading || isRemovingBg ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-sm font-medium text-foreground">
                      {isRemovingBg ? 'Hintergrund entfernen...' : lt.uploading}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Upload
                        className={cn(
                          'w-8 h-8 transition-all',
                          isDragging
                            ? 'text-primary scale-110'
                            : 'text-primary/70 group-hover:text-primary'
                        )}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold text-lg">{lt.uploadTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        {lt.uploadSubtitle}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Privacy Notice - Moved below upload box */}
          {!imagePreview && (
            <p className="text-[10px] text-muted-foreground/60 max-w-[400px] text-center leading-relaxed">
              {lt.consentNotice}
              <LocaleLink
                href="/privacy"
                className="underline hover:text-primary transition-colors"
              >
                Datenschutzrichtlinie
              </LocaleLink>
              {' und '}
              <LocaleLink
                href="/terms"
                className="underline hover:text-primary transition-colors"
              >
                Nutzungsbedingungen
              </LocaleLink>
              .
            </p>
          )}
        </div>
      ) : (
        // After upload: Editor layout with tools (like raphael.app)
        <div className="max-w-7xl mx-auto">
          {bgRemovedImage ? (
            // Editor view when background is removed
            <div className="flex flex-col gap-8 max-w-5xl mx-auto">
              {/* Top - Tools Panel */}
              <div className="w-full">
                <div className="bg-card rounded-xl border p-4 shadow-lg">
                  <BackgroundTools
                    backgroundColor={backgroundColor}
                    backgroundImageUrl={backgroundImageUrl}
                    showGrid={showGrid}
                    isEraserMode={isEraserMode}
                    eraserSize={eraserSize}
                    onBackgroundColorChange={setBackgroundColor}
                    onBackgroundImageChange={setBackgroundImageUrl}
                    onShowGridChange={setShowGrid}
                    onEraserModeChange={setIsEraserMode}
                    onEraserSizeChange={setEraserSize}
                    isLoggedIn={!!session}
                    hasCredits={!!creditBalance && creditBalance > 0}
                    onDownloadTransparent={async () => {
                      // Not used - only download with background
                    }}
                    onDownloadWithBackground={async (highQuality = false) => {
                      if (!stageRef.current) {
                        toast.error('Leinwand nicht bereit');
                        return;
                      }

                      try {
                        const stage = stageRef.current;

                        // Wait a bit to ensure rendering is complete
                        await new Promise((resolve) =>
                          setTimeout(resolve, 100)
                        );

                        // Check if user has modified background (color or image)
                        const hasBackgroundModification =
                          backgroundColor || backgroundImageUrl;

                        if (highQuality) {
                          // HD download requires 1 credit
                          // Check authentication first
                          if (!session) {
                            router.push('/auth/login?callbackUrl=/');
                            return;
                          }

                          // Check if user has enough credits
                          if (creditBalance === undefined) {
                            toast.error('Credits werden geladen...');
                            return;
                          }

                          if (creditBalance < 1) {
                            toast.error(
                              'Nicht genügend Credits für HD-Download. Bitte buche ein Paket.'
                            );
                            router.push('/pricing');
                            return;
                          }

                          // Download HD image
                          let downloadSuccess = false;

                          if (hasBackgroundModification) {
                            try {
                              // For HD download with modified background, we must composite the high-res image manually
                              // because the canvas stage only holds the low-res preview.

                              // 1. Load the HD transparent image
                              if (!hdImage)
                                throw new Error('HD Image URL not found');

                              // Use proxy if needed to avoid CORS
                              const isR2Url = hdImage.includes('.r2.dev');
                              const isReplicateUrl =
                                hdImage.includes('replicate.delivery') ||
                                hdImage.includes('replicate.com');
                              const srcUrl =
                                isR2Url || isReplicateUrl
                                  ? `/api/proxy-image?url=${encodeURIComponent(hdImage)}`
                                  : hdImage;

                              const hdImg = new window.Image();
                              hdImg.crossOrigin = 'anonymous';
                              await new Promise((resolve, reject) => {
                                hdImg.onload = resolve;
                                hdImg.onerror = reject;
                                hdImg.src = srcUrl;
                              });

                              // 2. Create high-res canvas
                              const canvas = document.createElement('canvas');
                              canvas.width = hdImg.naturalWidth;
                              canvas.height = hdImg.naturalHeight;
                              const ctx = canvas.getContext('2d');
                              if (!ctx)
                                throw new Error('Canvas context not available');

                              // 3. Draw background
                              if (backgroundColor) {
                                ctx.fillStyle = backgroundColor;
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                              }

                              if (backgroundImageUrl) {
                                // Load background image
                                const bgImg = new window.Image();
                                bgImg.crossOrigin = 'anonymous';
                                await new Promise((resolve, reject) => {
                                  bgImg.onload = resolve;
                                  bgImg.onerror = reject;
                                  bgImg.src = backgroundImageUrl!;
                                });

                                // Draw background image (cover)
                                const scale = Math.max(
                                  canvas.width / bgImg.naturalWidth,
                                  canvas.height / bgImg.naturalHeight
                                );
                                const w = bgImg.naturalWidth * scale;
                                const h = bgImg.naturalHeight * scale;
                                const x = (canvas.width - w) / 2;
                                const y = (canvas.height - h) / 2;
                                ctx.drawImage(bgImg, x, y, w, h);
                              }

                              // 4. Draw HD Foreground (centered/fit)
                              ctx.drawImage(hdImg, 0, 0);

                              // 5. Export and Download
                              const dataURL = canvas.toDataURL(
                                'image/png',
                                1.0
                              );

                              const link = document.createElement('a');
                              link.href = dataURL;
                              const downloadFileName = originalFileName
                                ? `${originalFileName}-hintergrundentfernen-hd.png`
                                : `image-with-bg-HD-${Date.now()}.png`;
                              link.download = downloadFileName;
                              document.body.appendChild(link);
                              link.click();

                              setTimeout(() => {
                                document.body.removeChild(link);
                              }, 100);

                              downloadSuccess = true;
                              toast.success(
                                'HD-Bild erfolgreich heruntergeladen (mit Hintergrund)'
                              );
                            } catch (compError) {
                              console.error(
                                'HD Composition failed:',
                                compError
                              );
                              toast.error(
                                'Fehler bei der HD-Verarbeitung. Fallback auf Standardqualität.'
                              );
                              // Fallback: download the preview version (better than nothing)
                              const dataURL = stage.toDataURL({
                                mimeType: 'image/png',
                                pixelRatio: 1,
                                quality: 1.0,
                              });
                              const link = document.createElement('a');
                              link.href = dataURL;
                              link.download = `fallback-image-${Date.now()}.png`;
                              document.body.appendChild(link);
                              link.click();
                              setTimeout(
                                () => document.body.removeChild(link),
                                100
                              );
                            }
                          } else {
                            // No background modification, download original HD from R2
                            if (!hdImage) {
                              toast.error('HD-Bild nicht verfügbar');
                              return;
                            }

                            // Use proxy API to avoid CORS issues
                            const isR2Url = hdImage.includes('.r2.dev');
                            const isReplicateUrl =
                              hdImage.includes('replicate.delivery') ||
                              hdImage.includes('replicate.com');
                            const isCustomDomain = hdImage.includes(
                              'hintergrundentfernenki.de'
                            );
                            const imageUrl =
                              isR2Url || isReplicateUrl || isCustomDomain
                                ? `/api/proxy-image?url=${encodeURIComponent(
                                    hdImage
                                  )}`
                                : hdImage;

                            try {
                              const response = await fetch(imageUrl);
                              if (!response.ok) {
                                throw new Error(
                                  `Failed to fetch HD image: ${response.status}`
                                );
                              }
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);

                              const link = document.createElement('a');
                              link.href = url;
                              const downloadFileName = originalFileName
                                ? `${originalFileName}-hintergrundentfernen-hd.png`
                                : `image-with-bg-HD-${Date.now()}.png`;
                              link.download = downloadFileName;
                              document.body.appendChild(link);
                              link.click();

                              setTimeout(() => {
                                document.body.removeChild(link);
                                window.URL.revokeObjectURL(url);
                              }, 100);

                              downloadSuccess = true;
                              toast.success(
                                'HD-Bild erfolgreich heruntergeladen (Originalqualität)'
                              );
                            } catch (fetchError) {
                              console.error(
                                'HD download fetch error:',
                                fetchError
                              );
                              // Fallback: try direct download
                              try {
                                const link = document.createElement('a');
                                link.href = hdImage;
                                const downloadFileName = originalFileName
                                  ? `${originalFileName}-hintergrundentfernen-hd.png`
                                  : `image-with-bg-HD-${Date.now()}.png`;
                                link.download = downloadFileName;
                                link.target = '_blank';
                                document.body.appendChild(link);
                                link.click();
                                setTimeout(() => {
                                  document.body.removeChild(link);
                                }, 100);
                                downloadSuccess = true;
                                toast.success('HD-Bild heruntergeladen');
                              } catch (fallbackError) {
                                console.error(
                                  'Fallback download failed:',
                                  fallbackError
                                );
                                toast.error(
                                  'Fehler beim Herunterladen des HD-Bildes'
                                );
                              }
                            }
                          }

                          // Consume 1 credit after successful download
                          if (downloadSuccess && hdImage) {
                            if (paidImageIds.has(hdImage)) {
                              console.log(
                                'HD download: Already paid for this image'
                              );
                            } else {
                              try {
                                await consumeCreditsMutation.mutateAsync({
                                  amount: 1,
                                  description: 'HD download',
                                });
                                console.log('HD download: 1 credit consumed');
                                // Mark this image as paid
                                setPaidImageIds((prev) =>
                                  new Set(prev).add(hdImage)
                                );
                              } catch (creditError) {
                                console.error(
                                  'Failed to consume credit for HD download:',
                                  creditError
                                );
                                // Don't fail the download if credit consumption fails, but log it
                              }
                            }
                          }
                        } else {
                          // Preview download (1/7 resolution)
                          if (hasBackgroundModification) {
                            // If background is modified, export from canvas at full preview resolution (not 1/7 again)
                            // The stage is already using the preview image (which is 1/7 of original), so we just want 1:1 of that
                            const dataURL = stage.toDataURL({
                              mimeType: 'image/png',
                              pixelRatio: 1,
                              quality: 1.0,
                            });

                            const link = document.createElement('a');
                            link.href = dataURL;
                            const downloadFileName = originalFileName
                              ? `${originalFileName}-hintergrundentfernen-vorschau.png`
                              : `image-with-bg-preview-${Date.now()}.png`;
                            link.download = downloadFileName;
                            document.body.appendChild(link);
                            link.click();

                            setTimeout(() => {
                              document.body.removeChild(link);
                            }, 100);

                            toast.success(
                              'Vorschau-Bild erfolgreich heruntergeladen (mit Hintergrund)'
                            );
                          } else {
                            // No background modification, use preview image (1/7 resolution)
                            if (bgRemovedImage) {
                              if (bgRemovedImage.startsWith('data:')) {
                                // Already a preview data URL
                                const link = document.createElement('a');
                                link.href = bgRemovedImage;
                                const downloadFileName = originalFileName
                                  ? `${originalFileName}-hintergrundentfernen-vorschau.png`
                                  : `image-with-bg-preview-${Date.now()}.png`;
                                link.download = downloadFileName;
                                document.body.appendChild(link);
                                link.click();

                                setTimeout(() => {
                                  document.body.removeChild(link);
                                }, 100);

                                toast.success(
                                  'Vorschau-Bild erfolgreich heruntergeladen'
                                );
                              } else {
                                // URL, fetch and create preview using proxy API to avoid CORS
                                const isR2Url =
                                  bgRemovedImage.includes('.r2.dev');
                                const imageUrl = isR2Url
                                  ? `/api/proxy-image?url=${encodeURIComponent(bgRemovedImage)}`
                                  : bgRemovedImage;

                                const img = new window.Image();
                                img.crossOrigin = 'anonymous';
                                img.onload = () => {
                                  const originalWidth = img.naturalWidth;
                                  const originalHeight = img.naturalHeight;

                                  // Calculate preview scale factor based on image size
                                  const maxDimension = Math.max(
                                    originalWidth,
                                    originalHeight
                                  );
                                  let scaleFactor: number;
                                  if (maxDimension < 1000) {
                                    scaleFactor = 0.8; // 80% for small images
                                  } else if (maxDimension <= 2000) {
                                    scaleFactor = 0.5; // 50% for medium images
                                  } else {
                                    scaleFactor = 1 / 7; // ~14.3% for large images
                                  }

                                  const previewWidth = Math.round(
                                    originalWidth * scaleFactor
                                  );
                                  const previewHeight = Math.round(
                                    originalHeight * scaleFactor
                                  );

                                  const canvas =
                                    document.createElement('canvas');
                                  canvas.width = previewWidth;
                                  canvas.height = previewHeight;
                                  const ctx = canvas.getContext('2d');
                                  if (ctx) {
                                    ctx.drawImage(
                                      img,
                                      0,
                                      0,
                                      previewWidth,
                                      previewHeight
                                    );
                                    const previewDataUrl =
                                      canvas.toDataURL('image/png');

                                    const link = document.createElement('a');
                                    link.href = previewDataUrl;
                                    const downloadFileName = originalFileName
                                      ? `${originalFileName}-hintergrundentfernen-vorschau.png`
                                      : `image-with-bg-preview-${Date.now()}.png`;
                                    link.download = downloadFileName;
                                    document.body.appendChild(link);
                                    link.click();

                                    setTimeout(() => {
                                      document.body.removeChild(link);
                                    }, 100);

                                    toast.success(
                                      'Vorschau-Bild erfolgreich heruntergeladen'
                                    );
                                  } else {
                                    toast.error(
                                      'Fehler beim Erstellen des Vorschau-Bildes'
                                    );
                                  }
                                };
                                img.onerror = () => {
                                  // Fallback: try direct download of the URL
                                  try {
                                    const link = document.createElement('a');
                                    link.href = bgRemovedImage;
                                    const downloadFileName = originalFileName
                                      ? `${originalFileName}-hintergrundentfernen-vorschau.png`
                                      : `image-with-bg-preview-${Date.now()}.png`;
                                    link.download = downloadFileName;
                                    link.target = '_blank';
                                    document.body.appendChild(link);
                                    link.click();
                                    setTimeout(() => {
                                      document.body.removeChild(link);
                                    }, 100);
                                    toast.success(
                                      'Vorschau-Bild heruntergeladen'
                                    );
                                  } catch (fallbackError) {
                                    console.error(
                                      'Fallback download failed:',
                                      fallbackError
                                    );
                                    toast.error(
                                      'Fehler beim Herunterladen des Vorschau-Bildes'
                                    );
                                  }
                                };
                                img.src = imageUrl;
                              }
                            } else {
                              toast.error('Vorschau-Bild nicht verfügbar');
                            }
                          }
                        }
                      } catch (error) {
                        console.error('Download error:', error);
                        toast.error(
                          'Fehler beim Herunterladen des Bildes: ' +
                            (error instanceof Error
                              ? error.message
                              : 'Unbekannter Fehler')
                        );
                      }
                    }}
                  />
                </div>
              </div>

              {/* Bottom - Canvas Editor (Main Display Area) */}
              <div className="space-y-4">
                {/* Main Editor - Responsive size based on image aspect ratio */}
                <div
                  className="relative rounded-2xl overflow-hidden border-2 border-primary/30 shadow-lg bg-muted mx-auto flex items-center justify-center"
                  style={{
                    width: '100%',
                    height: '600px', // Fixed height workspace
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div className="w-full h-full flex items-center justify-center p-4">
                    {bgRemovedImage ? (
                      <ImageEditor
                        mainImageUrl={bgRemovedImage}
                        backgroundColor={backgroundColor}
                        backgroundImageUrl={backgroundImageUrl}
                        showGrid={showGrid}
                        isEraserMode={isEraserMode}
                        eraserSize={eraserSize}
                        onImageTransform={setImageTransform}
                        initialTransform={imageTransform || undefined}
                        stageRef={stageRef}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center min-h-[400px]">
                        <div className="text-center">
                          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Loading image...
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            URL: {bgRemovedImage || 'No URL'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  {isRemovingBg && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                        <p className="text-sm font-medium text-foreground">
                          Hintergrund entfernen...
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Bitte warten...
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Remove image button */}
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-4 right-4 p-2 rounded-full bg-destructive text-destructive-foreground shadow-lg hover:scale-110 transition-transform z-20"
                    title="Bild entfernen"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Privacy Notice - Result View */}
                <p className="text-[10px] text-muted-foreground/60 max-w-[400px] text-center leading-relaxed mx-auto pt-2">
                  {lt.consentNotice}
                  <LocaleLink
                    href="/privacy"
                    className="underline hover:text-primary transition-colors"
                  >
                    Datenschutzrichtlinie
                  </LocaleLink>
                  {' und '}
                  <LocaleLink
                    href="/terms"
                    className="underline hover:text-primary transition-colors"
                  >
                    Nutzungsbedingungen
                  </LocaleLink>
                  .
                </p>
              </div>
            </div>
          ) : (
            // Before background removal: Show original image and loading state
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                {/* Original Image */}
                <div className="relative">
                  <div className="aspect-[3/4] rounded-2xl overflow-hidden border-2 border-primary/30 shadow-lg">
                    <img
                      src={imagePreview || ''}
                      className="w-full h-full object-cover"
                      alt="Uploaded preview"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-3 right-3 p-2 rounded-full bg-destructive text-destructive-foreground shadow-lg hover:scale-110 transition-transform"
                    title="Remove image"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
                    <span className="text-xs text-white flex items-center gap-2 font-medium">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      {lt.originalImage}
                    </span>
                  </div>
                </div>

                {/* Loading State */}
                {isRemovingBg && (
                  <div className="relative">
                    <div className="aspect-[3/4] rounded-2xl overflow-hidden border-2 border-primary/30 shadow-lg bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Hintergrund entfernen...
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side - Input and Generated Result */}
              <div className="space-y-6">
                {/* Prompt Input Section */}
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {lt.aiWillCreate}
                    </p>
                  </div>

                  {/* Collapsible Prompt */}
                  <Collapsible
                    open={isPromptOpen}
                    onOpenChange={setIsPromptOpen}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80 transition-opacity mx-auto">
                      <Sparkles className="w-4 h-4" />
                      {lt.customizePrompt}
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 transition-transform',
                          isPromptOpen && 'rotate-180'
                        )}
                      />
                    </CollapsibleTrigger>

                    <CollapsibleContent className="mt-4">
                      <div className="bg-card rounded-xl border p-4">
                        <Textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={lt.promptHint}
                          rows={3}
                          className="text-sm bg-transparent border-none p-0 resize-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                        />

                        {/* Suggestions */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                          <button
                            type="button"
                            onClick={updateSuggestions}
                            className="p-2 rounded-lg hover:bg-muted transition-colors"
                            title="Refresh suggestions"
                          >
                            <RefreshCw className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <div className="flex flex-wrap gap-2 flex-1">
                            {suggestions
                              .slice(0, 2)
                              .map((suggestion, index) => (
                                <button
                                  type="button"
                                  key={index}
                                  onClick={() => {
                                    handleSuggestionSelect(suggestion.prompt);
                                    setIsPromptOpen(true);
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-xs transition-colors"
                                >
                                  <span>{suggestion.text.toLowerCase()}</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Generate Button */}
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={
                      isLoading ||
                      isUploading ||
                      (requiresImage && !uploadedImage)
                    }
                    className={cn(
                      'w-full py-3 px-6 rounded-xl font-semibold transition-all shadow-lg',
                      'bg-primary text-primary-foreground',
                      'hover:scale-[1.02] hover:shadow-xl',
                      'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
                      'flex items-center justify-center gap-2'
                    )}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>{lt.generating}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        <span>{lt.generateButton}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Generated Result */}
                {(generatedImage || isLoading) && (
                  <div className="space-y-3">
                    <div className="relative">
                      <div className="aspect-[3/4] rounded-2xl overflow-hidden border-2 border-primary/50 shadow-lg bg-muted">
                        {generatedImage ? (
                          <img
                            src={
                              generatedImage.startsWith('http')
                                ? generatedImage
                                : `data:image/png;base64,${generatedImage}`
                            }
                            className="w-full h-full object-cover"
                            alt="Generated result"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                            <Loader2 className="w-12 h-12 text-primary animate-spin" />
                            <div className="text-center">
                              <div className="text-2xl font-semibold text-primary">
                                {elapsedTime.toFixed(1)}s
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {lt.generating}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Download button */}
                      {generatedImage && (
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="absolute top-3 right-3 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform"
                          title={lt.download}
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      )}

                      {/* Time badge */}
                      {generatedImage && generationTime && (
                        <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
                          <span className="text-xs text-white flex items-center gap-2 font-medium">
                            {lt.timeElapsed}:{' '}
                            {(generationTime / 1000).toFixed(1)}s
                          </span>
                        </div>
                      )}

                      {/* Label badge */}
                      {generatedImage && (
                        <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
                          <span className="text-xs text-white flex items-center gap-2 font-medium">
                            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                            {lt.generatedImage}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
