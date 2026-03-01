import { HeaderSection } from '@/components/layout/header-section';
import {
  Camera,
  CarFront,
  Code2,
  Home,
  Megaphone,
  ShoppingBag,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function UseCasesSection() {
  const t = useTranslations('HomePage.useCases');

  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-6xl space-y-12">
        <HeaderSection
          title={t('title')}
          subtitle={t('subtitle')}
          description={t('description')}
        />

        <div className="grid gap-8 md:grid-cols-2">
          {/* E-Commerce */}
          <div className="flex gap-4 p-6 rounded-2xl border bg-card text-card-foreground shadow-sm">
            <div className="flex-none">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <ShoppingBag className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-xl mb-2">
                {t('ecommerce.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('ecommerce.description')}
              </p>
            </div>
          </div>

          {/* Marketing */}
          <div className="flex gap-4 p-6 rounded-2xl border bg-card text-card-foreground shadow-sm">
            <div className="flex-none">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Megaphone className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-xl mb-2">
                {t('marketing.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('marketing.description')}
              </p>
            </div>
          </div>

          {/* Photography */}
          <div className="flex gap-4 p-6 rounded-2xl border bg-card text-card-foreground shadow-sm">
            <div className="flex-none">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Camera className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-xl mb-2">
                {t('photography.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('photography.description')}
              </p>
            </div>
          </div>

          {/* Developers */}
          <div className="flex gap-4 p-6 rounded-2xl border bg-card text-card-foreground shadow-sm">
            <div className="flex-none">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Code2 className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-xl mb-2">
                {t('developers.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('developers.description')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-2 mt-8">
          {/* Real Estate */}
          <div className="flex gap-4 p-6 rounded-2xl border bg-card text-card-foreground shadow-sm">
            <div className="flex-none">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Home className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-xl mb-2">
                {t('realEstate.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('realEstate.description')}
              </p>
            </div>
          </div>

          {/* Car Dealers */}
          <div className="flex gap-4 p-6 rounded-2xl border bg-card text-card-foreground shadow-sm">
            <div className="flex-none">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <CarFront className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-xl mb-2">
                {t('carDealers.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('carDealers.description')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
