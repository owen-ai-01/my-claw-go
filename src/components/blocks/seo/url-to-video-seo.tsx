'use client';

import { HeaderSection } from '@/components/layout/header-section';
import { useTranslations } from 'next-intl';

export default function UrlToVideoSeoSection() {
  const t = useTranslations('HomePage.urlToVideoSeo');

  return (
    <section id="url-to-video-seo" className="px-4 py-16 bg-muted/30">
      <div className="mx-auto max-w-4xl">
        <HeaderSection
          title={t('title')}
          titleAs="h2"
          subtitle={t('subtitle')}
          subtitleAs="p"
        />

        <div className="mt-12 space-y-12">
          {/* What is URL to Video */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <h3 className="text-2xl font-bold mb-4">{t('what.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('what.content')}
            </p>
          </div>

          {/* Why URL to Video */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <h3 className="text-2xl font-bold mb-4">{t('why.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('why.content')}
            </p>
          </div>

          {/* How URL to Video Works */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <h3 className="text-2xl font-bold mb-4">{t('how.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('how.content')}
            </p>
          </div>

          {/* URL to Video Features */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <h3 className="text-2xl font-bold mb-4">{t('features.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('features.content')}
            </p>
          </div>

          {/* URL to Video Use Cases */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <h3 className="text-2xl font-bold mb-4">{t('useCases.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('useCases.content')}
            </p>
          </div>

          {/* Conclusion */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <h3 className="text-2xl font-bold mb-4">{t('conclusion.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('conclusion.content')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
