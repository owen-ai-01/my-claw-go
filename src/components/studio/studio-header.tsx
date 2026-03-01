'use client';

import { CreditsBalanceButton } from '@/components/layout/credits-balance-button';
import { LocaleLink } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import { Home, Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { UserButton } from '@/components/layout/user-button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginWrapper } from '@/components/auth/login-wrapper';
import { Routes } from '@/routes';
import { cn } from '@/lib/utils';
import { ModeSwitcher } from '@/components/layout/mode-switcher';
import { useEffect, useState } from 'react';

export function StudioHeader() {
    const t = useTranslations();
    const { data: session, isPending } = authClient.useSession();
    const currentUser = session?.user;
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <header className="h-16 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4 lg:px-8">
            <div className="flex items-center gap-4">
                <LocaleLink
                    href="/"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <Home className="w-4 h-4" />
                    <span className="hidden md:inline">{t('Studio.header.backToHome')}</span>
                </LocaleLink>
                <div className="h-4 w-px bg-border/50 hidden md:block" />
                <h1 className="font-semibold text-lg hidden md:block">Studio</h1>
            </div>

            <div className="flex items-center gap-4">
                {!mounted || isPending ? (
                    <Skeleton className="size-8 border rounded-full" />
                ) : currentUser ? (
                    <>
                        <CreditsBalanceButton />
                        <UserButton user={currentUser} />
                    </>
                ) : (
                    <div className="flex items-center gap-x-4">
                        <LoginWrapper mode="modal" asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="cursor-pointer"
                            >
                                {t('Common.login')}
                            </Button>
                        </LoginWrapper>

                        <LocaleLink
                            href={Routes.Register}
                            className={cn(
                                buttonVariants({
                                    variant: 'default',
                                    size: 'sm',
                                })
                            )}
                        >
                            {t('Common.signUp')}
                        </LocaleLink>
                    </div>
                )}
                <ModeSwitcher />
            </div>
        </header>
    );
}
