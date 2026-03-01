import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

/**
 * Dashboard page
 */
export default function DashboardPage() {
  const t = useTranslations();

  const breadcrumbs = [
    {
      label: t('Dashboard.dashboard.title'),
      isCurrentPage: true,
    },
  ];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="flex flex-col items-center justify-center gap-4 h-96">
              <h1 className="text-2xl font-semibold text-center">
                {t('Dashboard.dashboard.welcomeMessage')}
              </h1>
              <Button asChild size="lg">
                <LocaleLink href="/">
                  {t('Dashboard.dashboard.getStarted')}
                </LocaleLink>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
