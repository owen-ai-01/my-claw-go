'use client';

import dynamic from 'next/dynamic';

/**
 * Client-side wrapper for FAQ section
 * Used on the /pricing page to avoid hydration mismatches.
 */
const FaqSection = dynamic(() => import('@/components/blocks/faqs/faqs'), {
  ssr: false,
});

export default function FaqSectionWrapper() {
  return <FaqSection />;
}
