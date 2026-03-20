'use client';

import { LoginWrapper } from '@/components/auth/login-wrapper';
import { CreditCheckoutButton } from '@/components/settings/credits/credit-checkout-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreditPackages } from '@/config/credits-config';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMounted } from '@/hooks/use-mounted';
import { useLocalePathname } from '@/i18n/navigation';
import { formatPrice } from '@/lib/formatter';
import { cn } from '@/lib/utils';
import { Activity, CheckCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

/**
 * Credit Pricing Card Component
 *
 * Displays a pricing card for "Pay as you go" credits with a selector.
 * Allows users to choose a credit package and purchase it immediately.
 */
export function CreditPricingCard({ className }: { className?: string }) {
  const t = useTranslations('Dashboard.settings.credits');
  const tPricing = useTranslations('PricingPage.PricingCard');
  const creditPackages = useCreditPackages();
  const currentUser = useCurrentUser();
  const mounted = useMounted();
  const currentPath = useLocalePathname();

  // Convert object to array and sort by amount
  const sortedPackages = useMemo(() => {
    return Object.values(creditPackages)
      .filter((pkg) => !pkg.disabled && pkg.price.priceId)
      .sort((a, b) => a.amount - b.amount);
  }, [creditPackages]);

  // Default to enterprise (99.90) or the first available
  const [selectedPackageId, setSelectedPackageId] = useState<string>(() => {
    if (Object.keys(creditPackages).length === 0) return '';
    // Try to select 'enterprise' first, otherwise the first available
    return creditPackages.enterprise
      ? 'enterprise'
      : sortedPackages[0]?.id || '';
  });

  const selectedPackage = creditPackages[selectedPackageId];

  // If no packages are available, don't render
  if (sortedPackages.length === 0) {
    return null;
  }

  // Calculate price per credit for display? Maybe later.

  return (
    <Card
      className={cn(
        'flex flex-col h-full relative border-green-500 shadow-lg shadow-green-100 dark:shadow-green-900/20',
        className
      )}
    >
      <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2">
        <Badge
          variant="default"
          className="bg-green-500 text-white hover:bg-green-600"
        >
          Pay as you go
        </Badge>
      </div>

      <CardHeader>
        <CardTitle>
          <h3 className="font-medium">Credits</h3>
        </CardTitle>

        <div className="flex flex-col gap-4 mt-2">
          <div className="flex items-baseline gap-2 min-h-[4rem]">
            {selectedPackage && (
              <>
                <span className="text-4xl font-semibold">
                  {formatPrice(
                    selectedPackage.price.amount,
                    selectedPackage.price.currency
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  / {selectedPackage.amount} Credits
                </span>
              </>
            )}
          </div>

          <Select
            value={selectedPackageId}
            onValueChange={setSelectedPackageId}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a package" />
            </SelectTrigger>
            <SelectContent>
              {sortedPackages.map((pkg) => (
                <SelectItem key={pkg.id} value={pkg.id}>
                  {pkg.amount} Credits
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CardDescription className="mt-4 space-y-2">
          <p className="text-sm">{t('packages.description')}</p>
          {selectedPackage ? (
            <p className="text-sm text-muted-foreground">{selectedPackage.description}</p>
          ) : null}
        </CardDescription>

        {selectedPackage ? (
          mounted && currentUser ? (
            <CreditCheckoutButton
              packageId={selectedPackage.id}
              priceId={selectedPackage.price.priceId || ''}
              className="mt-4 w-full cursor-pointer"
              disabled={!selectedPackage.price.priceId}
            >
              {t('packages.purchase')}
            </CreditCheckoutButton>
          ) : (
            <LoginWrapper mode="modal" asChild callbackUrl={currentPath}>
              <Button
                variant="default"
                className="mt-4 w-full cursor-pointer bg-green-600 hover:bg-green-700"
              >
                {t('packages.purchase')}
              </Button>
            </LoginWrapper>
          )
        ) : (
          <Button disabled className="mt-4 w-full">
            {tPricing('notAvailable')}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <hr className="border-dashed" />

        <ul className="list-outside space-y-4 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircleIcon className="size-4 text-green-500 dark:text-green-400" />
            <span>1 Year Validity</span>
          </li>
          {selectedPackage && (
            <li className="flex items-center gap-2">
              <CheckCircleIcon className="size-4 text-green-500 dark:text-green-400" />
              <span>{selectedPackage.description}</span>
            </li>
          )}
          {selectedPackage?.capacity && (
            <>
              <li className="flex items-center gap-2">
                <Activity className="size-4 text-green-500 dark:text-green-400" />
                <span>
                  {t('packages.videoCapacity', {
                    seconds: selectedPackage.capacity.videoSeconds,
                  })}
                </span>
              </li>
            </>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
