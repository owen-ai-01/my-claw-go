import { StartMyOpenClawButton } from '@/components/myclawgo/start-my-openclaw-button';
import { PricingTable } from '@/components/pricing/pricing-table';
import { JsonLd } from '@/components/seo/json-ld';
import { constructMetadata } from '@/lib/metadata';
import { getBaseUrl } from '@/lib/urls/urls';
import { Routes } from '@/routes';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import Image from 'next/image';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return constructMetadata({
    title: 'OpenClaw Hosting — Managed Cloud, No VPS | MyClawGo',
    description:
      'The easiest OpenClaw hosting service. Private, always-on OpenClaw instance in the cloud — managed hosting, no server setup, no API key hassle. Start in minutes.',
    locale,
    pathname: '/openclaw-hosting',
  });
}

const selfVsManaged = [
  {
    aspect: 'Setup time',
    self: '2–8 hours (VPS, packages, config)',
    managed: '< 5 minutes',
  },
  {
    aspect: 'Server knowledge required',
    self: 'Linux, SSH, systemd, Docker',
    managed: 'None',
  },
  {
    aspect: 'API key management',
    self: 'Manual per-provider setup',
    managed: 'Managed defaults included',
  },
  {
    aspect: 'Uptime & maintenance',
    self: 'Your responsibility 24/7',
    managed: 'Fully managed',
  },
  {
    aspect: 'Cost predictability',
    self: 'VPS + API costs vary',
    managed: 'Fixed monthly plan',
  },
  {
    aspect: 'Data privacy',
    self: 'Your server',
    managed: 'Dedicated private instance',
  },
  {
    aspect: 'Updates',
    self: 'Manual',
    managed: 'Automatic',
  },
];

const features = [
  {
    icon: '☁️',
    title: 'Fully Managed OpenClaw Hosting',
    desc: 'We run the servers, the gateway, and the bridge so you never have to think about infrastructure. Your OpenClaw instance is always on and always ready.',
  },
  {
    icon: '🔐',
    title: 'Dedicated Private Instance',
    desc: 'Every user gets an isolated OpenClaw runtime. Your memory, files, and context are never shared with other accounts.',
  },
  {
    icon: '⚡',
    title: 'No Setup, No Terminal',
    desc: 'Skip VPS provisioning, package installation, and config debugging. Sign up, pay, and open your workspace — that is the entire setup.',
  },
  {
    icon: '🤖',
    title: 'Multi-Agent Group Conversations',
    desc: 'Create agent groups where multiple specialized agents relay conversations. This goes beyond single-agent hosting that most providers offer.',
  },
  {
    icon: '🧠',
    title: 'Persistent Memory Across Sessions',
    desc: 'Your OpenClaw instance remembers context, files, and progress. Sessions compound instead of resetting every time.',
  },
  {
    icon: '🕐',
    title: '24/7 Always-On OpenClaw Hosting',
    desc: 'Your OpenClaw hosting environment runs continuously in the cloud — no sleep mode, no shutdowns, no restarts. Your agents are ready any time you need them, from any device.',
  },
];

const faq = [
  {
    q: 'What exactly is OpenClaw hosting?',
    a: 'OpenClaw hosting means running the OpenClaw AI agent platform on a cloud server so it is always available without needing your own machine running 24/7. Managed OpenClaw hosting like MyClawGo handles all the server setup for you.',
  },
  {
    q: 'How is managed OpenClaw hosting different from self-hosting?',
    a: 'With self-hosting you rent a VPS, install OpenClaw manually, manage updates, and keep the server running yourself. With managed hosting like MyClawGo, all of that is handled for you — you just use the product.',
  },
  {
    q: 'Do I need technical knowledge to use MyClawGo\'s OpenClaw hosting?',
    a: 'No. MyClawGo is specifically designed for non-technical users. You do not need to know Linux, SSH, or server administration. Sign up and start immediately.',
  },
  {
    q: 'Is my OpenClaw instance private?',
    a: 'Yes. Every MyClawGo account gets a dedicated, isolated OpenClaw runtime. Your data and memory are completely separate from other users.',
  },
  {
    q: 'How long does it take to get my OpenClaw instance up and running?',
    a: 'After subscribing, your private OpenClaw instance is provisioned automatically. It is typically ready within 2–5 minutes.',
  },
  {
    q: 'Can I upgrade my OpenClaw hosting plan later?',
    a: 'Yes. You can move from Pro to Premium or Ultra at any time. Your workspace data and context carry over seamlessly.',
  },
  {
    q: 'How does MyClawGo compare to myclaw.ai or other OpenClaw hosting services?',
    a: 'MyClawGo supports multi-agent group conversations, unlimited agents per workspace, and dedicated per-user OpenRouter keys — features not found in most basic OpenClaw hosting providers. It is also the only managed OpenClaw hosting service built around multi-agent relay workflows.',
  },
];

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function OpenClawHostingPage(_props: PageProps) {
  const baseUrl = getBaseUrl();

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MyClawGo OpenClaw Hosting',
    url: `${baseUrl}/openclaw-hosting`,
    description:
      'Managed OpenClaw hosting platform — private cloud instance, no server setup, always-on AI workspace.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '29.90',
      highPrice: '199.90',
      priceCurrency: 'USD',
    },
  };

  return (
    <>
      <JsonLd data={faqLd} />
      <JsonLd data={productLd} />

      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 text-foreground">
        <main className="mx-auto max-w-6xl px-6 py-14 md:py-20">

          {/* ── Hero ── */}
          <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
            <Image
              src="/hero_background_1771074066381.png"
              alt="OpenClaw hosted workspace in the cloud"
              fill
              className="object-cover opacity-10"
              priority
            />
            <div className="relative px-8 py-14 md:px-14 md:py-20">
              <div className="mx-auto max-w-4xl text-center">
                <span className="inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-400">
                  Managed OpenClaw Hosting
                </span>
                <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
                  OpenClaw Hosting in the Cloud —{' '}
                  <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                    No Server, No Setup
                  </span>
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
                  MyClawGo is the easiest managed OpenClaw hosting service
                  available. Get your own private, always-on OpenClaw instance
                  in the cloud — fully managed, dedicated to you, ready in
                  minutes.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                  <StartMyOpenClawButton />
                  <a
                    href="#compare"
                    className="rounded-xl border border-border px-6 py-4 text-sm font-semibold text-foreground transition hover:bg-muted"
                  >
                    See How It Compares
                  </a>
                </div>
                <div className="mt-7 flex flex-wrap justify-center gap-2">
                  {[
                    '☁️ Cloud-hosted OpenClaw',
                    '🔐 Private dedicated instance',
                    '⚡ Ready in under 5 minutes',
                    '🚫 No VPS required',
                    '🛠️ No setup needed',
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── OpenClaw traction stats ── */}
          <section className="mt-10 rounded-2xl border border-border bg-card p-8">
            <p className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Why OpenClaw hosting is in high demand right now
            </p>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {[
                { number: '347K+', label: 'GitHub Stars', icon: '⭐' },
                { number: '180K+', label: 'Discord Members', icon: '💬' },
                { number: '450K+', label: 'Reddit Community', icon: '🌐' },
                { number: '#1', label: 'Fastest-Growing AI Repo 2026', icon: '🚀' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl">{stat.icon}</div>
                  <div className="mt-2 text-3xl font-bold">{stat.number}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
              OpenClaw is the world's fastest-growing open-source AI agent — but
              most people never actually use it because self-hosting is complex.
              That's exactly the gap MyClawGo's managed OpenClaw hosting fills.
            </p>
          </section>

          {/* ── What is OpenClaw hosting ── */}
          <section className="mt-10 space-y-5 rounded-2xl border border-border bg-card p-8">
            <h2 className="text-2xl font-bold">
              🧩 What Is OpenClaw Hosting?
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              <strong>OpenClaw hosting</strong> means running the OpenClaw AI
              agent platform on a cloud server so it is always available —
              without your own machine running 24/7. OpenClaw is powerful, but
              setting it up traditionally requires renting a VPS, installing
              dependencies, managing system services, configuring API keys for
              multiple providers, and keeping everything updated. For most
              users, that barrier is simply too high.
            </p>
            <p className="text-sm leading-7 text-muted-foreground">
              <strong>Managed OpenClaw hosting</strong> removes all of that.
              With MyClawGo, we provision a private cloud server for your
              account, install and configure OpenClaw, connect all the services,
              and keep it running. You open your browser, type an instruction,
              and your OpenClaw workspace responds — no terminal, no config
              files, no maintenance windows.
            </p>
            <div className="mt-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
              <p className="text-sm font-semibold text-blue-400">
                💡 Think of it this way:
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Self-hosting OpenClaw is like buying a car engine and building
                the car yourself. MyClawGo is like getting a car delivered,
                ready to drive. Same powerful engine — zero assembly required.
              </p>
            </div>
          </section>

          {/* ── Self-hosted vs Managed table ── */}
          <section id="compare" className="mt-10 rounded-2xl border border-border bg-card p-8">
            <h2 className="mb-6 text-2xl font-bold">
              ⚖️ Self-Hosted vs Managed OpenClaw Hosting
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-3 text-left font-semibold text-muted-foreground">Aspect</th>
                    <th className="py-3 text-left font-semibold text-muted-foreground">Self-Hosted OpenClaw</th>
                    <th className="py-3 text-left font-semibold text-green-500">MyClawGo Managed Hosting</th>
                  </tr>
                </thead>
                <tbody>
                  {selfVsManaged.map((row, i) => (
                    <tr
                      key={row.aspect}
                      className={`border-b border-border/50 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}
                    >
                      <td className="py-3 font-medium">{row.aspect}</td>
                      <td className="py-3 text-muted-foreground">
                        <span className="flex items-start gap-2">
                          <span className="mt-0.5 text-red-400">✗</span>
                          {row.self}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="flex items-start gap-2">
                          <span className="mt-0.5 text-green-500">✓</span>
                          {row.managed}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Features ── */}
          <section id="features" className="mt-10">
            <h2 className="mb-6 text-2xl font-bold">
              ✨ What You Get with MyClawGo OpenClaw Hosting
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <article
                  key={f.title}
                  className="rounded-2xl border border-border bg-card p-6 transition hover:shadow-md"
                >
                  <div className="text-3xl">{f.icon}</div>
                  <h3 className="mt-4 text-sm font-bold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {f.desc}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* ── How it works ── */}
          <section className="mt-10 rounded-2xl border border-border bg-card p-8">
            <h2 className="mb-8 text-2xl font-bold">
              🚀 How MyClawGo OpenClaw Hosting Works
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  step: '01',
                  icon: '📝',
                  title: 'Sign up and choose your plan',
                  desc: 'Create your account and pick the OpenClaw hosting plan that fits your usage — Pro, Premium, or Ultra.',
                  color: 'from-blue-500/20 to-blue-500/5',
                  border: 'border-blue-500/20',
                },
                {
                  step: '02',
                  icon: '⚙️',
                  title: 'We provision your OpenClaw instance',
                  desc: 'A private cloud server is automatically set up for your account. OpenClaw is installed, configured, and connected — all within minutes.',
                  color: 'from-purple-500/20 to-purple-500/5',
                  border: 'border-purple-500/20',
                },
                {
                  step: '03',
                  icon: '💬',
                  title: 'Open your workspace and start',
                  desc: 'Your hosted OpenClaw workspace is ready. Type in natural language, run automations, and build workflows that persist across every session.',
                  color: 'from-green-500/20 to-green-500/5',
                  border: 'border-green-500/20',
                },
              ].map((s) => (
                <article
                  key={s.step}
                  className={`rounded-2xl border bg-gradient-to-b p-6 ${s.border} ${s.color}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-background/60 px-2.5 py-1 text-xs font-bold tracking-widest text-muted-foreground">
                      {s.step}
                    </span>
                    <span className="text-2xl">{s.icon}</span>
                  </div>
                  <h3 className="mt-4 text-sm font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.desc}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ── Workspace screenshot / visual ── */}
          <section className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 px-8 py-6">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Your hosted OpenClaw workspace
              </p>
            </div>
            <div className="relative">
              <Image
                src="/hero_background_1771074039303.png"
                alt="MyClawGo managed OpenClaw hosting workspace interface"
                width={1200}
                height={600}
                className="w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-background/80 to-transparent">
                <div className="text-center">
                  <p className="text-lg font-bold">Your private OpenClaw — always on, always yours</p>
                  <div className="mt-4">
                    <StartMyOpenClawButton />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Why Choose ── */}
          <section className="mt-10 space-y-5 rounded-2xl border border-border bg-card p-8">
            <h2 className="text-2xl font-bold">
              🏆 Why Choose MyClawGo for OpenClaw Hosting?
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Not all OpenClaw hosting services are the same. MyClawGo is built
              specifically to deliver a production-grade OpenClaw hosting
              experience to everyone — no technical knowledge required, no VPS
              bills, no weekend maintenance calls.
            </p>
            <p className="text-sm leading-7 text-muted-foreground">
              A typical self-managed OpenClaw hosting setup involves many
              failure points: misconfigured system services, outdated packages,
              expired API keys, and manual updates that break your gateway. Every
              hour spent debugging your OpenClaw hosting environment is time not
              spent getting value from OpenClaw itself. MyClawGo solves this
              with fully managed OpenClaw hosting — we handle every layer so
              you never have to.
            </p>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              {[
                {
                  title: 'Isolated per-user instances',
                  desc: 'Dedicated OpenClaw hosting, not shared containers. Your agents, memory, and files live on a private cloud server assigned only to your account.',
                },
                {
                  title: 'Multi-agent relay',
                  desc: 'The only OpenClaw hosting platform where you can run groups of specialized agents that hand off tasks between each other automatically.',
                },
                {
                  title: 'Persistent workspace',
                  desc: 'Your OpenClaw hosting instance retains context, files, and task history across every session — nothing is lost between conversations.',
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-2">
                  <span className="mt-1 shrink-0 text-green-500">✓</span>
                  <span>
                    <strong>{item.title}</strong> — {item.desc}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Pricing ── */}
          <section id="pricing" className="mt-10 space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">
                💳 OpenClaw Hosting Plans
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
                All plans include a fully managed, private OpenClaw instance.
                Pick the capacity that matches your usage.
              </p>
            </div>
            <PricingTable />
          </section>

          {/* ── FAQ ── */}
          <section className="mt-10 rounded-2xl border border-border bg-card p-8">
            <h2 className="mb-6 text-2xl font-bold">
              ❓ OpenClaw Hosting FAQ
            </h2>
            <div className="space-y-3">
              {faq.map((item) => (
                <article
                  key={item.q}
                  className="rounded-xl border border-border bg-muted/30 p-5"
                >
                  <h3 className="text-sm font-bold">{item.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.a}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* ── Final CTA ── */}
          <section className="mt-10 rounded-3xl border border-border bg-gradient-to-br from-blue-600/10 via-card to-purple-600/10 p-10 text-center shadow-lg">
            <h2 className="text-3xl font-bold">
              Start Your OpenClaw Hosting Today
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
              Stop wrestling with VPS setup. Get a private, managed OpenClaw
              instance in the cloud — ready to use in minutes, not hours.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <StartMyOpenClawButton />
              <a
                href={Routes.Pricing}
                className="rounded-xl border border-border px-6 py-4 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                View Hosting Plans
              </a>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              No VPS setup · Private dedicated instance · Cancel anytime
            </p>
          </section>

        </main>
      </div>
    </>
  );
}
