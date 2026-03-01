'use client';

import { HeaderSection } from '@/components/layout/header-section';
import { MessageSquareIcon, SparklesIcon, UploadIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function TutorialSection() {
  const t = useTranslations('HomePage.tutorial');

  const steps = [
    {
      icon: <UploadIcon className="size-8" />,
      title: t('steps.step1.title'),
      description: t('steps.step1.description'),
    },
    {
      icon: <MessageSquareIcon className="size-8" />,
      title: t('steps.step2.title'),
      description: t('steps.step2.description'),
    },
    {
      icon: <SparklesIcon className="size-8" />,
      title: t('steps.step3.title'),
      description: t('steps.step3.description'),
    },
  ];

  return (
    <section id="tutorial" className="px-4 py-16 bg-muted/30">
      <div className="mx-auto max-w-6xl space-y-8 lg:space-y-20">
        <HeaderSection
          title={t('title')}
          subtitle={t('subtitle')}
          subtitleAs="h2"
          description={t('description')}
          descriptionAs="p"
        />

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative flex flex-col items-center text-center space-y-4 p-6 bg-background rounded-lg border shadow-sm"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full text-primary">
                {step.icon}
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute -right-4 top-8 w-8 h-0.5 bg-border" />
              )}
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-lg text-muted-foreground">{t('footer')}</p>
        </div>
      </div>
    </section>
  );
}
