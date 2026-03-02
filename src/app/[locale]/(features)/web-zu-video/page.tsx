import VideoGenerator from '@/components/blocks/video-generation/video-generator';
import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return constructMetadata({
    title: `Web zu Video | ${t('title')}`,
    description: t('description'),
    locale,
    pathname: '/web-zu-video',
  });
}

import { Footer } from '@/components/layout/footer';
import { StudioLayout } from '@/components/studio/studio-layout';

export default function WebToVideoPage() {
  return (
    <StudioLayout>
      <div className="flex flex-col gap-16 pb-24">
        <div className="container mx-auto px-4 mt-8">
          <VideoGenerator defaultMode="web-to-video" isStudioMode={true} />
        </div>
        {/* 
                  We can add Showcase/Tutorial/FAQ later or reuse existing ones if generic enough. 
                  For now, keeping it simple as per plan.
                */}
      </div>
      <Footer />
    </StudioLayout>
  );
}
