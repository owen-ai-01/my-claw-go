import { ImagePlayground } from '@/ai/image/components/ImagePlayground';
import { getRandomSuggestions } from '@/ai/image/lib/suggestions';
import type { Locale } from 'next-intl';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function ProductVideoPage({ params }: PageProps) {
  const { locale } = await params;

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">E-Commerce Produkt Video</h1>
        <p className="text-xl text-muted-foreground">
          Perfekt für Amazon, Shopify und Social Media. Mach aus Fotos
          verkaufsstarke Videos.
        </p>
      </div>

      <div className="mx-auto max-w-5xl">
        <ImagePlayground suggestions={getRandomSuggestions(5, locale)} />
      </div>
    </div>
  );
}
