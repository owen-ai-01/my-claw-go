import { S3Provider } from '@/storage/provider/s3';

/**
 * OpenAI TTS 服务
 * 使用 OpenAI Text-to-Speech API 生成语音
 * 价格: $0.015/1000字符 (TTS Standard)
 */
export class OpenAITTSService {
    private apiKey: string;
    private s3Provider: S3Provider;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        this.apiKey = apiKey;
        this.s3Provider = new S3Provider();
    }

    /**
     * 生成 TTS 音频
     * @param text 要转换的文本
     * @param voice 声音类型 (alloy, echo, fable, onyx, nova, shimmer)
     * @returns 公开可访问的音频 URL
     */
    async generateTTS(text: string, voice: string = 'onyx'): Promise<string> {
        console.log(`[OpenAI TTS] 🎤 Generating TTS for: "${text.slice(0, 50)}..."`);
        console.log(`[OpenAI TTS] Voice: ${voice}, Text length: ${text.length} chars`);

        try {
            // 调用 OpenAI TTS API
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: voice,
                    response_format: 'mp3',
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI TTS failed: ${response.status} - ${errorText}`);
            }

            // 获取音频数据
            const audioBuffer = Buffer.from(await response.arrayBuffer());
            console.log(`[OpenAI TTS] Generated audio: ${audioBuffer.length} bytes`);

            // 上传到 S3
            const filename = `tts-${Date.now()}.mp3`;
            const result = await this.s3Provider.uploadFile({
                file: audioBuffer,
                filename: filename,
                contentType: 'audio/mpeg',
                folder: 'tts',
            });

            console.log(`[OpenAI TTS] ✅ Audio uploaded: ${result.url}`);
            return result.url;
        } catch (error) {
            console.error('[OpenAI TTS] ❌ Failed:', error);
            throw error;
        }
    }

    /**
     * 批量生成 TTS
     * @param texts 文本数组
     * @param voice 声音类型
     * @returns 音频 URL 数组
     */
    async generateBatchTTS(texts: string[], voice: string = 'onyx'): Promise<(string | null)[]> {
        const results: (string | null)[] = [];

        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            if (!text || text.trim().length === 0) {
                results.push(null);
                continue;
            }

            try {
                const url = await this.generateTTS(text, voice);
                results.push(url);
            } catch (error) {
                console.warn(`[OpenAI TTS] ⚠️ Failed for text ${i + 1}, skipping`);
                results.push(null);
            }
        }

        return results;
    }
}
