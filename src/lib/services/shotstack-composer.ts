import type { Scene } from '@/lib/agent/url-processor';
import {
  ApiClient,
  AudioAsset,
  Clip,
  Edit,
  EditApi,
  ImageAsset,
  Output,
  Timeline,
  TitleAsset,
  Track,
  Transition,
} from 'shotstack-sdk';
import { QRCodeGenerator } from './qrcode-generator';
import { ReplicateTTSService } from './replicate-tts';

/**
 * Shotstack视频合成服务
 * 使用Shotstack API将图片序列和TTS语音合成为视频
 */
export class ShotstackVideoComposer {
  private client: EditApi;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    let apiKey = process.env.SHOTSTACK_API_KEY;

    // 移除可能的引号
    if (apiKey) {
      apiKey = apiKey.trim().replace(/^["']|["']$/g, '');
    }

    if (!apiKey) {
      throw new Error('SHOTSTACK_API_KEY environment variable is not set');
    }

    this.apiKey = apiKey;
    const shotstackEnv = process.env.SHOTSTACK_ENV || 'stage';
    this.baseUrl = `https://api.shotstack.io/${shotstackEnv}`;
    console.log(`[Shotstack] Using environment: ${shotstackEnv}`);

    // 配置 Shotstack SDK
    const defaultClient = ApiClient.instance;
    defaultClient.basePath = this.baseUrl;

    const DeveloperKey = defaultClient.authentications['DeveloperKey'];
    DeveloperKey.apiKey = apiKey;

    console.log('[Shotstack] ✅ SDK configured successfully');

    this.client = new EditApi();
  }

  /**
   * 使用 Shotstack Create API 生成 TTS 音频
   * @param text 要转换为语音的文本
   * @param voice 语音名称，默认 Matthew (美式英语男声)
   * @returns 生成的音频 URL
   */
  async generateTTS(text: string, voice = 'Matthew'): Promise<string> {
    console.log(
      `[Shotstack TTS] 🎤 Generating TTS for: "${text.slice(0, 50)}..."`
    );

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        if (retry > 0) {
          console.log(
            `[Shotstack TTS] 🔄 Retry attempt ${retry + 1}/${maxRetries}...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待 2 秒后重试
        }

        // 1. 提交 TTS 生成请求
        const createEnv = process.env.SHOTSTACK_ENV || 'stage';
        const createUrl = `https://api.shotstack.io/create/${createEnv}`;
        const response = await fetch(`${createUrl}/assets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
          },
          body: JSON.stringify({
            provider: 'shotstack',
            options: {
              type: 'text-to-speech',
              text: text,
              voice: voice,
              language: 'en-US',
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `TTS request failed: ${response.status} - ${errorText}`
          );
        }

        const result = await response.json();
        const assetId = result.data?.id;

        if (!assetId) {
          throw new Error('No asset ID returned from TTS request');
        }

        console.log(`[Shotstack TTS] 📝 Asset ID: ${assetId}`);

        // 2. 轮询等待 TTS 生成完成
        const audioUrl = await this.pollTTSStatus(assetId);
        console.log(`[Shotstack TTS] ✅ Audio ready: ${audioUrl}`);
        return audioUrl;
      } catch (error: any) {
        lastError = error;
        // 如果是网络错误，继续重试
        if (
          error.cause?.code === 'ECONNRESET' ||
          error.message?.includes('fetch failed')
        ) {
          console.warn(
            `[Shotstack TTS] ⚠️ Network error, will retry: ${error.message}`
          );
          continue;
        }
        // 其他错误直接抛出
        throw error;
      }
    }

    console.error('[Shotstack TTS] ❌ Failed after all retries:', lastError);
    throw lastError;
  }

  /**
   * 轮询 TTS 生成状态
   */
  private async pollTTSStatus(assetId: string): Promise<string> {
    const createUrl = this.baseUrl
      .replace('/edit/', '/create/')
      .replace('/stage', '/create/v1');
    let attempts = 0;
    const maxAttempts = 60; // 最多等待 5 分钟

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 等待 5 秒

      try {
        const response = await fetch(`${createUrl}/assets/${assetId}`, {
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey,
          },
        });

        if (!response.ok) {
          console.warn(
            `[Shotstack TTS] Poll attempt ${attempts} failed: ${response.status}`
          );
          continue;
        }

        const result = await response.json();
        const status = result.data?.attributes?.status;
        const url = result.data?.attributes?.url;

        console.log(`[Shotstack TTS] Status: ${status} (attempt ${attempts})`);

        if (status === 'done' && url) {
          return url;
        }

        if (status === 'failed') {
          throw new Error('TTS generation failed');
        }
      } catch (error) {
        console.warn(`[Shotstack TTS] Poll error:`, error);
      }
    }

    throw new Error('TTS generation timeout');
  }

  /**
   * 使用 REST API 轮询渲染状态（绕过 SDK 反序列化问题）
   */
  private async pollRenderStatusViaRest(renderId: string): Promise<string> {
    console.log('[Shotstack] ⏳ Polling render status via REST API...');

    let attempts = 0;
    const maxAttempts = 60; // 最多等待 5 分钟

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 等待 5 秒

      try {
        const response = await fetch(`${this.baseUrl}/render/${renderId}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'x-api-key': this.apiKey,
          },
        });

        if (!response.ok) {
          console.warn(
            `[Shotstack] Poll attempt ${attempts} failed: ${response.status}`
          );
          continue;
        }

        const result = await response.json();
        const status = result.response?.status;
        const url = result.response?.url;

        console.log(
          `[Shotstack] Render status: ${status} (attempt ${attempts})`
        );

        if (status === 'done' && url) {
          return url;
        }

        if (status === 'failed') {
          const error = result.response?.error || 'Unknown error';
          throw new Error(`Render failed: ${error}`);
        }

        // 状态为 queued, fetching, rendering 等，继续等待
      } catch (error: any) {
        if (error.message?.includes('Render failed')) {
          throw error;
        }
        console.warn(`[Shotstack] Poll error:`, error);
      }
    }

    throw new Error('Render timeout: exceeded maximum wait time (5 minutes)');
  }

  /**
   * 检查 URL 是否需要重新上传（避免 Shotstack 400 错误）
   * Google Cloud Storage 签名 URL 含有特殊字符，Shotstack 无法处理
   * 返回 null 表示 URL 无法处理，应跳过该场景
   */
  private async prepareAssetUrl(url: string): Promise<string | null> {
    // 检测是否是 Google Cloud Storage 签名 URL
    if (url.includes('storage.googleapis.com') && url.includes('Signature=')) {
      console.log(
        '[Shotstack] ⚠️ Skipping Google Cloud Storage signed URL (Shotstack incompatible)'
      );
      console.log('[Shotstack] URL:', url.substring(0, 80) + '...');
      // GCS 签名 URL 无法被 Shotstack 处理，直接跳过
      // 如果需要使用这些 URL，需要先修复 R2 上传权限
      return null;
    }

    return url;
  }

  /**
   * 将场景序列合成为视频
   * @param scenes 场景序列
   * @param sourceUrl 可选的源URL，如果提供会在最后一个场景显示URL和二维码
   */
  async composeVideo(scenes: Scene[], sourceUrl?: string): Promise<string> {
    console.log(
      `[Shotstack] 🎬 Composing video with ${scenes.length} scenes...`
    );
    if (sourceUrl) {
      console.log(
        `[Shotstack] 📱 Will add URL and QR code to final scene: ${sourceUrl.substring(0, 50)}...`
      );
    }

    try {
      // 0. 验证和过滤场景
      const validScenes = scenes.filter((scene) => {
        if (!scene.assetUrl || typeof scene.assetUrl !== 'string') {
          console.warn(
            `[Shotstack] ⚠️ Scene ${scene.id} has no valid assetUrl, skipping`
          );
          return false;
        }
        if (!scene.duration || scene.duration <= 0) {
          console.warn(
            `[Shotstack] ⚠️ Scene ${scene.id} has invalid duration (${scene.duration}), using default 5s`
          );
          scene.duration = 5;
        }
        // 验证 URL 格式
        try {
          new URL(scene.assetUrl);
        } catch {
          console.warn(
            `[Shotstack] ⚠️ Scene ${scene.id} has invalid URL format: ${scene.assetUrl}, skipping`
          );
          return false;
        }
        return true;
      });

      if (validScenes.length === 0) {
        throw new Error('No valid scenes to compose video');
      }

      console.log(
        `[Shotstack] ✅ Validated ${validScenes.length}/${scenes.length} scenes`
      );

      // 0.5 预处理 Asset URLs（过滤不兼容的 URL）
      console.log('[Shotstack] 🔄 Preparing asset URLs...');
      const processedScenes: Scene[] = [];
      for (const scene of validScenes) {
        const preparedUrl = await this.prepareAssetUrl(scene.assetUrl!);
        if (preparedUrl) {
          scene.assetUrl = preparedUrl;
          processedScenes.push(scene);
        } else {
          console.log(
            `[Shotstack] ⏭️ Skipping scene ${scene.id} due to incompatible URL`
          );
        }
      }

      if (processedScenes.length === 0) {
        throw new Error('No scenes with compatible URLs to compose video');
      }

      console.log(
        `[Shotstack] ✅ ${processedScenes.length}/${validScenes.length} scenes have compatible URLs`
      );

      // 打印场景详情便于调试
      processedScenes.forEach((scene, idx) => {
        console.log(
          `[Shotstack] Scene ${idx + 1}: id=${scene.id}, duration=${scene.duration}s, url=${scene.assetUrl?.substring(0, 60)}...`
        );
      });

      // 1. 使用 Replicate Kokoro TTS 为每个场景生成语音
      console.log(
        '[Shotstack] 🎤 Generating TTS with Replicate Kokoro for all scenes...'
      );
      const ttsUrls: Map<string, string> = new Map();

      try {
        const replicateTTS = new ReplicateTTSService();
        for (const scene of processedScenes) {
          if (scene.narration && scene.narration.trim().length > 0) {
            try {
              const audioUrl = await replicateTTS.generateTTS(
                scene.narration,
                'af_bella'
              );
              if (audioUrl && typeof audioUrl === 'string') {
                ttsUrls.set(scene.id, audioUrl);
              }
            } catch (error) {
              console.warn(
                `[Shotstack] ⚠️ TTS failed for scene ${scene.id}, skipping audio:`,
                error
              );
            }
          }
        }
      } catch (error) {
        console.warn(
          '[Shotstack] ⚠️ Replicate TTS service initialization failed, continuing without TTS:',
          error
        );
      }

      console.log(`[Shotstack] ✅ Generated ${ttsUrls.size} TTS audio clips`);

      // 2. 构建视频轨道 - 同时保存原始数据用于 REST API 回退
      let currentTime = 0;
      const videoClips: Clip[] = [];
      const audioClips: Clip[] = [];

      // 原始数据用于 REST API 回退
      const rawVideoData: Array<{
        src: string;
        start: number;
        length: number;
        transition?: boolean;
      }> = [];
      const rawAudioData: Array<{
        src: string;
        start: number;
        length: number;
        volume: number;
      }> = [];
      const rawTextData: Array<{
        text: string;
        start: number;
        length: number;
      }> = [];
      // QR码和URL叠加数据 (用于最后一个场景)
      const rawQrOverlay: Array<{
        src: string;
        start: number;
        length: number;
      }> = [];
      const rawUrlTextOverlay: Array<{
        text: string;
        start: number;
        length: number;
      }> = [];

      // 生成QR码URL (如果提供了sourceUrl)
      let qrCodeUrl: string | null = null;
      if (sourceUrl) {
        try {
          const qrGenerator = new QRCodeGenerator();
          qrCodeUrl = await qrGenerator.generateAccessibleUrl(sourceUrl);
          console.log(
            `[Shotstack] 📱 QR code URL generated: ${qrCodeUrl.substring(0, 80)}...`
          );
        } catch (error) {
          console.warn(
            '[Shotstack] ⚠️ Failed to generate QR code, continuing without it:',
            error
          );
        }
      }

      for (const scene of processedScenes) {
        // 图片 clip
        const imageAsset = new ImageAsset().setSrc(scene.assetUrl!);

        const imageClip = new Clip()
          .setAsset(imageAsset)
          .setStart(currentTime)
          .setLength(scene.duration)
          .setTransition(new Transition().setIn('fade').setOut('fade'));

        videoClips.push(imageClip);
        rawVideoData.push({
          src: scene.assetUrl!,
          start: currentTime,
          length: scene.duration,
          transition: true,
        });

        // TTS 音频 clip
        const ttsUrl = ttsUrls.get(scene.id);
        if (ttsUrl) {
          const audioAsset = new AudioAsset().setSrc(ttsUrl).setVolume(1.0);

          const audioClip = new Clip()
            .setAsset(audioAsset)
            .setStart(currentTime)
            .setLength(scene.duration);

          audioClips.push(audioClip);
          rawAudioData.push({
            src: ttsUrl,
            start: currentTime,
            length: scene.duration,
            volume: 1.0,
          });
        }

        // 文字叠加 - 仅当有有效内容时
        if (scene.textOverlay && scene.textOverlay.trim().length > 0) {
          const textAsset = new TitleAsset()
            .setText(scene.textOverlay)
            .setStyle('minimal')
            .setPosition('center')
            .setSize('medium');

          const textClip = new Clip()
            .setAsset(textAsset)
            .setStart(currentTime)
            .setLength(scene.duration);

          videoClips.push(textClip);
          rawTextData.push({
            text: scene.textOverlay,
            start: currentTime,
            length: scene.duration,
          });
        }

        currentTime += scene.duration;
      }

      // 在最后一个场景添加URL和QR码叠加
      if (sourceUrl && processedScenes.length > 0) {
        const lastScene = processedScenes[processedScenes.length - 1];
        const lastSceneStart = currentTime - lastScene.duration;

        // 添加URL文字叠加 (在底部显示)
        const urlDisplayText =
          sourceUrl.length > 50
            ? sourceUrl.substring(0, 47) + '...'
            : sourceUrl;
        rawUrlTextOverlay.push({
          text: urlDisplayText,
          start: lastSceneStart,
          length: lastScene.duration,
        });
        console.log(`[Shotstack] 📝 Added URL text overlay: ${urlDisplayText}`);

        // 添加QR码图片叠加 (在右下角显示)
        if (qrCodeUrl) {
          rawQrOverlay.push({
            src: qrCodeUrl,
            start: lastSceneStart,
            length: lastScene.duration,
          });
          console.log(`[Shotstack] 📱 Added QR code overlay to final scene`);
        }
      }

      console.log(
        `[Shotstack] Built ${videoClips.length} video clips, ${audioClips.length} audio clips, total duration: ${currentTime}s`
      );

      // 3. 创建轨道（视频和音频分开）
      const tracks: Track[] = [new Track().setClips(videoClips)];

      if (audioClips.length > 0) {
        tracks.push(new Track().setClips(audioClips));
      }

      // 4. 创建时间轴
      const timeline = new Timeline()
        .setTracks(tracks)
        .setBackground('#000000');

      // 5. 创建输出配置
      const output = new Output()
        .setFormat('mp4')
        .setResolution('hd')
        .setAspectRatio('16:9');

      // 6. 创建编辑任务
      const edit = new Edit().setTimeline(timeline).setOutput(output);

      // 7. 提交渲染任务
      console.log('[Shotstack] 📤 Submitting render job...');

      try {
        const renderResponse = await this.client.postRender(edit);
        console.log(
          '[Shotstack] Raw response:',
          JSON.stringify(renderResponse, null, 2)
        );

        const renderId =
          renderResponse.response?.id || renderResponse.data?.response?.id;

        if (!renderId) {
          console.error(
            '[Shotstack] Invalid response structure:',
            JSON.stringify(renderResponse, null, 2)
          );
          throw new Error('Failed to get render ID from Shotstack');
        }

        console.log(`[Shotstack] 🎯 Render job submitted: ${renderId}`);

        // 8. 轮询等待渲染完成
        const videoUrl = await this.pollRenderStatusViaRest(renderId);
        console.log(`[Shotstack] ✅ Video composition complete: ${videoUrl}`);
        return videoUrl;
      } catch (apiError: any) {
        // 详细的 API 错误日志
        console.error('[Shotstack] API Error Details:');
        console.error('  - Message:', apiError.message);
        console.error('  - Status:', apiError.status || apiError.statusCode);
        console.error(
          '  - Body:',
          JSON.stringify(apiError.body || apiError.response?.body, null, 2)
        );

        // 尝试使用 REST API 直接提交
        console.log('[Shotstack] 🔄 Trying fallback with REST API...');
        const renderId = await this.submitRenderViaRest(
          rawVideoData,
          rawAudioData,
          rawTextData,
          rawQrOverlay,
          rawUrlTextOverlay
        );
        const videoUrl = await this.pollRenderStatusViaRest(renderId);
        console.log(
          `[Shotstack] ✅ Video composition complete (via REST): ${videoUrl}`
        );
        return videoUrl;
      }
    } catch (error) {
      console.error('[Shotstack] ❌ Composition failed:', error);
      throw error;
    }
  }

  /**
   * 使用 REST API 直接提交渲染任务（绕过 SDK 问题）
   */
  private async submitRenderViaRest(
    videoClipData: Array<{
      src: string;
      start: number;
      length: number;
      transition?: boolean;
    }>,
    audioClipData: Array<{
      src: string;
      start: number;
      length: number;
      volume: number;
    }>,
    textClipData: Array<{ text: string; start: number; length: number }>,
    qrOverlayData: Array<{ src: string; start: number; length: number }> = [],
    urlTextOverlayData: Array<{
      text: string;
      start: number;
      length: number;
    }> = []
  ): Promise<string> {
    console.log('[Shotstack] 📤 Submitting render via REST API...');

    // 构建视频轨道 clips
    const videoClips = videoClipData.map((clip) => {
      const baseClip: any = {
        asset: { type: 'image', src: clip.src },
        start: clip.start,
        length: clip.length,
      };
      if (clip.transition) {
        baseClip.transition = { in: 'fade', out: 'fade' };
      }
      return baseClip;
    });

    // 添加文字叠加到视频轨道
    textClipData.forEach((clip) => {
      videoClips.push({
        asset: {
          type: 'title',
          text: clip.text,
          style: 'minimal',
          position: 'center',
          size: 'medium',
        },
        start: clip.start,
        length: clip.length,
      });
    });

    // 添加URL文字叠加 (在底部显示)
    urlTextOverlayData.forEach((clip) => {
      videoClips.push({
        asset: {
          type: 'title',
          text: clip.text,
          style: 'skinny',
          position: 'bottom',
          size: 'x-small',
          color: '#ffffff',
          background: '#00000099',
        },
        start: clip.start,
        length: clip.length,
      });
    });

    // 添加QR码图片叠加 (在右下角显示)
    qrOverlayData.forEach((clip) => {
      videoClips.push({
        asset: {
          type: 'image',
          src: clip.src,
        },
        start: clip.start,
        length: clip.length,
        position: 'bottomRight',
        offset: {
          x: -0.05,
          y: 0.08,
        },
        scale: 0.15,
      });
    });

    // 构建音频轨道 clips
    const audioClips = audioClipData.map((clip) => ({
      asset: { type: 'audio', src: clip.src, volume: clip.volume },
      start: clip.start,
      length: clip.length,
    }));

    // 构建请求体
    const tracks: any[] = [{ clips: videoClips }];
    if (audioClips.length > 0) {
      tracks.push({ clips: audioClips });
    }

    const requestBody = {
      timeline: {
        tracks: tracks,
        background: '#000000',
      },
      output: {
        format: 'mp4',
        resolution: 'hd',
        aspectRatio: '16:9',
      },
    };

    console.log(
      '[Shotstack] REST Request body:',
      JSON.stringify(requestBody, null, 2)
    );

    const response = await fetch(`${this.baseUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Shotstack] REST API Error:', response.status, errorText);
      throw new Error(
        `Shotstack render failed: ${response.status} - ${errorText}`
      );
    }

    const result = await response.json();
    const renderId = result.response?.id;

    if (!renderId) {
      throw new Error('No render ID returned from REST API');
    }

    console.log(`[Shotstack] 🎯 Render job submitted via REST: ${renderId}`);
    return renderId;
  }

  /**
   * 获取渲染任务状态
   */
  async getRenderStatus(renderId: string): Promise<string> {
    const response = await this.client.getRender(renderId);
    const responseData = response.response || response.data?.response;
    return responseData?.status || 'unknown';
  }
}
