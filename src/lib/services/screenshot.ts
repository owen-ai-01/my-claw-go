import { scrapeProductUrl } from '@/lib/firecrawl';

/**
 * Capture a screenshot of a website using Firecrawl
 * This uses the cached scrape data if available, or fetches with screenshot included
 */
export async function captureWebsiteScreenshot(url: string): Promise<string> {
  // Use scrapeProductUrl which has caching and includes screenshot
  const result = await scrapeProductUrl(url, { includeScreenshot: true });

  if (!result || !result.screenshot) {
    throw new Error('Screenshot not available in scrape result');
  }

  return result.screenshot; // URL from firecrawl
}

/**
 * Capture screenshots from multiple pages of a website
 */
export async function captureMultipleScreenshots(
  url: string,
  pages: string[] = ['/', '/features', '/pricing']
): Promise<Record<string, string>> {
  const screenshots: Record<string, string> = {};

  for (const page of pages) {
    try {
      const fullUrl = new URL(page, url).toString();
      screenshots[page] = await captureWebsiteScreenshot(fullUrl);
    } catch (error) {
      console.error(`Failed to capture screenshot for ${page}:`, error);
      // Continue with other pages
    }
  }

  return screenshots;
}
