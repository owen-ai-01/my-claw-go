import { LoginForm } from '@/components/auth/login-form';
import { LocaleLink } from '@/i18n/navigation';
import { constructMetadata } from '@/lib/metadata';
import { Routes } from '@/routes';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  try {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Metadata' });
    const pt = await getTranslations({ locale, namespace: 'AuthPage' });

    return constructMetadata({
      title: pt('login.title') + ' | ' + t('title'),
      description: t('description'),
      locale,
      pathname: '/auth/login',
    });
  } catch (error) {
    console.error('Error generating metadata for login page:', error);
    // Return basic metadata if translation fails
    return constructMetadata({
      title: 'Login',
      description: 'Login to your account',
      locale: 'de',
      pathname: '/auth/login',
    });
  }
}

export default async function LoginPage() {
  try {
    const t = await getTranslations('AuthPage.common');

    return (
      <div className="flex flex-col gap-4">
        <LoginForm />
        <div className="text-balance text-center text-xs text-muted-foreground">
          {t('byClickingContinue')}
          <LocaleLink
            href={Routes.TermsOfService}
            className="underline underline-offset-4 hover:text-primary"
          >
            {t('termsOfService')}
          </LocaleLink>{' '}
          {t('and')}{' '}
          <LocaleLink
            href={Routes.PrivacyPolicy}
            className="underline underline-offset-4 hover:text-primary"
          >
            {t('privacyPolicy')}
          </LocaleLink>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error rendering login page:', error);
    // Fallback UI if translation fails
    return (
      <div className="flex flex-col gap-4">
        <LoginForm />
        <div className="text-balance text-center text-xs text-muted-foreground">
          By clicking continue, you agree to our{' '}
          <LocaleLink
            href={Routes.TermsOfService}
            className="underline underline-offset-4 hover:text-primary"
          >
            Terms of Service
          </LocaleLink>{' '}
          and{' '}
          <LocaleLink
            href={Routes.PrivacyPolicy}
            className="underline underline-offset-4 hover:text-primary"
          >
            Privacy Policy
          </LocaleLink>
        </div>
      </div>
    );
  }
}
