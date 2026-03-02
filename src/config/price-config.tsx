'use client';

import type { PricePlan } from '@/payment/types';
import { useTranslations } from 'next-intl';
import { websiteConfig } from './website';

/**
 * Get price plans with translations for client components
 *
 * NOTICE: This function should only be used in client components.
 * If you need to get the price plans in server components, use getAllPricePlans instead.
 * Use this function when showing the pricing table or the billing card to the user.
 *
 * docs:
 * https://mksaas.com/docs/config/price
 *
 * @returns The price plans with translated content
 */
export function usePricePlans(): Record<string, PricePlan> {
  const t = useTranslations('PricePlans');
  const priceConfig = websiteConfig.price;
  const plans: Record<string, PricePlan> = {};

  // Add translated content to each plan
  if (priceConfig.plans.free) {
    plans.free = {
      ...priceConfig.plans.free,
      name: t('free.name'),
      description: t('free.description'),
      features: [t('free.features.feature-1'), t('free.features.feature-2')],
      limits: [],
    };
  }

  if (priceConfig.plans.pro_monthly) {
    plans.pro_monthly = {
      ...priceConfig.plans.pro_monthly,
      name: t('pro_monthly.name'),
      description: t('pro_monthly.description'),
      features: [
        t('pro_monthly.features.feature-1'),
        t('pro_monthly.features.feature-2'),
        t('pro_monthly.features.feature-3'),
        t('pro_monthly.features.feature-4'),
        t('pro_monthly.features.feature-5'),
        t('pro_monthly.features.feature-6'),
      ],
      limits: [],
    };
  }

  if (priceConfig.plans.pro_yearly) {
    plans.pro_yearly = {
      ...priceConfig.plans.pro_yearly,
      name: t('pro_yearly.name'),
      description: t('pro_yearly.description'),
      features: [
        t('pro_yearly.features.feature-1'),
        t('pro_yearly.features.feature-2'),
        t('pro_yearly.features.feature-3'),
        t('pro_yearly.features.feature-4'),
        t('pro_yearly.features.feature-5'),
        t('pro_yearly.features.feature-6'),
      ],
      limits: [],
    };
  }

  if (priceConfig.plans.premium_monthly) {
    plans.premium_monthly = {
      ...priceConfig.plans.premium_monthly,
      name: t('premium_monthly.name'),
      description: t('premium_monthly.description'),
      features: [
        t('premium_monthly.features.feature-1'),
        t('premium_monthly.features.feature-2'),
        t('premium_monthly.features.feature-3'),
        t('premium_monthly.features.feature-4'),
        t('premium_monthly.features.feature-5'),
        t('premium_monthly.features.feature-6'),
      ],
      limits: [],
    };
  }

  if (priceConfig.plans.premium_yearly) {
    plans.premium_yearly = {
      ...priceConfig.plans.premium_yearly,
      name: t('premium_yearly.name'),
      description: t('premium_yearly.description'),
      features: [
        t('premium_yearly.features.feature-1'),
        t('premium_yearly.features.feature-2'),
        t('premium_yearly.features.feature-3'),
        t('premium_yearly.features.feature-4'),
        t('premium_yearly.features.feature-5'),
        t('premium_yearly.features.feature-6'),
      ],
      limits: [],
    };
  }

  if (priceConfig.plans.ultra_monthly) {
    plans.ultra_monthly = {
      ...priceConfig.plans.ultra_monthly,
      name: t('ultra_monthly.name'),
      description: t('ultra_monthly.description'),
      features: [
        t('ultra_monthly.features.feature-1'),
        t('ultra_monthly.features.feature-2'),
        t('ultra_monthly.features.feature-3'),
        t('ultra_monthly.features.feature-4'),
        t('ultra_monthly.features.feature-5'),
        t('ultra_monthly.features.feature-6'),
      ],
      limits: [],
    };
  }

  if (priceConfig.plans.ultra_yearly) {
    plans.ultra_yearly = {
      ...priceConfig.plans.ultra_yearly,
      name: t('ultra_yearly.name'),
      description: t('ultra_yearly.description'),
      features: [
        t('ultra_yearly.features.feature-1'),
        t('ultra_yearly.features.feature-2'),
        t('ultra_yearly.features.feature-3'),
        t('ultra_yearly.features.feature-4'),
        t('ultra_yearly.features.feature-5'),
        t('ultra_yearly.features.feature-6'),
      ],
      limits: [],
    };
  }

  if (priceConfig.plans.lifetime) {
    plans.lifetime = {
      ...priceConfig.plans.lifetime,
      name: t('lifetime.name'),
      description: t('lifetime.description'),
      features: [
        t('lifetime.features.feature-1'),
        t('lifetime.features.feature-2'),
      ],
      limits: [],
    };
  }

  return plans;
}
