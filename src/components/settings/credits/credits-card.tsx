'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { websiteConfig } from '@/config/website';
import { useCreditBalance } from '@/hooks/use-credits';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';
import { RefreshCwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Credits card, show credits balance and statistics
 */
export default function CreditsCard() {
  // Don't render if credits are disabled - move this check before any hooks
  if (!websiteConfig.credits.enableCredits) {
    return null;
  }

  const t = useTranslations('Dashboard.settings.credits.balance');
  const mounted = useMounted();

  // Use TanStack Query hooks for credits
  const {
    data: balance = 0,
    isLoading: isLoadingBalance,
    error: balanceError,
    refetch: refetchBalance,
  } = useCreditBalance();

  // Retry all data fetching using refetch methods
  const handleRetry = useCallback(() => {
    // Use refetch methods for immediate data refresh
    refetchBalance();
  }, [refetchBalance]);

  // Render loading skeleton
  if (!mounted || isLoadingBalance) {
    return (
      <Card className={cn('w-full overflow-hidden pt-6 pb-0 flex flex-col')}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1">
          <div className="flex items-center justify-start space-x-4">
            <Skeleton className="h-9 w-1/5" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (balanceError) {
    return (
      <Card className={cn('w-full overflow-hidden pt-6 pb-0 flex flex-col')}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1">
          <div className="text-destructive text-sm">
            {balanceError?.message}
          </div>
        </CardContent>
        <CardFooter className="mt-2 px-6 py-4 flex justify-end items-center bg-muted rounded-none">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={handleRetry}
          >
            <RefreshCwIcon className="size-4 mr-1" />
            {t('retry')}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full overflow-hidden pt-6 pb-0 flex flex-col')}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {/* Credits balance */}
        <div className="flex items-center justify-start space-x-4">
          <div className="flex items-center space-x-2">
            {/* <CoinsIcon className="h-6 w-6 text-muted-foreground" /> */}
            <div className="text-3xl font-medium">
              {balance.toLocaleString()}
            </div>
          </div>
          {/* <Badge variant="outline">available</Badge> */}
        </div>
      </CardContent>
      {/* Footer removed */}
    </Card>
  );
}
