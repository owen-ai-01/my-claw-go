'use client';

import type { CreditPackage } from '@/credits/types';
import { useTranslations } from 'next-intl';
import { websiteConfig } from './website';

/**
 * Get credit packages with translations for client components
 *
 * NOTICE: This function should only be used in client components.
 * If you need to get the credit packages in server components, use getAllCreditPackages instead.
 * Use this function when showing the credit packages to the user.
 *
 * docs:
 * https://mksaas.com/docs/config/credits
 *
 * @returns The credit packages with translated content
 */
export function useCreditPackages(): Record<string, CreditPackage> {
  // Use an existing, strongly-typed namespace from the dashboard settings
  const t = useTranslations('Dashboard.settings.credits');
  const creditConfig = websiteConfig.credits;
  const packages: Record<string, CreditPackage> = {};

  // Add translated content to each plan
  if (creditConfig.packages.basic) {
    packages.basic = {
      ...creditConfig.packages.basic,
      name: t('packages.basic.name'),
      description: t('packages.basic.description'),
    };
  }

  if (creditConfig.packages.standard) {
    packages.standard = {
      ...creditConfig.packages.standard,
      name: t('packages.standard.name'),
      description: t('packages.standard.description'),
    };
  }

  if (creditConfig.packages.premium) {
    packages.premium = {
      ...creditConfig.packages.premium,
      name: t('packages.premium.name'),
      description: t('packages.premium.description'),
    };
  }

  if (creditConfig.packages.enterprise) {
    packages.enterprise = {
      ...creditConfig.packages.enterprise,
      name: t('packages.enterprise.name'),
      description: t('packages.enterprise.description'),
    };
  }

  return packages;
}
