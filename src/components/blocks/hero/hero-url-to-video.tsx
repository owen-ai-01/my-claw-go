'use client';

import { LoginForm } from '@/components/auth/login-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreditBalance } from '@/hooks/use-credits';
import { useCurrentUser } from '@/hooks/use-current-user';
import type { AgentState, Scene } from '@/lib/agent/url-processor';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Play,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function HeroUrlToVideo() {
  const t = useTranslations('HomePage.hero');
  const router = useRouter();
  const pathname = usePathname();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [state, setState] = useState<AgentState | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Video settings - fixed 60s duration
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('720p');

  // Auth & Credits
  const user = useCurrentUser();
  const { data: credits = 0 } = useCreditBalance();

  // Fixed cost: 100 credits per 60s video
  const VIDEO_COST = 100;
  const VIDEO_DURATION = 60;

  // Handle video download using proxy API
  const handleDownload = (videoUrl: string) => {
    const proxyUrl = `/api/video/download?url=${encodeURIComponent(videoUrl)}`;
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = `url-to-video-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    // 1. Auth Check - show login modal if not logged in
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    // 2. Credit Check - redirect to pricing if insufficient
    if (credits < VIDEO_COST) {
      toast.error(
        t('form.messages.insufficientCredits', { cost: VIDEO_COST, credits })
      );
      router.push('/pricing');
      return;
    }

    setIsLoading(true);
    setState({ status: 'idle', url, logs: [] });

    try {
      const response = await fetch('/api/agent/url-to-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          aspectRatio,
          resolution,
          duration: VIDEO_DURATION,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start URL to Video agent');
      }

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const update = JSON.parse(line) as AgentState;
            setState(update);
          } catch (error) {
            console.error('Error parsing update:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setState((prev) =>
        prev ? { ...prev, status: 'failed', error: String(error) } : null
      );
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { key: 'scraping', label: 'Reading Webpage' },
    { key: 'analyzing', label: 'Analyzing Content' },
    { key: 'storyboarding', label: 'Designing Storyboard' },
    { key: 'generating_assets', label: 'Generating Assets' },
    { key: 'composing', label: 'Composing Video' },
  ];

  return (
    <main
      id="hero"
      className="relative min-h-[800px] flex justify-center overflow-hidden pt-4"
    >
      {/* Background Video */}
      <div className="absolute inset-0 z-0 select-none">
        <img
          src="/hero_background_1771074066381.png"
          alt="Hero Background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      </div>

      <section className="relative z-10 w-full px-6 pt-4 pb-12 md:pt-10 md:pb-20">
        {/* Atmospheric Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/20 blur-[120px] rounded-full opacity-30 pointer-events-none -z-10" />

        <div className="mx-auto max-w-5xl text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-7xl bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70 pb-2">
            {t('title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg md:text-xl text-muted-foreground leading-relaxed">
            {t('description')}
          </p>
        </div>

        {/* URL to Video Form */}
        <div className="mx-auto max-w-3xl w-full animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="bg-background/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl ring-1 ring-white/10 dark:ring-white/5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative w-full bg-background/50 rounded-lg border border-white/10 p-6 min-h-[100px] flex flex-col justify-center">
                <Label className="mb-2 text-muted-foreground">
                  URL to Video - Enter any webpage URL
                </Label>
                <Input
                  placeholder="https://example.com/product..."
                  className="bg-transparent border-white/20 text-lg h-12"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Enter a product URL, article, or any webpage. Our URL to Video
                  AI will automatically create an engaging video for you.
                </p>
              </div>

              {/* Settings */}
              <div className="flex flex-col gap-4 p-3 border-t border-white/5 bg-muted/20 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                      <Monitor className="w-3 h-3" />
                      {t('form.settings.aspectRatio.label')}
                    </Label>
                    <select
                      className="w-full p-2 rounded-md border border-white/10 text-sm bg-background/50 focus:ring-1 focus:ring-primary/20 outline-none"
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      disabled={isLoading}
                    >
                      <option value="16:9">
                        {t('form.settings.aspectRatio.16:9')}
                      </option>
                      <option value="9:16">
                        {t('form.settings.aspectRatio.9:16')}
                      </option>
                      <option value="1:1">
                        {t('form.settings.aspectRatio.1:1')}
                      </option>
                      <option value="4:3">
                        {t('form.settings.aspectRatio.4:3')}
                      </option>
                      <option value="3:4">
                        {t('form.settings.aspectRatio.3:4')}
                      </option>
                      <option value="21:9">
                        {t('form.settings.aspectRatio.21:9')}
                      </option>
                      <option value="9:21">
                        {t('form.settings.aspectRatio.9:21')}
                      </option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                      <Settings2 className="w-3 h-3" />
                      {t('form.settings.resolution.label')}
                    </Label>
                    <select
                      className="w-full p-2 rounded-md border border-white/10 text-sm bg-background/50 focus:ring-1 focus:ring-primary/20 outline-none"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      disabled={isLoading}
                    >
                      <option value="480p">480p</option>
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                    </select>
                  </div>
                  {/* Duration is fixed at 60s */}
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {t('form.settings.duration.label')}
                    </Label>
                    <div className="w-full p-2 rounded-md border border-white/10 text-sm bg-background/50">
                      60s
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    size="lg"
                    className="gap-2 shadow-lg hover:shadow-primary/25 transition-all w-full md:w-auto cursor-pointer"
                    disabled={isLoading || !url}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span className="flex flex-col items-start leading-tight">
                      <span>
                        {isLoading ? t('form.generating') : t('form.generate')}
                      </span>
                      <span className="text-[10px] opacity-80 font-normal">
                        {VIDEO_COST} Credits
                      </span>
                    </span>
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Agent Status & Results */}
        {state && (
          <div className="mx-auto max-w-5xl mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Status Panel */}
            <div className="md:col-span-1 space-y-4">
              <Card className="bg-background/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">URL to Video Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {steps.map((step, index) => {
                    const isCompleted =
                      steps.findIndex((s) => s.key === state.status) > index ||
                      state.status === 'completed';
                    const isCurrent = state.status === step.key;

                    return (
                      <div key={step.key} className="flex items-center gap-3">
                        <div
                          className={`h-7 w-7 rounded-full flex items-center justify-center border text-sm ${
                            isCompleted
                              ? 'bg-primary text-primary-foreground border-primary'
                              : isCurrent
                                ? 'border-primary text-primary animate-pulse'
                                : 'border-muted text-muted-foreground'
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isCurrent ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <span>{index + 1}</span>
                          )}
                        </div>
                        <span
                          className={`text-sm ${isCurrent ? 'font-medium text-primary' : isCompleted ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                  {state.status === 'failed' && (
                    <div className="flex items-center gap-3 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium text-sm">
                        URL to Video Failed
                      </span>
                    </div>
                  )}
                  {state.status === 'completed' && (
                    <div className="flex items-center gap-3 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium text-sm">
                        URL to Video Complete!
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Activity Log */}
              <Card className="max-h-[200px] overflow-hidden flex flex-col bg-background/80 backdrop-blur-sm">
                <CardHeader className="py-2 bg-muted/50">
                  <CardTitle className="text-xs">Activity Log</CardTitle>
                </CardHeader>
                <div className="flex-1 overflow-y-auto p-3 text-xs font-mono bg-black/5">
                  {(state.logs || []).slice(-10).map((log, i) => (
                    <div key={i} className="mb-1 border-b border-black/5 pb-1">
                      {log}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Content Panel */}
            <div className="md:col-span-2 space-y-4">
              {/* Analysis Result */}
              {state.analysis && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="bg-background/80 backdrop-blur-sm">
                    <CardHeader className="py-3">
                      <CardTitle className="text-base">
                        Content Analysis
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {state.analysis.summary}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
                          Tone: {state.analysis.tone}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Audience: {state.analysis.targetAudience}
                        </Badge>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-lg border">
                        <h4 className="text-xs font-semibold mb-1 flex items-center gap-2">
                          <Sparkles className="h-3 w-3 text-primary" /> Value
                          Proposition
                        </h4>
                        <p className="text-xs italic text-muted-foreground">
                          &quot;{state.analysis.valueProposition}&quot;
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Storyboard & Assets */}
              {(state.storyboard || state.assets) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="bg-background/80 backdrop-blur-sm">
                    <CardHeader className="py-3">
                      <CardTitle className="text-base">Visual Assets</CardTitle>
                      <CardDescription className="text-sm">
                        {state.storyboard?.title}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {(
                          state.assets?.scenes || state.storyboard?.scenes
                        )?.map((scene: Scene) => (
                          <div
                            key={scene.id}
                            className="group relative border rounded-lg overflow-hidden bg-background"
                          >
                            <div className="aspect-video bg-muted relative">
                              {scene.assetUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={scene.assetUrl}
                                  alt={scene.description}
                                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      `https://placehold.co/1920x1080/png?text=Scene+${scene.sceneNumber}`;
                                  }}
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                  <ImageIcon className="h-6 w-6 opacity-20" />
                                </div>
                              )}
                              <Badge className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-[10px]">
                                {scene.duration}s
                              </Badge>
                            </div>
                            <div className="p-2">
                              <p className="text-[10px] font-medium line-clamp-2">
                                {scene.narration}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Final Video Result */}
              {state.videoUrl && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <Card className="border-green-500/50 bg-green-500/5">
                    <CardHeader className="py-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileVideo className="h-5 w-5 text-green-600" />
                        URL to Video Ready!
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Your URL to Video has been successfully generated.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="aspect-video bg-black rounded-lg overflow-hidden">
                        <video
                          src={state.videoUrl}
                          controls
                          crossOrigin="anonymous"
                          className="w-full h-full"
                          preload="auto"
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>

                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() =>
                          state.videoUrl && handleDownload(state.videoUrl)
                        }
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download URL to Video (MP4)
                      </Button>

                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          ⚠️ <strong>Note:</strong> Videos are temporary and will
                          be deleted after 24 hours. Download your URL to Video
                          now!
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Login Modal */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-[400px] p-0 border-none bg-transparent shadow-none">
          <DialogHeader className="hidden">
            <DialogTitle>{t('form.loginTitle')}</DialogTitle>
          </DialogHeader>
          <div className="bg-background rounded-lg border shadow-lg overflow-hidden">
            <LoginForm
              callbackUrl={pathname}
              className="border-none shadow-none"
            />
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
