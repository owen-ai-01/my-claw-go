"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, Play, FileVideo, Image as ImageIcon, Download } from "lucide-react";
import { motion, AnimatePresence } from 'motion/react';
import type { AgentState, Scene } from "@/lib/agent/url-processor";

export default function UrlToVideoPage() {
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [state, setState] = useState<AgentState | null>(null);

    // 处理视频下载（使用代理 API 绕过跨域限制）
    const handleDownload = (videoUrl: string) => {
        // 使用服务端代理 API 下载视频，避免跨域问题
        const proxyUrl = `/api/video/download?url=${encodeURIComponent(videoUrl)}`;
        const a = document.createElement('a');
        a.href = proxyUrl;
        a.download = `video-${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url) return;

        setIsLoading(true);
        setState({ status: 'idle', url, logs: [] });

        try {
            const response = await fetch("/api/agent/url-to-video", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) {
                throw new Error("Failed to start agent");
            }

            if (!response.body) return;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const update = JSON.parse(line) as AgentState;
                        setState(update);
                        // Logs are now part of the state update
                    } catch (error) {
                        console.error("Error parsing update:", error);
                    }
                }
            }
        } catch (error) {
            console.error("Error:", error);
            setState(prev => prev ? ({ ...prev, status: 'failed', error: String(error) }) : null);
        } finally {
            setIsLoading(false);
        }
    };

    const steps = [
        { key: "scraping", label: "Reading Webpage" },
        { key: "analyzing", label: "Analyzing Content" },
        { key: "storyboarding", label: "Designing Storyboard" },
        { key: "generating_assets", label: "Generating Assets" },
        { key: "composing", label: "Composing Video" },
    ];

    return (
        <div className="container mx-auto py-10 max-w-5xl space-y-8">
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold tracking-tight">URL to Video Agent</h1>
                <p className="text-xl text-muted-foreground">
                    Enter a URL and let the AI create a video presentation for you.
                </p>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="flex gap-4">
                        <Input
                            placeholder="https://example.com/product"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button type="submit" disabled={isLoading || !url}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                            Generate Video
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {state && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Status Panel */}
                    <div className="md:col-span-1 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Agent Status</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {steps.map((step, index) => {
                                    const isCompleted = steps.findIndex(s => s.key === state.status) > index || state.status === 'completed';
                                    const isCurrent = state.status === step.key;

                                    return (
                                        <div key={step.key} className="flex items-center gap-3">
                                            <div className={`h-8 w-8 rounded-full flex items-center justify-center border ${isCompleted ? 'bg-primary text-primary-foreground border-primary' :
                                                isCurrent ? 'border-primary text-primary animate-pulse' :
                                                    'border-muted text-muted-foreground'
                                                }`}>
                                                {isCompleted ? <CheckCircle2 className="h-5 w-5" /> :
                                                    isCurrent ? <Loader2 className="h-5 w-5 animate-spin" /> :
                                                        <span className="text-sm">{index + 1}</span>}
                                            </div>
                                            <span className={isCurrent ? 'font-medium text-primary' : isCompleted ? 'text-primary' : 'text-muted-foreground'}>
                                                {step.label}
                                            </span>
                                        </div>
                                    );
                                })}
                                {state.status === 'failed' && (
                                    <div className="flex items-center gap-3 text-destructive">
                                        <AlertCircle className="h-5 w-5" />
                                        <span className="font-medium">Generation Failed</span>
                                    </div>
                                )}
                                {state.status === 'completed' && (
                                    <div className="flex items-center gap-3 text-green-600">
                                        <CheckCircle2 className="h-5 w-5" />
                                        <span className="font-medium">Done!</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Logs */}
                        <Card className="max-h-[300px] overflow-hidden flex flex-col">
                            <CardHeader className="py-3 bg-muted/50">
                                <CardTitle className="text-sm">Activity Log</CardTitle>
                            </CardHeader>
                            <div className="flex-1 overflow-y-auto p-4 text-xs font-mono bg-black/5">
                                {(state.logs || []).map((log, i) => (
                                    <div key={i} className="mb-1 border-b border-black/5 pb-1">{log}</div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* Content Panel */}
                    <div className="md:col-span-2 space-y-6">
                        {/* Step 1: Analysis */}
                        {state.analysis && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Content Analysis</CardTitle>
                                        <CardDescription>{state.analysis.summary}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline">Tone: {state.analysis.tone}</Badge>
                                            <Badge variant="outline">Audience: {state.analysis.targetAudience}</Badge>
                                        </div>

                                        <div className="p-4 bg-muted/30 rounded-lg border">
                                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                                <span className="text-primary">✨</span> Value Proposition
                                            </h4>
                                            <p className="text-sm italic text-muted-foreground">
                                                &quot;{state.analysis.valueProposition}&quot;
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <h4 className="text-sm font-semibold mb-2">Key Features:</h4>
                                                <ul className="space-y-1">
                                                    {(state.analysis.keyFeatures || []).map((feature, i) => (
                                                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                            <span className="text-primary mt-1">•</span>
                                                            <span>{feature}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-semibold mb-2">Key Points:</h4>
                                                <ul className="space-y-1">
                                                    {state.analysis.keyPoints.map((point, i) => (
                                                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                            <span className="text-primary mt-1">•</span>
                                                            <span>{point}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {/* Step 2: Storyboard & Assets */}
                        {(state.storyboard || state.assets) && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Visual Assets</CardTitle>
                                        <CardDescription>{state.storyboard?.title}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {(state.assets?.scenes || state.storyboard?.scenes)?.map((scene: Scene) => (
                                                <div key={scene.id} className="group relative border rounded-lg overflow-hidden bg-background">
                                                    <div className="aspect-video bg-muted relative">
                                                        {scene.assetUrl ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={scene.assetUrl}
                                                                alt={scene.description}
                                                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                                                onError={(e) => {
                                                                    console.error('Image load failed:', scene.assetUrl);
                                                                    // Show placeholder on error
                                                                    (e.target as HTMLImageElement).src = `https://placehold.co/1920x1080/png?text=Image+${scene.sceneNumber}`;
                                                                }}
                                                            />
                                                        ) : (
                                                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                                                <ImageIcon className="h-8 w-8 opacity-20" />
                                                            </div>
                                                        )}
                                                        <Badge className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm">
                                                            {scene.duration}s
                                                        </Badge>
                                                    </div>
                                                    <div className="p-3">
                                                        <p className="text-xs font-medium line-clamp-2">{scene.narration}</p>
                                                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{scene.visualPrompt}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {/* Final Result */}
                        {state.videoUrl && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                                <Card className="border-green-500/50 bg-green-500/5">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <FileVideo className="h-5 w-5 text-green-600" />
                                            Video Ready!
                                        </CardTitle>
                                        <CardDescription>Your video has been successfully generated.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {/* Video Preview */}
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

                                        {/* Download Button */}
                                        <Button
                                            className="w-full"
                                            size="lg"
                                            onClick={() => state.videoUrl && handleDownload(state.videoUrl)}
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Download Video (MP4)
                                        </Button>

                                        {/* Warning for sandbox */}
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                                ⚠️ <strong>Note:</strong> Sandbox videos are temporary and will be deleted after 24 hours. Download or save your video now!
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

