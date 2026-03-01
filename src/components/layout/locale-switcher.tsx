'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { websiteConfig } from '@/config/website';
import { useLocalePathname, useLocaleRouter } from '@/i18n/navigation';
import { useLocaleStore } from '@/stores/locale-store';
import { ChevronDown } from 'lucide-react';
import { type Locale, useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useTransition } from 'react';

/**
 * LocaleSwitcher component
 *
 * Allows users to switch between available locales using a dropdown menu.
 *
 * Based on next-intl's useLocaleRouter and useLocalePathname for locale navigation.
 * https://next-intl.dev/docs/routing/navigation#userouter
 */
export default function LocaleSwitcher() {
  // Return null if there's only one locale available
  const showLocaleSwitch = Object.keys(websiteConfig.i18n.locales).length > 1;
  if (!showLocaleSwitch) {
    return null;
  }

  const router = useLocaleRouter();
  const pathname = useLocalePathname();
  const params = useParams();
  const locale = useLocale();
  const { currentLocale, setCurrentLocale } = useLocaleStore();
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCurrentLocale(locale);
  }, [locale, setCurrentLocale]);

  // Get current locale data
  const currentLocaleData = currentLocale
    ? websiteConfig.i18n.locales[currentLocale]
    : websiteConfig.i18n.locales[locale];

  const setLocale = (nextLocale: Locale) => {
    setCurrentLocale(nextLocale);

    startTransition(() => {
      router.replace(
        // @ts-expect-error -- TypeScript will validate that only known `params`
        // are used in combination with a given `pathname`. Since the two will
        // always match for the current route, we can skip runtime checks.
        { pathname, params },
        { locale: nextLocale }
      );
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 gap-1.5 rounded-md hover:bg-accent cursor-pointer"
          aria-label="Sprache wechseln"
        >
          <span className="text-sm font-medium">{currentLocaleData?.name}</span>
          <ChevronDown className="size-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {Object.entries(websiteConfig.i18n.locales).map(
          ([localeOption, data]) => (
            <DropdownMenuItem
              key={localeOption}
              onClick={() => setLocale(localeOption)}
              className="cursor-pointer"
            >
              {data.flag && <span className="mr-2 text-md">{data.flag}</span>}
              <span className="text-sm">{data.name}</span>
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
