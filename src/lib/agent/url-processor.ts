import { z } from 'zod';
import { scrapeProductUrl } from '../firecrawl';
import Replicate from 'replicate'; // Use native SDK
import { AssetGenerator } from './asset-generator';
import { VideoComposer } from './video-composer';

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

// Types for the Agent Workflow
export type AgentState = {
    status: 'idle' | 'scraping' | 'analyzing' | 'storyboarding' | 'generating_assets' | 'composing' | 'completed' | 'failed';
    url: string;
    scrapedData?: any;
    analysis?: ContentAnalysis;
    storyboard?: Storyboard;
    assets?: GeneratedAssets;
    videoUrl?: string;
    error?: string;
    logs: string[]; // detailed logs
};

export type ContentAnalysis = {
    summary: string;
    keyPoints: string[];
    tone: 'professional' | 'energetic' | 'calm' | 'dramatic';
    targetAudience: string;
    valueProposition: string;
    keyFeatures: string[];
};

export type Scene = {
    id: string;
    sceneNumber: number;
    startTime: number; // in seconds
    description: string;
    narration: string;
    duration: number; // in seconds
    visualPrompt: string; // Prompt for image generation
    visualType: 'screenshot' | 'ai_image'; // Type of visual asset
    transition: 'fade' | 'slide' | 'zoom' | 'none'; // Transition effect
    textOverlay?: string; // Optional text overlay
    assetUrl?: string; // URL of generated image/video
    type: 'image' | 'video_clip';
};

export type Storyboard = {
    title: string;
    totalDuration: number; // should be 60
    scenes: Scene[];
    backgroundMusicStyle: string;
};

export type GeneratedAssets = {
    scenes: Scene[]; // Updated scenes with asset URLs
    audioUrl?: string; // TTS combined audio
};

export type VideoOptions = {
    aspectRatio?: string;
    resolution?: string;
    duration?: number; // total video duration in seconds
};

export class UrlToVideoAgent {
    private state: AgentState;
    private assetGenerator: AssetGenerator;
    private videoComposer: VideoComposer;
    private options: VideoOptions;

    constructor(
        url: string,
        private onStatusChange?: (state: AgentState) => void,
        options?: VideoOptions
    ) {
        this.state = {
            status: 'idle',
            url,
            logs: [],
        };
        this.options = {
            aspectRatio: options?.aspectRatio || '16:9',
            resolution: options?.resolution || '720p',
            duration: options?.duration || 60, // default 60 seconds
        };
        this.assetGenerator = new AssetGenerator();
        this.videoComposer = new VideoComposer();
    }

    private log(message: string) {
        this.state.logs.push(message);
        // Also update status to trigger callback
        if (this.onStatusChange) {
            this.onStatusChange({ ...this.state });
        }
    }

    async process(): Promise<AgentState> {
        try {
            // 1. Scraping
            this.updateStatus('scraping');
            this.log(`Starting clean scrape of ${this.state.url}...`);
            const scrapedData = await scrapeProductUrl(this.state.url, { includeScreenshot: true });
            if (!scrapedData) throw new Error('Failed to scrape URL');

            this.state.scrapedData = scrapedData;

            if (scrapedData._isCached) {
                this.log(`✅ Using cached data for ${this.state.url} (Credits saved)`);
            } else {
                this.log(`🌐 Scraped fresh data from Firecrawl API`);
            }

            this.log(`Scraped successfully. Title: ${scrapedData.title}`);
            this.log(`Extracted ${scrapedData.images.length} images and ${scrapedData.description.length} chars of text.`);

            // 2. Analyze Content
            this.updateStatus('analyzing');
            this.log('Analyzing content with AI...');
            const analysis = await this.analyzeContent(scrapedData);
            this.state.analysis = analysis;

            this.log(`Analysis complete. Tone: ${analysis.tone}`);
            this.log(`Value Prop: ${analysis.valueProposition}`);
            this.log(`Key Points: ${analysis.keyPoints.join(', ')}`);

            // 3. Storyboard - 先检查缓存
            this.updateStatus('storyboarding');

            // 导入缓存工具
            const { StoryboardCache } = await import('../cache/storyboard-cache');
            const storyboardCache = new StoryboardCache();

            let storyboard = await storyboardCache.get(this.state.url);

            if (storyboard) {
                this.log(`✅ Using cached storyboard for ${this.state.url} (AI Credits saved)`);
            } else {
                this.log('Designing storyboard and script...');
                storyboard = await this.generateStoryboard(analysis, scrapedData);

                // 保存到缓存
                await storyboardCache.set(this.state.url, storyboard);
            }

            this.state.storyboard = storyboard;

            this.log(`Storyboard created: "${storyboard.title}" with ${storyboard.scenes.length} scenes.`);

            // 4. Generate Assets (Images, TTS)
            this.updateStatus('generating_assets');
            this.log('Generating AI visual assets for scenes...');
            const assets = await this.assetGenerator.generateAssets(
                storyboard,
                this.state.url
            );
            this.state.assets = assets;
            this.log('Assets generation complete.');

            // 5. Compose Video
            this.updateStatus('composing');
            this.log('Composing final video timeline...');
            const videoUrl = await this.videoComposer.compose(assets, this.state.url);
            this.state.videoUrl = videoUrl;
            this.log(`Video manifest generated at: ${videoUrl}`);

            this.updateStatus('completed');
            return this.state;
        } catch (error: any) {
            this.state.status = 'failed';
            this.state.error = error.message;
            this.state.videoUrl = undefined;
            this.log(`Error: ${error.message}`);
            if (this.onStatusChange) {
                this.onStatusChange({ ...this.state });
            }
            return this.state;
        }
    }

    private updateStatus(status: AgentState['status']) {
        this.state.status = status;
        console.log(`Agent Status: ${status}`);
        if (this.onStatusChange) {
            this.onStatusChange({ ...this.state });
        }
    }

    private async callReplicate(prompt: string, systemPrompt: string): Promise<any> {
        try {
            const input = {
                prompt: prompt,
                system_prompt: systemPrompt,
                max_tokens: 4096,
            };

            // Using replicate.run() for simpler one-shot generation
            const output = await replicate.run("openai/gpt-4o", { input });

            // Output handling
            const text = Array.isArray(output) ? output.join('') : String(output);

            // Clean up code blocks if JSON is wrapped in markdown
            const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (error: any) {
            console.error('Replicate call failed:', error);
            throw new Error(`Failed to generate AI response: ${error.message}`);
        }
    }

    private async analyzeContent(scrapedData: any): Promise<ContentAnalysis> {
        // Use 'content' field if available, otherwise fallback to description or JSON string
        const contentToAnalyze = scrapedData.content || JSON.stringify(scrapedData).slice(0, 5000);

        const systemPrompt = `You are an expert video content strategist. Output valid JSON only. 
        Schema: {
            "summary": "string",
            "keyPoints": ["string"],
            "tone": "professional" | "energetic" | "calm" | "dramatic",
            "targetAudience": "string",
            "valueProposition": "string (core unique selling point)",
            "keyFeatures": ["string (list of 3-5 distinct features)"]
        }`;

        const prompt = `Analyze the following webpage content for a video adaptation:
      Title: ${scrapedData.title}
      Description: ${scrapedData.description}
      Content: ${contentToAnalyze.slice(0, 10000)}... (truncated if too long)`;

        return this.callReplicate(prompt, systemPrompt);
    }

    private async generateStoryboard(analysis: ContentAnalysis, scrapedData: any): Promise<Storyboard> {
        const targetDuration = this.options.duration || 30;
        const systemPrompt = `You are a professional video director creating a ${targetDuration}-second product introduction video. Output valid JSON only.
        
Schema: {
  "title": "string",
  "totalDuration": ${targetDuration},
  "backgroundMusicStyle": "string",
  "scenes": [{
    "id": "scene_1",
    "sceneNumber": 1,
    "startTime": 0,
    "duration": 5,
    "description": "Visual scene description",
    "narration": "Voiceover text (40-60 words, detailed and engaging, fills the entire scene duration)",
    "visualPrompt": "Detailed image generation prompt for AI",
    "visualType": "screenshot" | "ai_image",
    "transition": "fade" | "slide" | "zoom" | "none",
    "textOverlay": "Optional on-screen text",
    "type": "image"
  }]
}

Requirements:
1. Total duration MUST be exactly ${targetDuration} seconds
2. Generate ${Math.max(4, Math.floor(targetDuration / 8))} to ${Math.min(12, Math.ceil(targetDuration / 5))} scenes
3. Scene structure (scale proportionally to ${targetDuration}s):
   - Opening: Grab attention, show product name
   - Problem: User pain points
   - Solution: How product solves the problem
   - Features: Show key features
   - CTA: Call to action
4. Narration: Each scene narration should be 40-60 words (about 20-30 seconds of speech). Fill the entire scene duration with engaging, detailed speech. Use natural speaking rhythm.
5. visualType: Use "screenshot" for homepage/features, "ai_image" for concepts
6. Transitions: Use "fade" for professional flow, "zoom" for emphasis`;

        const prompt = `Website Analysis:
Title: ${scrapedData.title}
Value Proposition: ${analysis.valueProposition}
Key Features: ${analysis.keyFeatures.join(', ')}
Target Audience: ${analysis.targetAudience}
Tone: ${analysis.tone}

Website Content Summary:
${scrapedData.content?.slice(0, 2000) || scrapedData.description}...

Create a precise 60-second storyboard with engaging visuals and narration.`;

        return this.callReplicate(prompt, systemPrompt);
    }
}
