'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

import { useTranslations, useLocale } from 'next-intl';
import { GERMAN_VIDEO_PROMPTS } from '@/lib/constants/prompts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea'; // Assuming we have this, or use standard textarea
import { Type, ImageIcon, Sparkles, Upload, Play, Settings2, Download, Loader2, Clock, Monitor, Dices } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useCreditBalance } from '@/hooks/use-credits';
import { websiteConfig } from '@/config/website';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { LoginForm } from '@/components/auth/login-form';

export default function VideoGenerator({ defaultMode = 'text-to-video', isStudioMode = false }: { defaultMode?: string; isStudioMode?: boolean }) {
    const t = useTranslations('HomePage.hero');
    const locale = useLocale();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const modeParam = searchParams.get('mode');

    // Determine initial tab: URL param > prop > default (web-to-video as new default)
    const initialTab = modeParam === 'image' ? 'image-to-video' :
        modeParam === 'text' ? 'text-to-video' :
            'web-to-video';

    const [activeTab, setActiveTab] = useState(initialTab);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
    const [prompt, setPrompt] = useState(searchParams.get('prompt') || "");
    const [aspectRatio, setAspectRatio] = useState(searchParams.get('ar') || "16:9");
    const [resolution, setResolution] = useState(searchParams.get('res') || "720p");
    const [duration, setDuration] = useState(searchParams.get('dur') || "5");

    // Image to Video State
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(searchParams.get('img') || null);
    const [isUploading, setIsUploading] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);

    // Web to Video State
    const [urlInput, setUrlInput] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Default random prompt on mount
    useEffect(() => {
        if (!prompt && activeTab === 'text-to-video') {
            const randomPrompt = GERMAN_VIDEO_PROMPTS[Math.floor(Math.random() * GERMAN_VIDEO_PROMPTS.length)];
            setPrompt(randomPrompt);
        }
    }, []);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Basic validation
        if (!file.type.startsWith('image/')) {
            toast.error(t('form.messages.uploadImage'));
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'video-generation'); // Optional folder organization

            const response = await fetch('/api/storage/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || t('form.messages.uploadError'));
            }

            const data = await response.json();
            setUploadedImage(data.url);
            toast.success(t('form.messages.uploadSuccess'));
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error(t('form.messages.uploadError'));
        } finally {
            setIsUploading(false);
            // Reset input so same file can be selected again if needed
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Web Analysis Handler
    const handleAnalyzeUrl = async () => {
        if (!urlInput) {
            toast.error(t('form.messages.enterUrl'));
            return;
        }

        setIsAnalyzing(true);
        try {
            const response = await fetch('/api/analyze-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: urlInput,
                    modelProvider: 'openai'
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || t('form.messages.analyzeUrlError'));
            }

            const analysis = data.data.analysis;

            // Construct prompt from analysis based on locale
            let newPrompt = "";
            if (locale === 'de') {
                newPrompt = `Ein Werbevideo für ${analysis.title}. ${analysis.description}. Highlights: ${analysis.features.slice(0, 3).join(', ')}. Professionell, cinematisch, 4k.`;
            } else {
                newPrompt = `A promotional video for ${analysis.title}. ${analysis.description}. Highlights: ${analysis.features.slice(0, 3).join(', ')}. Professional, cinematic, 4k.`;
            }

            setPrompt(newPrompt);
            setActiveTab('text-to-video');
            toast.success(t('form.messages.analysisSuccess'));

        } catch (error) {
            console.error('Analysis failed:', error);
            toast.error(error instanceof Error ? error.message : t('form.messages.analyzeUrlError'));
        } finally {
            setIsAnalyzing(false);
        }
    };


    // Auth & Credits
    const user = useCurrentUser();
    const { data: credits = 0 } = useCreditBalance();

    // Cost Calculation Logic
    const calculateCost = useCallback((durationStr: string, resolutionStr: string) => {
        const baseCostPerSec = 10;
        const durationSec = parseInt(durationStr) || 5;

        let multiplier = 1;
        if (resolutionStr === "720p") multiplier = 1.5;
        if (resolutionStr === "1080p") multiplier = 2;

        return Math.ceil(baseCostPerSec * durationSec * multiplier);
    }, []);

    const handleGenerate = useCallback(async () => {
        // 1. Auth Check
        if (!user) {
            // toast.error(t('form.messages.loginRequired'));
            setShowLoginModal(true);
            return;
        }

        const cost = calculateCost(duration, resolution);

        // 2. Credit Check
        if (credits < cost) {
            toast.error(t('form.messages.insufficientCredits', { cost, credits }));
            // Open pricing modal or redirect
            // Assuming we can redirect to settings/credits or pricing
            // router.push('/settings/credits'); 
            // Better UX: Show a dialog. For now, simple redirect/toast.
            // window.dispatchEvent(new CustomEvent('open-pricing-modal')); // Hypothetical
            // Just redirecting to credits for now as requested "pop up price page" (or closest equivalent without modal implementation details)
            router.push('/pricing');
            return;
        }

        if (!prompt && activeTab === 'text-to-video') {
            toast.error(t('form.messages.enterPrompt'));
            return;
        }

        if (!uploadedImage && activeTab === 'image-to-video') {
            toast.error(t('form.messages.uploadImageFirst'));
            return;
        }

        setIsGenerating(true);
        setGeneratedVideo(null);

        try {
            // 3. Create Prediction
            const response = await fetch('/api/video/text-to-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    aspectRatio,
                    resolution,
                    duration: parseInt(duration),
                    image: activeTab === 'image-to-video' ? uploadedImage : undefined
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                // Special handling for credit errors if backend throws them
                if (response.status === 402 || error.error?.includes('credit')) {
                    router.push('/settings/credits');
                }
                throw new Error(error.error || t('form.messages.startGenerationError'));
            }

            const prediction = await response.json();
            const predictionId = prediction.id;

            // 4. Poll Status
            const pollInterval = setInterval(async () => {
                const statusRes = await fetch(`/api/video/status?id=${predictionId}`);
                if (!statusRes.ok) {
                    clearInterval(pollInterval);
                    setIsGenerating(false);
                    // toast.error("Failed to check status"); // Suppress error for cleaner auto-flow
                    return;
                }

                const statusData = await statusRes.json();
                console.log("Prediction Status:", statusData.status);

                if (statusData.status === 'succeeded') {
                    clearInterval(pollInterval);
                    setIsGenerating(false);
                    // Replicate usually returns output as string (url) or array of strings
                    const output = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
                    setGeneratedVideo(output);
                    toast.success(t('form.messages.videoGenerated'));
                } else if (statusData.status === 'failed' || statusData.status === 'canceled') {
                    clearInterval(pollInterval);
                    setIsGenerating(false);
                    toast.error(`${t('form.messages.generationFailed')}: ${statusData.status}`);
                }
            }, 2000); // Poll every 2 seconds

        } catch (error) {
            console.error(error);
            setIsGenerating(false);
            toast.error(error instanceof Error ? error.message : t('form.messages.genericError'));
        }
    }, [prompt, activeTab, uploadedImage, aspectRatio, resolution, duration, user, credits, calculateCost, router, t]);

    // Auto-generate effect
    useEffect(() => {
        const auto = searchParams.get('auto');
        // Check session storage flag to ensure we only auto-generate when coming from the homepage
        const shouldAutoGenerate = sessionStorage.getItem('url_to_video_auto_generate') === 'true';

        console.log("Auto Generation Check:", {
            auto,
            shouldAutoGenerate,
            isGenerating,
            generatedVideo,
            activeTab,
            prompt: !!prompt, // Log existence not content for cleaner logs
            uploadedImage: !!uploadedImage
        });

        if (auto === 'true' && shouldAutoGenerate && !isGenerating && !generatedVideo) {
            // Check if we have the necessary data
            if (activeTab === 'text-to-video' && prompt) {
                console.log("Auto-triggering Text Generation");
                sessionStorage.removeItem('url_to_video_auto_generate'); // Consume flag

                // Clean up URL
                const newParams = new URLSearchParams(searchParams.toString());
                newParams.delete('auto');
                router.replace(`?${newParams.toString()}`);

                setTimeout(() => handleGenerate(), 0);
            } else if (activeTab === 'image-to-video' && uploadedImage) {
                console.log("Auto-triggering Image Generation");
                sessionStorage.removeItem('url_to_video_auto_generate'); // Consume flag

                // Clean up URL
                const newParams = new URLSearchParams(searchParams.toString());
                newParams.delete('auto');
                router.replace(`?${newParams.toString()}`);

                setTimeout(() => handleGenerate(), 0);
            } else {
                console.log("Auto-trigger conditions not met", {
                    tab: activeTab,
                    hasPrompt: !!prompt,
                    hasImage: !!uploadedImage
                });
            }
        }
    }, [searchParams, isGenerating, generatedVideo, activeTab, prompt, uploadedImage, handleGenerate]);

    return (
        <div className={cn(
            "w-full flex flex-col lg:flex-row gap-8",
            isStudioMode ? "h-full p-6" : "max-w-7xl mx-auto px-4 py-8 min-h-[calc(100vh-100px)]"
        )}>

            {/* Left Panel: Inputs & Controls */}
            <div className={cn(
                "w-full flex flex-col gap-6",
                isStudioMode ? "lg:w-[400px] flex-shrink-0" : "lg:w-1/3"
            )}>
                <div className={cn(
                    "bg-background border border-border/50 rounded-2xl p-6 shadow-sm",
                    isStudioMode && "h-full flex flex-col" // Make it full height in studio
                )}>
                    {/* Tabs / Mode Selector */}
                    <div className="flex p-1 bg-muted/50 rounded-lg mb-6">
                        <button
                            onClick={() => setActiveTab('text-to-video')}
                            className={cn(
                                "flex-1 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2",
                                activeTab === 'text-to-video'
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Type className="w-4 h-4" />
                            {t('tabs.textToVideo')}
                        </button>
                        <button
                            onClick={() => setActiveTab('image-to-video')}
                            className={cn(
                                "flex-1 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2",
                                activeTab === 'image-to-video'
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <ImageIcon className="w-4 h-4" />
                            {t('tabs.imageToVideo')}
                        </button>
                        <button
                            onClick={() => setActiveTab('web-to-video')}
                            className={cn(
                                "flex-1 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2",
                                activeTab === 'web-to-video'
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Monitor className="w-4 h-4" />
                            {t('tabs.webToVideo')}
                        </button>
                    </div>

                    {!isStudioMode && <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>}

                    <div className="w-full flex-1">
                        {activeTab === 'text-to-video' && (
                            <div className="space-y-4">
                                <div>
                                    <Label className="block mb-2 font-medium">Prompt</Label>
                                    <div className="relative">
                                        <textarea
                                            className="w-full min-h-[160px] p-4 pb-12 rounded-xl border border-input bg-transparent text-lg resize-none focus:ring-2 focus:ring-primary/20 outline-none"
                                            placeholder={t('form.promptPlaceholder')}
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                        />
                                        <div className="absolute bottom-3 left-3 z-20">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="text-muted-foreground hover:text-primary transition-colors h-8 px-2 gap-2 bg-background/20 hover:bg-background/40"
                                                onClick={() => {
                                                    const availablePrompts = GERMAN_VIDEO_PROMPTS.filter(p => p !== prompt);
                                                    const randomPrompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
                                                    setPrompt(randomPrompt);
                                                }}
                                                title="Zufälliger Prompt"
                                            >
                                                <Sparkles className="h-4 w-4" />
                                                <span className="text-xs font-medium">Zufälliger Prompt</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'image-to-video' && (
                            <div className="space-y-4">
                                <div
                                    onClick={handleUploadClick}
                                    className={cn(
                                        "w-full aspect-[4/3] relative border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/10 rounded-xl transition-all flex flex-col items-center justify-center cursor-pointer group overflow-hidden",
                                        isUploading && "opacity-50 pointer-events-none"
                                    )}
                                >
                                    {uploadedImage ? (
                                        <>
                                            <img
                                                src={uploadedImage}
                                                alt="Uploaded preview"
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="bg-background/90 p-3 rounded-full">
                                                    <Upload className="h-5 w-5 text-primary" />
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="bg-background/80 p-4 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                                                {isUploading ? (
                                                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                                                ) : (
                                                    <Upload className="h-6 w-6 text-primary" />
                                                )}
                                            </div>
                                            <p className="text-sm font-medium text-muted-foreground">
                                                {isUploading ? t('form.generating') : t('form.uploadPlaceholder')}
                                            </p>
                                        </>
                                    )}
                                    <Input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                    />
                                </div>

                                <div>
                                    <Label className="block mb-2 font-medium">{t('form.promptPlaceholder')} (Optional)</Label>
                                    <textarea
                                        className="w-full min-h-[80px] p-3 rounded-lg border border-input bg-transparent resize-none focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                                        placeholder={t('form.promptPlaceholder')}
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'web-to-video' && (
                            <div className="space-y-4">
                                <div>
                                    <Label className="block mb-2 font-medium">{t('form.settings.webUrlLabel')}</Label>
                                    <Input
                                        placeholder="https://example.com"
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                        className="text-lg p-4 h-auto"
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {t('form.settings.webAnalysisInfo')}
                                    </p>
                                </div>
                                <Button
                                    onClick={handleAnalyzeUrl}
                                    disabled={isAnalyzing || !urlInput.trim()}
                                    className="w-full"
                                    variant="secondary"
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                            {t('form.settings.analyzing')}
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            {t('form.settings.analyzeButton')}
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Settings / Parameters Mock */}

                    <div className="mt-6 pt-6 border-t border-border/50 space-y-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                            <Settings2 className="w-4 h-4" />
                            {t('form.settings.title')}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="aspect-ratio-select" className="text-xs flex items-center gap-1">
                                    <Monitor className="w-3 h-3" />
                                    {t('form.settings.aspectRatio.label')}
                                </Label>
                                <select
                                    id="aspect-ratio-select"
                                    className="w-full p-2 rounded-md border text-sm bg-background"
                                    value={aspectRatio}
                                    onChange={(e) => setAspectRatio(e.target.value)}
                                >
                                    <option value="16:9">{t('form.settings.aspectRatio.16:9')}</option>
                                    <option value="9:16">{t('form.settings.aspectRatio.9:16')}</option>
                                    <option value="1:1">{t('form.settings.aspectRatio.1:1')}</option>
                                    <option value="4:3">{t('form.settings.aspectRatio.4:3')}</option>
                                    <option value="3:4">{t('form.settings.aspectRatio.3:4')}</option>
                                    <option value="21:9">{t('form.settings.aspectRatio.21:9')}</option>
                                    <option value="9:21">{t('form.settings.aspectRatio.9:21')}</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="resolution-select" className="text-xs">{t('form.settings.resolution.label')}</Label>
                                <select
                                    id="resolution-select"
                                    className="w-full p-2 rounded-md border text-sm bg-background"
                                    value={resolution}
                                    onChange={(e) => setResolution(e.target.value)}
                                >
                                    <option value="480p">480p</option>
                                    <option value="720p">720p</option>
                                    <option value="1080p">1080p</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="duration-select" className="text-xs flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {t('form.settings.duration.label')}
                                </Label>
                                <select
                                    id="duration-select"
                                    className="w-full p-2 rounded-md border text-sm bg-background"
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                >
                                    <option value="5">{t('form.settings.duration.5s')}</option>
                                    <option value="7">{t('form.settings.duration.7s')}</option>
                                    <option value="10">{t('form.settings.duration.10s')}</option>
                                    <option value="12">{t('form.settings.duration.12s')}</option>
                                </select>
                            </div>
                        </div>
                    </div>


                    {activeTab !== 'web-to-video' && (
                        <Button
                            size="lg"
                            className={cn("w-full mt-8 h-12 text-lg font-medium shadow-lg transition-all", isGenerating ? "opacity-80 cursor-not-allowed" : "hover:shadow-primary/25")}
                            onClick={handleGenerate}
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="animate-spin mr-2 h-5 w-5" />
                                    {t('form.generating')}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-5 w-5" />
                                    {t('form.generate')}
                                    <span className="ml-2 bg-primary-foreground/20 px-2 py-0.5 rounded-full text-xs">
                                        {calculateCost(duration, resolution)} Credits
                                    </span>
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {/* Right Panel: Preview / Results */}
            <div className="flex w-full lg:flex-1 flex-col min-h-[400px] lg:h-full bg-muted/10 border border-border/50 rounded-2xl overflow-hidden relative mt-6 lg:mt-0">
                {!isStudioMode && (
                    <div className="absolute top-4 right-4 flex gap-2 z-10">
                        <div className="bg-background/80 backdrop-blur px-3 py-1 rounded-full text-xs font-medium border border-border/50">
                            {credits} Credits
                        </div>
                    </div>
                )}

                <div className="flex-1 flex items-center justify-center p-4 lg:p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-background via-muted/20 to-muted/50">
                    <AnimatePresence mode="wait">
                        {generatedVideo ? (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="w-full max-w-3xl flex flex-col items-center gap-4"
                            >
                                <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative group border border-border/50">
                                    <video
                                        key={generatedVideo}
                                        src={generatedVideo}
                                        controls
                                        className="w-full h-full object-contain"
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                        aria-label="Generiertes Video"
                                    />
                                </div>

                                <Button
                                    variant="secondary"
                                    className="gap-2"
                                    onClick={async () => {
                                        if (!generatedVideo) return;
                                        try {
                                            const proxyUrl = `/api/video/download?url=${encodeURIComponent(generatedVideo)}`;
                                            const response = await fetch(proxyUrl);
                                            if (!response.ok) throw new Error('Download failed');

                                            const blob = await response.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.style.display = 'none';
                                            a.href = url;
                                            a.download = `url-to-video-${Date.now()}.mp4`;
                                            document.body.appendChild(a);
                                            a.click();
                                            window.URL.revokeObjectURL(url);
                                            document.body.removeChild(a);
                                        } catch (error) {
                                            console.error('Download failed:', error);
                                            toast.error(t('form.messages.downloadFailed'));
                                            window.open(generatedVideo, '_blank');
                                        }
                                    }}
                                >
                                    <Download className="w-4 h-4" />
                                    {t('form.messages.download')}
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="example"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="w-full max-w-3xl flex flex-col gap-6"
                            >
                                <div className="flex items-center gap-2 text-sm text-muted-foreground uppercase tracking-wider font-semibold px-1">
                                    <Sparkles className="w-4 h-4" />
                                    {t('form.preview.example')}
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground block pl-1">{t('form.preview.generatedVideo')}</Label>
                                    <div className="aspect-video rounded-xl overflow-hidden border border-white/10 relative bg-black/20 shadow-lg">
                                        <video
                                            src="https://files.myclawgo.com/example/url-to-video-02.mp4"
                                            autoPlay
                                            loop
                                            muted
                                            playsInline
                                            className="object-contain w-full h-full"
                                            aria-label="Example Video"
                                        />
                                    </div>
                                </div>

                                <div className="bg-muted/40 backdrop-blur-sm p-4 rounded-xl border border-white/5 shadow-sm">
                                    <Label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1">
                                        <Type className="h-3 w-3" />
                                        {t('form.preview.prompt')}
                                    </Label>
                                    <p className="text-sm font-medium leading-relaxed opacity-90">
                                        &quot;{t('form.preview.examplePrompt')}&quot;
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
                <DialogContent className="sm:max-w-[400px] p-0 border-none bg-transparent shadow-none">
                    <DialogHeader className="hidden">
                        <DialogTitle>{t('form.loginTitle')}</DialogTitle>
                    </DialogHeader>
                    <div className="bg-background rounded-lg border shadow-lg overflow-hidden">
                        <LoginForm callbackUrl={pathname} className="border-none shadow-none" />
                    </div>
                </DialogContent>
            </Dialog>



        </div>
    );
}
