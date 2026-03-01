
import { Link, Zap, Globe, Clock, Sparkles, Download } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AiVideoFeatures() {
    const t = useTranslations('HomePage.urlToVideoFeatures');

    const features = [
        {
            icon: <Link className="w-8 h-8 text-blue-600" />,
            title: t('item-1.title'),
            description: t('item-1.description'),
            color: "bg-blue-50 hover:bg-blue-100",
        },
        {
            icon: <Zap className="w-8 h-8 text-amber-600" />,
            title: t('item-2.title'),
            description: t('item-2.description'),
            color: "bg-amber-50 hover:bg-amber-100",
        },
        {
            icon: <Globe className="w-8 h-8 text-green-600" />,
            title: t('item-3.title'),
            description: t('item-3.description'),
            color: "bg-green-50 hover:bg-green-100",
        },
        {
            icon: <Sparkles className="w-8 h-8 text-purple-600" />,
            title: t('item-4.title'),
            description: t('item-4.description'),
            color: "bg-purple-50 hover:bg-purple-100",
        },
    ];

    return (
        <section id="features" className="py-24 bg-background">
            <div className="container px-4 md:px-6 mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl mb-4 text-foreground">
                        {t('title')}
                    </h2>
                    <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                        {t('description')}
                    </p>
                </div>
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
                    {features.map((feature, i) => (
                        <div key={i} className={`group rounded-2xl p-6 transition-all duration-300 ${feature.color} dark:bg-card dark:border dark:border-border`}>
                            <div className="mb-4 inline-block rounded-xl bg-background dark:bg-muted p-3 shadow-sm">
                                {feature.icon}
                            </div>
                            <h3 className="mb-2 text-lg font-bold text-foreground">{feature.title}</h3>
                            <p className="text-sm text-muted-foreground">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
