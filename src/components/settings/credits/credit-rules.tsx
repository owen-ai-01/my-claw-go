'use client';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';

export function CreditRules() {
    const t = useTranslations('Dashboard.settings.credits.packages.rules');

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                    {t('description')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <h4 className="font-medium text-foreground">{t('video')}</h4>
                        <p className="text-muted-foreground">{t('image')}</p>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-medium text-foreground">{t('multipliers')}</h4>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>{t('multipliersList.fast')}</li>
                            <li>{t('multipliersList.hq')}</li>
                            <li>{t('multipliersList.sora')}</li>
                            <li>{t('multipliersList.veo3')}</li>
                        </ul>
                    </div>
                </div>
                <div className="pt-4 border-t space-y-2">
                    <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Funktionen: </span>
                        {t('features').replace('Verfügbare Funktionen: ', '')}
                    </p>
                    <p className="text-muted-foreground italic">{t('policy')}</p>
                </div>
            </CardContent>
        </Card>
    );
}
