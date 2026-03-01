import { HeaderSection } from '@/components/layout/header-section';
import { useTranslations } from 'next-intl';

export default function SeoTextSection({ namespace = 'HomePage.seoText' }: { namespace?: string }) {
  const t = useTranslations(namespace as any) as any;

  return (
    <section className="px-4 py-16 bg-muted/30">
      <div className="mx-auto max-w-4xl space-y-12">
        <HeaderSection title={t('title')} subtitleAs="h2" />

        <div className="prose prose-gray dark:prose-invert mx-auto max-w-none space-y-8">
          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section1.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section1.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section2.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section2.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section3.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section3.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section4.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section4.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section5.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section5.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section6.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section6.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section7.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section7.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section8.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section8.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section9.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section9.content')}
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold mb-4">{t('section10.title')}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t('section10.content')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
