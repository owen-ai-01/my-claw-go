import CrispChat from '@/components/layout/crisp-chat';
import { JsonLd } from '@/components/seo/json-ld';
import { PricingTable } from '@/components/pricing/pricing-table';
import { constructMetadata } from '@/lib/metadata';
import { getBaseUrl } from '@/lib/urls/urls';
import { Routes } from '@/routes';
import { StartMyOpenClawButton } from '@/components/myclawgo/start-my-openclaw-button';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return constructMetadata({
    title: 'My Claw Go: Hosted OpenClaw Without VPS or Setup | OpenClaw Start',
    description:
      'My OpenClaw Start helps you launch your own private OpenClaw workspace without VPS, local setup, or API key hassle. Sign up, pay, and start fast.',
    locale,
    pathname: '/',
  });
}

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

const features = [
  {
    icon: '🔐',
    title: 'Your own private My OpenClaw workspace',
    desc: 'Every account gets a private runtime and private memory so your workflows, prompts, and context stay yours.',
  },
  {
    icon: '🧩',
    title: 'No VPS, no server setup, no terminal stress',
    desc: 'You do not need to rent and configure infrastructure. We run the system for you so you can focus on outcomes.',
  },
  {
    icon: '⚡',
    title: 'No API key maze for non-technical users',
    desc: 'Start with managed defaults. You can upgrade and customize later, but you can begin immediately.',
  },
  {
    icon: '💬',
    title: 'Natural language control',
    desc: 'Type in plain language and run real actions inside your own environment, just like operating your own OpenClaw instance.',
  },
  {
    icon: '🧠',
    title: 'Persistent memory and continuity',
    desc: 'Your workspace remembers progress, context, and files, so sessions become more useful over time.',
  },
  {
    icon: '📈',
    title: 'Built for creators, operators, and founders',
    desc: 'Use My OpenClaw for growth operations, product execution, marketing systems, and daily decision support.',
  },
];

const faq = [
  {
    q: 'Do I need to buy a VPS first?',
    a: 'No. My Claw Go is designed for users who do not want to buy and configure servers. Sign up, choose a plan, and start using your private workspace directly.',
  },
  {
    q: 'Do I need my own computer running 24/7?',
    a: 'No. Your runtime is hosted for you. You can open the product from anywhere and continue where you left off.',
  },
  {
    q: 'Do I need to configure API keys before getting value?',
    a: 'No. Managed defaults help you start quickly. Advanced users can still bring custom model settings later.',
  },
  {
    q: 'Is my workspace shared with other users?',
    a: 'No. Your My OpenClaw runtime is isolated per user account. Your data, memory, and operations stay private to your workspace.',
  },
  {
    q: 'Can I upgrade from Pro to Premium or Ultra later?',
    a: 'Yes. You can upgrade as your usage grows. The goal is to let you start lean and scale without migration pain.',
  },
  {
    q: 'Who is this product best for?',
    a: 'My Claw Go is best for non-technical and semi-technical founders, creators, and operators who want AI automation without infrastructure burden.',
  },
];

export default async function HomePage(props: HomePageProps) {
  await props.params;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'My Claw Go',
    description:
      'My OpenClaw gives every paying user a private OpenClaw workspace without VPS or complex setup.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '19.9',
      priceCurrency: 'USD',
    },
    featureList: [
      'Private My OpenClaw workspace',
      'No VPS setup required',
      'No local computer always-on requirement',
      'Managed model setup for non-technical users',
    ],
    screenshot: `${getBaseUrl()}/hero_background_1771074066381.png`,
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 text-foreground">
        <main className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <section className="rounded-3xl border border-border bg-card p-8 shadow-xl md:p-12">
            <h1 className="mx-auto max-w-5xl text-center text-4xl font-semibold leading-tight md:text-6xl">
              Get your own OpenClaw after signup and payment. No VPS. No always-on PC. No API key headache.
            </h1>
            <p className="mx-auto mt-5 max-w-4xl text-center text-base text-muted-foreground md:text-lg">
              My Claw Go is built for people who want results, not setup friction. You do not need to learn server operations, buy
              infrastructure, or debug credentials before seeing value. You get a private workspace that feels like your own OpenClaw,
              ready to use from day one.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <StartMyOpenClawButton />
              <a
                href="#choose-plan"
                className="rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                See Plans
              </a>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {['No VPS required', 'No local setup', 'No key management to start', 'Private workspace per user'].map((item) => (
                <span key={item} className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-14 space-y-5 rounded-2xl border border-border bg-card p-8">
            <h2 className="text-2xl font-semibold">🚀 What is My Claw Go?</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              My Claw Go is a hosted OpenClaw experience for people who want AI execution power without infrastructure complexity. In a
              traditional setup, users must choose a VPS provider, configure system packages, manage model keys, and keep services running.
              That path works for technical users but blocks most real operators who just want to ship outcomes. My OpenClaw removes that
              friction. Instead of spending days on setup, users can focus on actual tasks: generating outputs, running workflows, and
              building repeatable operations. This product exists to bridge that gap between capability and usability.
            </p>
            <p className="text-sm leading-7 text-muted-foreground">
              The core promise is simple: your own workspace, your own context, your own continuity. When you come back, your state is still
              there. You are not sharing a generic chatbot session. You are working inside your own My Claw Go environment. That means your
              prompts, process, and knowledge can evolve over time, and your productivity compounds. This is especially important for founders,
              marketers, and operators who run recurring systems and need consistency, not one-off answers.
            </p>
          </section>

          <section id="features" className="mt-14">
            <h2 className="mb-6 text-2xl font-semibold">✨ Features</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <article key={f.title} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold">{f.icon} {f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.desc}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="how-to-use" className="mt-14 space-y-6 rounded-2xl border border-border bg-card p-8">
            <h2 className="text-2xl font-semibold">🧭 Tutorial & How It Works</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              You can think of My Claw Go as a practical execution workspace that is ready from the moment you subscribe. Step one is creating
              your account and selecting the right plan. Step two is opening your workspace and entering your first instruction. Step three is
              iterating your workflow with persistent context. Because setup burden is removed, the time from sign-up to first useful output is
              dramatically shorter than self-hosted alternatives. The product is intentionally designed to help non-technical users produce
              results without sacrificing quality.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <article className="rounded-xl border border-border bg-muted/50 p-5">
                <div className="text-2xl">📝</div>
                <h3 className="mt-3 text-sm font-semibold">Step 1: Create your account and pick a plan</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">Sign up in minutes, choose Pro/Premium/Ultra, and unlock your private My Claw Go workspace instantly.</p>
              </article>
              <article className="rounded-xl border border-border bg-muted/50 p-5">
                <div className="text-2xl">⚙️</div>
                <h3 className="mt-3 text-sm font-semibold">Step 2: Open your workspace and give your first instruction</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">Use natural language to run tasks. Your context and operations stay inside your own isolated workspace.</p>
              </article>
              <article className="rounded-xl border border-border bg-muted/50 p-5">
                <div className="text-2xl">📊</div>
                <h3 className="mt-3 text-sm font-semibold">Step 3: Scale usage as your workload grows</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">Start lean, then move to higher-credit plans when your weekly execution volume increases.</p>
              </article>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              For teams and advanced users, the same flow scales naturally. You can begin with lightweight usage and move to larger credit
              plans when demand grows. This makes My Claw Go a practical bridge between early experimentation and production-level usage.
              Instead of rebuilding your stack later, you continue inside the same product and expand with better capacity.
            </p>
          </section>

          <section id="choose-plan" className="mt-14 space-y-6">
            <h2 className="text-2xl font-semibold">💳 Choose the right plan</h2>
            <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
              Start with Pro if you are validating your workflow. Choose Premium if you run regular weekly operations and want more headroom.
              Choose Ultra if you depend on high-volume execution and need the highest credit allowance. All plans are built around the same
              principle: your private My Claw Go workspace, ready without infrastructure setup.
            </p>
            <PricingTable />
          </section>

          <section className="mt-14 space-y-5 rounded-2xl border border-border bg-card p-8">
            <h2 className="text-2xl font-semibold">❓ FAQ</h2>
            <div className="space-y-4">
              {faq.map((item) => (
                <article key={item.q} className="rounded-xl border border-border bg-muted/40 p-4">
                  <h3 className="text-sm font-semibold">{item.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.a}</p>
                </article>
              ))}
            </div>
          </section>


          <section className="mt-10 rounded-2xl border border-border bg-card p-8 text-center">
            <h2 className="text-2xl font-semibold">Ready to start your own OpenClaw?</h2>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              Skip infrastructure work and start executing right away with your private My Claw Go workspace.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href={Routes.Register}
                className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Create My Claw Go Account
              </a>
              <a
                href="mailto:support@myclawgo.com"
                className="rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Contact Support
              </a>
            </div>
          </section>


          <section className="mt-10 space-y-6 rounded-2xl border border-border bg-card p-8">
            <h2 className="text-2xl font-semibold">OpenClaw highlights in My Claw Go</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              My Claw Go gives you a <strong>hosted OpenClaw</strong> experience with a clear product flow: sign up, choose a plan, and use your
              own OpenClaw workspace instantly. This is designed for users who want <strong>OpenClaw without VPS</strong> and
              <strong> OpenClaw without setup</strong> while still keeping a private, consistent workspace.
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              <article className="rounded-xl border border-border bg-muted/40 p-5">
                <div className="text-2xl">🚀</div>
                <h3 className="mt-3 text-sm font-semibold">Hosted OpenClaw, ready after payment</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Start with a managed OpenClaw runtime instead of provisioning servers and dependencies yourself.
                </p>
              </article>

              <article className="rounded-xl border border-border bg-muted/40 p-5">
                <div className="text-2xl">🧩</div>
                <h3 className="mt-3 text-sm font-semibold">OpenClaw without setup complexity</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  No VPS procurement, no environment troubleshooting, and no long setup checklist before you can use OpenClaw.
                </p>
              </article>

              <article className="rounded-xl border border-border bg-muted/40 p-5">
                <div className="text-2xl">💼</div>
                <h3 className="mt-3 text-sm font-semibold">OpenClaw as a service for non-technical users</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  My Claw Go is built for users who want OpenClaw outcomes, not infrastructure burden.
                </p>
              </article>
            </div>
          </section>
        </main>
        <CrispChat />
      </div>
    </>
  );
}
