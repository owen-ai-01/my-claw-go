
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function HowItWorks({ namespace = 'HomePage.tutorial' }: { namespace?: string }) {
    const t = useTranslations(namespace as any) as any;

    const steps = [
        {
            title: t('steps.step1.title'),
            description: t('steps.step1.description')
        },
        {
            title: t('steps.step2.title'),
            description: t('steps.step2.description')
        },
        {
            title: t('steps.step3.title'),
            description: t('steps.step3.description')
        }
    ];

    return (
        <section id="how-to-use" className="py-24 bg-gray-50/50 dark:bg-background/50">
            <div className="container px-4 mx-auto">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl font-bold mb-4">{t('title')}</h2>
                    <p className="text-muted-foreground text-lg">
                        {t('description')}
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-12 relative max-w-5xl mx-auto">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-purple-200 via-pink-200 to-blue-200 -z-10 dark:opacity-30" />

                    {steps.map((step, i) => (
                        <div key={i} className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 bg-white dark:bg-card rounded-full shadow-lg flex items-center justify-center mb-6 border-4 border-white/50 dark:border-border relative z-10">
                                <span className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-purple-600 to-blue-600">
                                    {i + 1}
                                </span>
                            </div>
                            <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                            <p className="text-muted-foreground">{step.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
