'use client';

import { LocaleLink, useLocalePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
    icon: LucideIcon;
    label: string;
    href: string;
    active: boolean;
}

export function StudioSidebar() {
    const t = useTranslations('Studio.sidebar');
    const pathname = useLocalePathname();

    const isActive = (path: string) => pathname === path;

    const navItems: NavItem[] = [
        // Future items can be added here
    ];

    return (
        <aside className="w-16 lg:w-64 border-r border-border/50 bg-muted/10 flex flex-col items-center lg:items-stretch py-6 h-full min-h-[calc(100vh-64px)]">
            <div className="px-4 mb-6">
                <h2 className="hidden lg:block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Create
                </h2>
            </div>

            <nav className="flex-1 space-y-2 px-2">
                {navItems.map((item) => (
                    <LocaleLink
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors md:justify-start justify-center",
                            item.active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <item.icon className="w-5 h-5" />
                        <span className="hidden lg:inline">{item.label}</span>
                    </LocaleLink>
                ))}
            </nav>
        </aside>
    );
}
