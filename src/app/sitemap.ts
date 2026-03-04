import { websiteConfig } from '@/config/website';
import { getLocalePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { generateHreflangUrls } from '@/lib/hreflang';
import { blogSource, categorySource, source } from '@/lib/source';
import type { MetadataRoute } from 'next';
import type { Locale } from 'next-intl';
import { getBaseUrl } from '../lib/urls/urls';

type Href = Parameters<typeof getLocalePathname>[0]['href'];

/**
 * static routes for sitemap, you may change the routes for your own
 * Only include public pages that should be indexed by search engines
 */
// Priority pages for SEO - only include pages with real content value
const staticRoutes: Array<{
  path: string;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
  priority: number;
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  ...(websiteConfig.blog.enable
    ? [{ path: '/blog', changeFrequency: 'weekly' as const, priority: 0.8 }]
    : []),
];

const SITE_LAST_MODIFIED = new Date('2026-03-04').toISOString();

/**
 * Generate a sitemap for the website with hreflang support
 *
 * https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps
 * https://github.com/javayhu/cnblocks/blob/main/app/sitemap.ts
 * https://ahrefs.com/blog/hreflang-tags/
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitemapList: MetadataRoute.Sitemap = []; // final result

  // add static routes (en only — DE disabled until localised content is ready)
  sitemapList.push(
    ...staticRoutes.map(({ path, changeFrequency, priority }) => ({
      url: getUrl(path, routing.defaultLocale),
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency,
      priority,
      alternates: {
        languages: generateHreflangUrls(path),
      },
    }))
  );

  // add blog related routes if enabled
  if (websiteConfig.blog.enable) {
    // add paginated blog list pages
    routing.locales.forEach((locale) => {
      const posts = blogSource
        .getPages(locale)
        .filter((post) => post.data.published);
      const totalPages = Math.max(
        1,
        Math.ceil(posts.length / websiteConfig.blog.paginationSize)
      );
      // /blog/page/[page] (from 2)
      for (let page = 2; page <= totalPages; page++) {
        sitemapList.push({
          url: getUrl(`/blog/page/${page}`, locale),
          alternates: {
            languages: generateHreflangUrls(`/blog/page/${page}`),
          },
        });
      }
    });

    // add paginated category pages
    routing.locales.forEach((locale) => {
      const localeCategories = categorySource.getPages(locale);
      localeCategories.forEach((category) => {
        // posts in this category and locale
        const postsInCategory = blogSource
          .getPages(locale)
          .filter((post) => post.data.published)
          .filter((post) =>
            post.data.categories.some((cat) => cat === category.slugs[0])
          );
        const totalPages = Math.max(
          1,
          Math.ceil(postsInCategory.length / websiteConfig.blog.paginationSize)
        );
        // /blog/category/[slug] (first page)
        sitemapList.push({
          url: getUrl(`/blog/category/${category.slugs[0]}`, locale),
          alternates: {
            languages: generateHreflangUrls(
              `/blog/category/${category.slugs[0]}`
            ),
          },
        });
        // /blog/category/[slug]/page/[page] (from 2)
        for (let page = 2; page <= totalPages; page++) {
          sitemapList.push({
            url: getUrl(
              `/blog/category/${category.slugs[0]}/page/${page}`,
              locale
            ),
            alternates: {
              languages: generateHreflangUrls(
                `/blog/category/${category.slugs[0]}/page/${page}`
              ),
            },
          });
        }
      });
    });

    // add posts (single post pages)
    routing.locales.forEach((locale) => {
      const posts = blogSource
        .getPages(locale)
        .filter((post) => post.data.published);
      posts.forEach((post) => {
        sitemapList.push({
          url: getUrl(`/blog/${post.slugs.join('/')}`, locale),
          alternates: {
            languages: generateHreflangUrls(`/blog/${post.slugs.join('/')}`),
          },
        });
      });
    });
  }

  // add docs related routes if enabled
  if (websiteConfig.docs.enable) {
    const docsParams = source.generateParams();
    sitemapList.push(
      ...docsParams.flatMap((param) =>
        routing.locales.map((locale) => ({
          url: getUrl(`/docs/${param.slug.join('/')}`, locale),
          alternates: {
            languages: generateHreflangUrls(`/docs/${param.slug.join('/')}`),
          },
        }))
      )
    );
  }

  return sitemapList;
}

function getUrl(href: Href, locale: Locale) {
  const pathname = getLocalePathname({ locale, href });
  const baseUrl = getBaseUrl();
  // Remove trailing slash from baseUrl to avoid double slashes
  return baseUrl.replace(/\/$/, '') + pathname;
}
