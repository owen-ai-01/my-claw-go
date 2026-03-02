import { ShotstackVideoComposer } from '@/lib/services/shotstack-composer';
import type { GeneratedAssets } from './url-processor';

export class VideoComposer {
  async compose(assets: GeneratedAssets, sourceUrl?: string): Promise<string> {
    console.log('Composing video with Shotstack API...');
    if (sourceUrl) {
      console.log(
        `  - Source URL will be shown on final scene: ${sourceUrl.substring(0, 50)}...`
      );
    }

    try {
      // 使用Shotstack合成视频（包含TTS）
      const composer = new ShotstackVideoComposer();
      const videoUrl = await composer.composeVideo(assets.scenes, sourceUrl);

      console.log('✅ Video composition complete:', videoUrl);
      return videoUrl;
    } catch (error) {
      console.error('❌ Video composition failed:', error);

      // 如果失败，返回一个临时的manifest JSON作为后备
      console.log('[Fallback] Creating video manifest JSON...');

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        scenes: assets.scenes.map((scene) => ({
          id: scene.id,
          duration: scene.duration,
          type: scene.type,
          url: scene.assetUrl,
          description: scene.description,
          narration: scene.narration,
        })),
      };

      // 返回一个指示失败的URL（前端可以检测并处理）
      return `data:application/json;base64,${Buffer.from(JSON.stringify(manifest, null, 2)).toString('base64')}`;
    }
  }
}
