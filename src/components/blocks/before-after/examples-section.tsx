'use client';

import { useTranslations } from 'next-intl';
import BeforeAfter from './before-after';

export default function ExamplesSection() {
  const t = useTranslations('HomePage.examples');

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">{t('title')}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('description')}
          </p>
        </div>

        {/* Before/After Example */}
        <div className="max-w-4xl mx-auto">
          <BeforeAfter
            beforeImage="/HintergrundEntfernenVor.jpg"
            afterImage="/HintergrundEntfernenNach.jpg"
            className="shadow-2xl"
          />
        </div>
      </div>
    </section>
  );
}
