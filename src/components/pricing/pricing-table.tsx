'use client';

import { Badge } from '@/components/ui/badge';
import { usePricePlans } from '@/config/price-config';
import { cn } from '@/lib/utils';
import {
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type PricePlan,
} from '@/payment/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CreditPricingCard } from './credit-pricing-card';
import { PricingCard } from './pricing-card';

interface PricingTableProps {
  metadata?: Record<string, string>;
  currentPlan?: PricePlan | null;
  className?: string;
}

/**
 * Pricing Table Component
 *
 * 1. Displays pricing plans with interval selection tabs (monthly/yearly)
 * 2. Shows plans based on selected interval
 * 3. If a plan is disabled, it will not be displayed in the pricing table
 * 4. If a price is disabled, it will not be displayed in the pricing table
 */
export function PricingTable({
  metadata,
  currentPlan,
  className,
}: PricingTableProps) {
  const t = useTranslations('PricingPage');
  const [selectedInterval, setSelectedInterval] = useState<PlanInterval>(
    PlanIntervals.YEAR
  );

  // Get price plans with translations
  const pricePlans = usePricePlans();
  const plans = Object.values(pricePlans);

  // Current plan ID for comparison
  const currentPlanId = currentPlan?.id || null;

  // Get subscription plans for the selected interval
  const subscriptionPlans = plans.filter(
    (plan) =>
      !plan.isFree &&
      !plan.disabled &&
      plan.prices.some(
        (price) =>
          !price.disabled &&
          price.type === PaymentTypes.SUBSCRIPTION &&
          price.interval === selectedInterval
      )
  );

  const oneTimePlans = plans.filter(
    (plan) =>
      !plan.isFree &&
      !plan.disabled &&
      plan.prices.some(
        (price) => !price.disabled && price.type === PaymentTypes.ONE_TIME
      )
  );

  // Calculate total number of visible plans
  const totalVisiblePlans = subscriptionPlans.length + oneTimePlans.length;

  return (
    <div className={cn('flex flex-col gap-12', className)}>
      {/* Interval selection tabs */}
      {/* Interval selection tabs (Visual Toggle) */}
      <div className="flex justify-center items-center">
        <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground grid w-full max-w-md grid-cols-2 mx-auto">
          <button
            type="button"
            onClick={() => setSelectedInterval(PlanIntervals.MONTH)}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
              selectedInterval === PlanIntervals.MONTH
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/50 text-muted-foreground"
            )}
            aria-pressed={selectedInterval === PlanIntervals.MONTH}
          >
            {t('monthly')}
          </button>
          <button
            type="button"
            onClick={() => setSelectedInterval(PlanIntervals.YEAR)}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 relative",
              selectedInterval === PlanIntervals.YEAR
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/50 text-muted-foreground"
            )}
            aria-pressed={selectedInterval === PlanIntervals.YEAR}
          >
            {t('yearly')}
            <Badge
              variant="default"
              className="ml-1.5 bg-orange-500 text-white hover:bg-orange-600 text-[10px] px-1.5 py-0 h-4"
            >
              {t('PricingCard.discount50')}
            </Badge>
          </button>
        </div>
      </div>

      {/* Pricing cards grid */}
      <div
        className={cn(
          'grid gap-6',
          // Universal solution that handles any number of cards
          // We are adding one card (credit card), so total visible + 1
          totalVisiblePlans + 1 === 1 && 'grid-cols-1 max-w-md mx-auto w-full',
          totalVisiblePlans + 1 === 2 &&
          'grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto w-full',
          totalVisiblePlans + 1 >= 3 &&
          'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        )}
      >
        {/* Render Credit Pricing Card (Pay as you go) - Always first */}
        <CreditPricingCard />

        {/* Render subscription plans for selected interval */}
        {subscriptionPlans.map((plan) => (
          <PricingCard
            key={`${plan.id}-${selectedInterval}`}
            plan={plan}
            interval={selectedInterval}
            paymentType={PaymentTypes.SUBSCRIPTION}
            metadata={metadata}
            isCurrentPlan={currentPlanId === plan.id}
          />
        ))}

        {/* Render one-time plans (always visible) */}
        {oneTimePlans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            paymentType={PaymentTypes.ONE_TIME}
            metadata={metadata}
            isCurrentPlan={currentPlanId === plan.id}
          />
        ))}
      </div>
    </div>
  );
}
