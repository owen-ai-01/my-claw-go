import Replicate from 'replicate';

/**
 * Replicate Kokoro TTS 服务
 * 使用 Replicate 上的 jaaari/kokoro-82m 模型生成语音
 * 免费/低成本的高质量 TTS
 */
export class ReplicateTTSService {
  private replicate: Replicate;

  constructor() {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN environment variable is not set');
    }
    this.replicate = new Replicate({ auth: apiToken });
  }

  /**
   * 生成 TTS 音频
   * @param text 要转换的文本
   * @param voice 声音类型 (af_bella, af_nicole, af_sarah, am_adam, am_michael, bf_emma, bm_george 等)
   * @returns 公开可访问的音频 URL
   */
  async generateTTS(text: string, voice = 'af_bella'): Promise<string> {
    console.log(
      `[Replicate TTS] 🎤 Generating TTS for: "${text.slice(0, 50)}..."`
    );
    console.log(
      `[Replicate TTS] Voice: ${voice}, Text length: ${text.length} chars`
    );

    try {
      // 使用 predictions.create 获取更详细的响应
      // 注意：社区模型需要使用 version 参数而不是 model 参数
      const prediction = await this.replicate.predictions.create({
        version:
          'f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13',
        input: {
          text: text,
          voice: voice,
          speed: 1.0,
        },
      });

      console.log(
        `[Replicate TTS] Prediction ID: ${prediction.id}, Status: ${prediction.status}`
      );

      // 轮询等待预测完成
      let result = prediction;
      const maxAttempts = 60; // 最多等待 5 分钟
      let attempts = 0;

      while (
        result.status !== 'succeeded' &&
        result.status !== 'failed' &&
        attempts < maxAttempts
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待 2 秒
        result = await this.replicate.predictions.get(prediction.id);
        attempts++;
        console.log(
          `[Replicate TTS] Polling attempt ${attempts}: ${result.status}`
        );
      }

      if (result.status === 'failed') {
        throw new Error(
          `TTS prediction failed: ${result.error || 'Unknown error'}`
        );
      }

      if (result.status !== 'succeeded') {
        throw new Error(`TTS prediction timed out after ${attempts} attempts`);
      }

      console.log(
        `[Replicate TTS] Raw output:`,
        JSON.stringify(result.output, null, 2)
      );

      // 解析输出 URL
      let audioUrl: string | undefined;
      const output = result.output;

      if (typeof output === 'string') {
        audioUrl = output;
      } else if (output && typeof output === 'object') {
        // FileOutput 对象
        if ('url' in output && typeof (output as any).url === 'function') {
          audioUrl = await (output as any).url();
        } else if ('url' in output && typeof (output as any).url === 'string') {
          audioUrl = (output as any).url;
        }
        // 数组格式
        else if (Array.isArray(output) && output.length > 0) {
          const firstItem = output[0];
          if (typeof firstItem === 'string') {
            audioUrl = firstItem;
          } else if (
            firstItem &&
            typeof firstItem === 'object' &&
            'url' in firstItem
          ) {
            audioUrl =
              typeof firstItem.url === 'function'
                ? await firstItem.url()
                : firstItem.url;
          }
        }
      }

      if (!audioUrl || typeof audioUrl !== 'string') {
        throw new Error(
          `No valid audio URL in prediction output: ${JSON.stringify(output)}`
        );
      }

      console.log(
        `[Replicate TTS] 📥 Got audio URL: ${audioUrl.substring(0, 60)}...`
      );

      // 直接使用 Replicate 返回的 URL，无需再上传到 S3
      // Replicate 的 URL 是公开可访问的
      console.log(`[Replicate TTS] ✅ Using Replicate audio URL directly`);
      return audioUrl;
    } catch (error) {
      console.error('[Replicate TTS] ❌ Failed:', error);
      throw error;
    }
  }

  /**
   * 批量生成 TTS
   * @param texts 文本数组
   * @param voice 声音类型
   * @returns 音频 URL 数组
   */
  async generateBatchTTS(
    texts: string[],
    voice = 'af_bella'
  ): Promise<(string | null)[]> {
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
        console.warn(`[Replicate TTS] ⚠️ Failed for text ${i + 1}, skipping`);
        results.push(null);
      }
    }

    return results;
  }
}
