import CrispChat from '@/components/layout/crisp-chat';
import { JsonLd } from '@/components/seo/json-ld';
import { constructMetadata } from '@/lib/metadata';
import { getBaseUrl } from '@/lib/urls/urls';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { StartBox } from '@/components/myclawgo/start-box';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return constructMetadata({
    title: t('title'),
    description: t('description'),
    locale,
    pathname: '/',
  });
}

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function HomePage(props: HomePageProps) {
  const { locale } = await props.params;
  const isZh = locale.startsWith('zh');

  const content = {
    badge: isZh ? '你的专属 OpenClaw 服务' : 'Your Personal OpenClaw Service',
    title: isZh
      ? '注册并支付后，直接拥有你自己的 OpenClaw'
      : 'Get Your Own OpenClaw Right After Signup and Payment',
    subtitle: isZh
      ? '不需要买 VPS，不需要自己的电脑 24 小时开机，不需要配置 API Key。你只管输入任务，其余都由 MyClawGo 托管完成。'
      : 'No VPS to buy. No personal computer running 24/7. No API keys to configure. Just type your tasks and MyClawGo handles the rest for you.',
    inputPlaceholder: isZh ? '直接输入你的任务，马上开始…' : 'Type your task and start instantly…',
    cta: isZh ? '立即开始我的 OpenClaw' : 'Start My OpenClaw',
    trust: isZh
      ? ['无需技术配置', '注册支付后即开即用', '每位用户独立数据空间']
      : ['No technical setup required', 'Ready right after signup & payment', 'Private workspace for every user'],
    sections: {
      howTitle: isZh ? '它如何工作' : 'How It Works',
      steps: isZh
        ? [
            ['1. 用户输入任务', '在前台输入需求，平台自动生成执行计划。'],
            ['2. 分配独立容器', '为该用户启动（或复用）独立 OpenClaw Docker 环境。'],
            ['3. 执行并回传', '执行工具链流程并回传结果、日志与产出文件。'],
          ]
        : [
            ['1. User submits a task', 'A frontend prompt is converted into an execution plan.'],
            ['2. Isolated container allocation', 'A dedicated OpenClaw Docker runtime is assigned per user.'],
            ['3. Execute and return outputs', 'Results, logs, and generated assets are returned to the user.'],
          ],
      whyTitle: isZh ? '为什么是独立容器架构' : 'Why Per-User Isolated Runtime',
      why: isZh
        ? [
            ['安全隔离', '不同用户任务、凭据与上下文互不影响。'],
            ['稳定可扩展', '容器可按需扩缩容，适配增长流量。'],
            ['商业化清晰', '按用户/任务计费与资源配额天然匹配。'],
          ]
        : [
            ['Security isolation', 'User contexts, credentials, and tasks stay separated.'],
            ['Scalable operations', 'Container-based scheduling scales with traffic.'],
            ['Monetization-ready', 'Natural fit for per-user or per-task billing models.'],
          ],
      roadmapTitle: isZh ? '上线路线图（MVP）' : 'MVP Roadmap',
      roadmap: isZh
        ? ['前台任务输入页', '用户级 Docker 调度', '任务状态与日志面板', '付费与配额系统']
        : ['Task input frontend', 'Per-user Docker orchestrator', 'Execution status & logs panel', 'Billing and quota system'],
    },
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'My Claw Go',
    description: content.subtitle,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: ['Per-user Docker runtime', 'OpenClaw orchestration', 'Task execution logs'],
    screenshot: `${getBaseUrl()}/hero_background_1771074066381.png`,
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <main className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl md:p-12">
            <p className="mb-5 inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200">
              {content.badge}
            </p>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight md:text-6xl">{content.title}</h1>
            <p className="mt-5 max-w-3xl text-base text-slate-300 md:text-lg">{content.subtitle}</p>

            <StartBox placeholder={content.inputPlaceholder} button={content.cta} />

            <div className="mt-6 flex flex-wrap gap-2">
              {content.trust.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                >
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-14 grid gap-6 md:grid-cols-3">
            <h2 className="md:col-span-3 text-2xl font-semibold">{content.sections.howTitle}</h2>
            {content.sections.steps.map(([title, desc]) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-lg font-medium">{title}</h3>
                <p className="mt-3 text-sm text-slate-300">{desc}</p>
              </article>
            ))}
          </section>

          <section className="mt-14 grid gap-6 md:grid-cols-3">
            <h2 className="md:col-span-3 text-2xl font-semibold">{content.sections.whyTitle}</h2>
            {content.sections.why.map(([title, desc]) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-lg font-medium">{title}</h3>
                <p className="mt-3 text-sm text-slate-300">{desc}</p>
              </article>
            ))}
          </section>

          <section className="mt-14 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
            <h2 className="text-2xl font-semibold">{content.sections.roadmapTitle}</h2>
            <ul className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
              {content.sections.roadmap.map((item) => (
                <li key={item} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </main>
        <CrispChat />
      </div>
    </>
  );
}
