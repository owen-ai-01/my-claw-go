import HeroUrlToVideo from '@/components/blocks/hero/hero-url-to-video';
import AiVideoFeatures from '@/components/blocks/features/ai-video-features';
import HowItWorks from '@/components/blocks/tutorial/how-it-works';
import UrlToVideoSeoSection from '@/components/blocks/seo/url-to-video-seo';
import CallToActionSection from '@/components/blocks/calltoaction/calltoaction';
import PricingSection from '@/components/blocks/pricing/pricing';
import CrispChat from '@/components/layout/crisp-chat';
import { JsonLd } from '@/components/seo/json-ld';
import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import FaqSection from '@/components/blocks/faqs/faqs';
import { getTranslations } from 'next-intl/server';
import { getBaseUrl } from '@/lib/urls/urls';

/**
 * https://next-intl.dev/docs/environments/actions-metadata-route-handlers#metadata-api
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return constructMetadata({
    title: t('title'),
    description: t('description'),
    locale,
    pathname: '/',
  });
}

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function HomePage(props: HomePageProps) {
  const params = await props.params;
  const { locale } = params;
  const t = await getTranslations('HomePage');
  const tMetadata = await getTranslations({ locale, namespace: 'Metadata' });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tMetadata('title'),
    description: tMetadata('description'),
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
    },
    featureList: [
      'URL to Video',
      'Text to Video',
      'Image to Video',
      'AI Video Generation',
    ],
    screenshot: `${getBaseUrl()}/hero_background_1771074066381.png`,
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="flex flex-col">
        {/* Hero Section with URL to Video */}
        <section className="relative">
          <HeroUrlToVideo />
        </section>

        {/* Features Grid */}
        <AiVideoFeatures />

        {/* How It Works / How to Use */}
        <HowItWorks />

        {/* Pricing Section */}
        <PricingSection />

        {/* FAQ Section */}
        <FaqSection />

        {/* URL to Video SEO Content */}
        <UrlToVideoSeoSection />

        {/* Call to Action */}
        <CallToActionSection />

        <CrispChat />
      </div>
    </>
  );
}

