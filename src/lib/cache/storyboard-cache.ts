import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Storyboard } from '@/lib/agent/url-processor';

const CACHE_DIR = process.env.NODE_ENV === 'production'
    ? path.join('/tmp', 'storyboard-cache')
    : path.join(process.cwd(), '.next/cache/storyboard');

/**
 * Storyboard缓存管理类
 * 用于缓存已生成的分镜脚本，避免重复调用AI生成
 */
export class StoryboardCache {
    /**
     * 根据URL生成缓存键（MD5哈希）
     */
    private getCacheKey(url: string): string {
        return crypto.createHash('md5').update(url).digest('hex');
    }

    /**
     * 获取缓存文件路径
     */
    private getCacheFilePath(url: string): string {
        const key = this.getCacheKey(url);
        return path.join(CACHE_DIR, `${key}.json`);
    }

    /**
     * 确保缓存目录存在
     */
    private ensureCacheDir(): void {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
    }

    /**
     * 从缓存读取 storyboard
     */
    async get(url: string): Promise<Storyboard | null> {
        try {
            const cacheFile = this.getCacheFilePath(url);

            if (fs.existsSync(cacheFile)) {
                const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                console.log(`[StoryboardCache] ✅ Using cached storyboard for ${url}`);
                return data as Storyboard;
            }

            return null;
        } catch (error) {
            console.error('[StoryboardCache] Error reading cache:', error);
            return null;
        }
    }

    /**
     * 保存 storyboard 到缓存
     */
    async set(url: string, storyboard: Storyboard): Promise<void> {
        try {
            this.ensureCacheDir();
            const cacheFile = this.getCacheFilePath(url);

            fs.writeFileSync(cacheFile, JSON.stringify(storyboard, null, 2));
            console.log(`[StoryboardCache] 💾 Saved storyboard to cache for ${url}`);
        } catch (error) {
            console.error('[StoryboardCache] Error writing cache:', error);
        }
    }

    /**
     * 清除指定URL的缓存
     */
    async clear(url: string): Promise<void> {
        try {
            const cacheFile = this.getCacheFilePath(url);
            if (fs.existsSync(cacheFile)) {
                fs.unlinkSync(cacheFile);
                console.log(`[StoryboardCache] 🗑️ Cleared cache for ${url}`);
            }
        } catch (error) {
            console.error('[StoryboardCache] Error clearing cache:', error);
        }
    }

    /**
     * 清除所有缓存
     */
    async clearAll(): Promise<void> {
        try {
            if (fs.existsSync(CACHE_DIR)) {
                const files = fs.readdirSync(CACHE_DIR);
                files.forEach(file => {
                    fs.unlinkSync(path.join(CACHE_DIR, file));
                });
                console.log(`[StoryboardCache] 🗑️ Cleared all cache (${files.length} files)`);
            }
        } catch (error) {
            console.error('[StoryboardCache] Error clearing all cache:', error);
        }
    }
}
