import { Storyboard, GeneratedAssets } from './url-processor';
import { generateImagesForScenes, type BrandInfo } from '@/lib/services/image-generator';
import { uploadFile } from '@/storage';

export class AssetGenerator {
    async generateAssets(
        storyboard: Storyboard,
        websiteUrl: string,
        brandInfo?: BrandInfo
    ): Promise<GeneratedAssets> {
        console.log('Generating assets for storyboard:', storyboard.title);

        const scenes = [...storyboard.scenes];

        try {
            // 暂时跳过截图功能（Firecrawl 返回的 GCS 签名 URL 会过期）
            // 将所有 screenshot 类型的场景改为使用 AI 图片
            for (const scene of scenes) {
                if (scene.visualType === 'screenshot') {
                    scene.visualType = 'ai_image';
                    // 为截图场景添加一个合适的 AI 图片描述
                    if (!scene.visualPrompt || scene.visualPrompt.includes('screenshot')) {
                        scene.visualPrompt = `Professional website interface mockup, modern UI design, clean layout, ${scene.description}`;
                    }
                    console.log(`[AssetGenerator] Converted scene ${scene.id} from screenshot to AI image`);
                }
            }

            // Generate AI images for all scenes
            const aiImageMap = await generateImagesForScenes(scenes, brandInfo);

            // Assign assets to scenes - use direct URLs from Replicate
            for (const scene of scenes) {
                try {
                    const imageUrl = aiImageMap.get(scene.id);
                    if (imageUrl && typeof imageUrl === 'string') {
                        // Use Replicate URL directly
                        scene.assetUrl = imageUrl;
                        console.log(`Assigned AI image URL to scene ${scene.id}`);
                    } else if (imageUrl) {
                        console.error(`Invalid imageUrl type for scene ${scene.id}:`, typeof imageUrl, imageUrl);
                    }

                    if (!scene.assetUrl) {
                        scene.assetUrl = `https://placehold.co/1920x1080/png?text=Scene+${scene.sceneNumber}`;
                    }
                } catch (error) {
                    console.error(`Failed to process asset for scene ${scene.id}:`, error);
                    scene.assetUrl = `https://placehold.co/1920x1080/png?text=Scene+${scene.sceneNumber}`;
                }
            }

            console.log('Assets generation complete.');

            // TODO: Generate audio (TTS + background music)
            const audioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

            return { scenes, audioUrl };

        } catch (error) {
            console.error('Error generating assets:', error);
            scenes.forEach(scene => {
                if (!scene.assetUrl) {
                    scene.assetUrl = `https://placehold.co/1920x1080/png?text=Scene+${scene.sceneNumber}`;
                }
            });
            return { scenes };
        }
    }

    private async uploadAsset(assetData: string, filename: string): Promise<string> {
        if (assetData.startsWith('http')) {
            return assetData;
        }

        try {
            const base64Data = assetData.includes(',') ? assetData.split(',')[1] : assetData;
            const buffer = Buffer.from(base64Data, 'base64');
            const result = await uploadFile(buffer, `${filename}.png`, 'image/png', 'video-assets');
            return result.url;
        } catch (error) {
            console.error('Failed to upload asset:', error);
            throw error;
        }
    }
}
