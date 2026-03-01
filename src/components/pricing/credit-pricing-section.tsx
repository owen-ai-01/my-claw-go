'use client';

import { CreditPackages } from '@/components/settings/credits/credit-packages';

/**
 * Client-side wrapper for credit pricing section
 * Used on the /pricing page to avoid hydration mismatches.
 */
export default function CreditPricingSection() {
  return <CreditPackages />;
}
