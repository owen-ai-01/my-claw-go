import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import FirecrawlApp from '@mendable/firecrawl-js';
import { z } from 'zod';

const firecrawlKey = process.env.FIRECRAWL_API_KEY;

export const firecrawl = new FirecrawlApp({
    apiKey: firecrawlKey,
});

export type ScrapedProduct = {
    title: string;
    description: string;
    content?: string; // Add this field for full markdown content
    images: string[];
    url: string;
    screenshot?: string;
    _isCached?: boolean; // Internal flag to indicate if data was fetched from cache
};

const CACHE_DIR = process.env.NODE_ENV === 'production'
    ? path.join('/tmp', 'firecrawl-cache')
    : path.join(process.cwd(), '.next/cache/firecrawl');

// Helper to ensure cache dir exists
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

// Helper to get cache file path
function getCacheFilePath(url: string, includeScreenshot: boolean): string {
    const hash = crypto.createHash('md5').update(url + (includeScreenshot ? '_shot' : '')).digest('hex');
    return path.join(CACHE_DIR, `${hash}.json`);
}

export async function scrapeProductUrl(url: string, options: { includeScreenshot?: boolean } = {}): Promise<ScrapedProduct | null> {
    if (!firecrawlKey) {
        console.warn('FIRECRAWL_API_KEY is not set');
        return null;
    }

    // 1. Check Cache
    ensureCacheDir();
    const cacheFile = getCacheFilePath(url, !!options.includeScreenshot);

    if (fs.existsSync(cacheFile)) {
        try {
            const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            console.log(`[Firecrawl] Using cached data for ${url}`);
            return { ...cachedData, _isCached: true };
        } catch (e) {
            console.warn('[Firecrawl] Failed to read cache file, fetching fresh data.');
        }
    }

    const formats = ['markdown', 'extract'];
    if (options.includeScreenshot) {
        formats.push('screenshot');
    }

    try {
        console.log(`[Firecrawl] Fetching fresh data for ${url}`);
        // @ts-ignore - firecrawl sdk types might be mismatching strictly but this is correct for v1
        const scrapeResult = await firecrawl.scrapeUrl(url, {
            formats: formats as any,
            extract: {
                schema: z.object({
                    title: z.string(),
                    description: z.string(),
                    images: z.array(z.string())
                }) as any
            }
        });

        if (!scrapeResult.success) {
            console.error('Firecrawl scrape failed:', scrapeResult.error);
            return null;
        }

        // Default fallback if extraction misses something, though 'extract' should handle it
        const data = scrapeResult.extract || {};

        // Better fallback logic
        const title = data.title || (scrapeResult as any).metadata?.title || '';
        const description = data.description || (scrapeResult as any).metadata?.description || (scrapeResult.markdown ? scrapeResult.markdown.slice(0, 200) : '');

        let images = data.images || [];
        if (images.length === 0 && (scrapeResult as any).metadata?.ogImage) {
            images = [(scrapeResult as any).metadata.ogImage];
        }

        const result: ScrapedProduct = {
            title: title,
            description: description,
            content: scrapeResult.markdown || '', // Save full markdown content
            images: images,
            url,
            screenshot: scrapeResult.screenshot,
            _isCached: false
        };

        // 2. Save to Cache
        fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));

        console.log('[Firecrawl] Scraped Data Result:', JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error('Error scraping product URL:', error);
        return null;
    }
}
