import { websiteConfig } from '@/config/website';
import { defaultMessages } from '@/i18n/messages';
import { routing } from '@/i18n/routing';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { generateAlternates, getCurrentHreflang } from './hreflang';
import { getBaseUrl, getImageUrl, getUrlWithLocale } from './urls/urls';

/**
 * Construct the metadata object for the current page (in docs/guides)
 */
export function constructMetadata({
  title,
  description,
  image,
  noIndex = false,
  locale,
  pathname,
}: {
  title?: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
  locale?: Locale;
  pathname?: string;
} = {}): Metadata {
  title = title || defaultMessages.Metadata.title;
  description = description || defaultMessages.Metadata.description;
  image = image || websiteConfig.metadata.images?.ogImage;
  const ogImageUrl = getImageUrl(image || '');

  // Generate canonical URL from pathname and locale
  let canonicalUrl: string | undefined;
  try {
    canonicalUrl =
      pathname && locale ? getUrlWithLocale(pathname, locale) : undefined;
  } catch (error) {
    console.warn('Failed to generate canonical URL:', error);
    canonicalUrl = undefined;
  }

  // Generate hreflang alternates if pathname is provided and we have multiple locales
  let alternates: { canonical?: string } | undefined;
  try {
    alternates =
      pathname && routing.locales.length > 1
        ? {
            canonical: canonicalUrl,
            ...generateAlternates(pathname),
          }
        : canonicalUrl
          ? { canonical: canonicalUrl }
          : undefined;
  } catch (error) {
    console.warn('Failed to generate alternates:', error);
    alternates = canonicalUrl ? { canonical: canonicalUrl } : undefined;
  }

  return {
    title,
    description,
    alternates,
    openGraph: {
      type: 'website',
      locale: locale ? getCurrentHreflang(locale).replace('-', '_') : 'de_DE',
      url: canonicalUrl,
      title,
      description,
      siteName: defaultMessages.Metadata.name,
      images: [ogImageUrl.toString()],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl.toString()],
      site: getBaseUrl(),
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon-32x32.png',
      apple: '/apple-touch-icon.png',
    },
    metadataBase: new URL(getBaseUrl()),
    manifest: `${getBaseUrl()}/manifest.webmanifest`,
    ...(noIndex && {
      robots: {
        index: false,
        follow: false,
      },
    }),
  };
}
