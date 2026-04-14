import { Analytics } from '@/analytics/analytics';
import {
  fontBricolageGrotesque,
  fontInter,
  fontNotoSansMono,
  fontNotoSerif,
} from '@/assets/fonts';
import AffonsoScript from '@/components/affiliate/affonso';
import PromotekitScript from '@/components/affiliate/promotekit';
import { TailwindIndicator } from '@/components/layout/tailwind-indicator';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';
import { type Locale, NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Providers } from './providers';

import '@/styles/globals.css';
import { JsonLd } from '@/components/seo/json-ld';
import { RootUtmCapture } from '@/components/shared/root-utm-capture';
import { websiteConfig } from '@/config/website';
import { getBaseUrl, getImageUrl } from '@/lib/urls/urls';

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
}

/**
 * 1. Locale Layout
 * https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#layout
 *
 * 2. NextIntlClientProvider
 * https://next-intl.dev/docs/usage/configuration#nextintlclientprovider
 */
export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('title'),
    description: t('description'),
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon-16x16.png',
      apple: '/apple-touch-icon.png',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'Metadata' });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: t('name'),
        url: getBaseUrl(),
        logo: {
          '@type': 'ImageObject',
          url: getImageUrl(websiteConfig.metadata?.images?.logoLight ?? ''),
        },
        sameAs: Object.values(websiteConfig.metadata?.social ?? {}),
      },
      {
        '@type': 'WebSite',
        name: t('name'),
        url: getBaseUrl(),
      },
    ],
  };

  return (
    <html suppressHydrationWarning lang={locale}>
      <head>
        <AffonsoScript />
        <PromotekitScript />
        <JsonLd data={jsonLd} />
      </head>
      <body
        suppressHydrationWarning
        className={cn(
          'size-full antialiased',
          fontInter.className,
          fontNotoSerif.variable,
          fontNotoSansMono.variable,
          fontBricolageGrotesque.variable
        )}
      >
        <NuqsAdapter>
          <NextIntlClientProvider>
            <Providers locale={locale}>
              <RootUtmCapture />
              {children}

              <Toaster richColors position="top-right" offset={64} />
              <TailwindIndicator />
              <Analytics />
            </Providers>
          </NextIntlClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
