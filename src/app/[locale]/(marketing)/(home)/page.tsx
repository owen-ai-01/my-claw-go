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
    badge: isZh ? 'OpenClaw 私有部署平台' : 'Private OpenClaw Runtime Platform',
    title: isZh
      ? '给每位付费用户一台独立 Docker OpenClaw'
      : 'One Dedicated Docker OpenClaw Runtime Per Paying User',
    subtitle: isZh
      ? '参考高转化 AI Agent 产品首页结构，聚焦“输入任务 → 后台执行 → 回传结果”。每个用户独立环境，更安全、更可控。'
      : 'Inspired by modern AI agent landing structures: task in, autonomous run, output back. Each user gets an isolated runtime for better control and security.',
    inputPlaceholder: isZh ? '描述你要执行的任务…' : 'Describe what you want your OpenClaw worker to do…',
    cta: isZh ? '开始执行' : 'Run Task',
    trust: isZh
      ? ['独立 Docker 隔离', '按用户计费与配额', '可观测任务日志']
      : ['Isolated Docker runtime', 'Usage-based billing & quota', 'Observable task logs'],
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
