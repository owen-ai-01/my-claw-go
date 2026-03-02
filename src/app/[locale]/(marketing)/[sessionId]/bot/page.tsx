'use client';

import {
  getClientTimeoutMs,
  isSafeCommandInput,
} from '@/lib/myclawgo/command-policy';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

function normalizeError(raw: string) {
  if (!raw) return 'Request failed. Please retry.';
  const lower = raw.toLowerCase();
  if (raw.includes('spawn docker ENOENT')) {
    return 'Runtime backend is not ready: Docker is missing on server.';
  }
  if (raw.includes('Command not allowed')) {
    return 'Command blocked by safety policy. Try: openclaw skills list / openclaw models status / clawhub search <keyword>.';
  }
  if (raw.includes('timed out')) {
    return 'Command timed out. For install/agent commands, retry once and wait for completion.';
  }
  if (lower.includes('insufficient') && lower.includes('credit')) {
    return 'Credits are insufficient. Please recharge to continue.';
  }
  return raw;
}

export default function BotPage() {
  const params = useParams<{ sessionId: string; locale?: string }>();
  const sessionId = params.sessionId;
  const locale = params.locale || 'en';
  const pricingHref = `/${locale}/pricing`;
  const searchParams = useSearchParams();
  const router = useRouter();
  const [guardReady, setGuardReady] = useState(false);

  const lowCreditsFromQuery = searchParams.get('lowCredits') === '1';
  const [lowCredits, setLowCredits] = useState(lowCreditsFromQuery);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'bot'; text: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const res = await fetch(`/api/runtime/${sessionId}/guard`, {
          method: 'GET',
        });
        const data = await res.json().catch(() => ({}));

        if (!mounted) return;

        if (data?.action === 'redirect-login' && data?.redirectTo) {
          router.replace(data.redirectTo);
          return;
        }
        if (data?.action === 'redirect-own-bot' && data?.redirectTo) {
          router.replace(data.redirectTo);
          return;
        }
        if (data?.action === 'redirect-pricing' && data?.redirectTo) {
          router.replace(data.redirectTo);
          return;
        }
        if (data?.action === 'allow-with-low-credits') {
          setLowCredits(true);
        }
      } finally {
        if (mounted) setGuardReady(true);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [router, sessionId]);

  async function onSend() {
    const text = input.trim();
    if (!text || loading || lowCredits) return;

    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const rawCommand = text.startsWith('/cmd ') ? text.slice(5).trim() : text;
      const isCommand = text.startsWith('/cmd ') || isSafeCommandInput(text);
      const endpoint = isCommand
        ? `/api/runtime/${sessionId}/exec`
        : `/api/runtime/${sessionId}/chat`;
      const payload = isCommand ? { command: rawCommand } : { message: text };

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        getClientTimeoutMs(isCommand, rawCommand)
      );
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        if (data?.code === 'INSUFFICIENT_CREDITS' || res.status === 402) {
          setLowCredits(true);
        }

        setMessages((m) => [
          ...m,
          {
            role: 'bot',
            text: `⚠️ ${normalizeError(String(data?.error || 'Request failed'))}`,
          },
        ]);
        return;
      }

      const replyText = isCommand
        ? `🛠️ [${data?.container || 'container'}]\n${data?.output || '(no output)'}`
        : data?.reply || 'No reply';

      setMessages((m) => [...m, { role: 'bot', text: replyText }]);
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          text: aborted
            ? '⚠️ Request timed out. Please retry once; for install/agent commands, allow more time.'
            : '⚠️ Network request failed. Please retry.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!guardReady) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-4xl p-6 text-sm text-slate-300">
          Checking your workspace access...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">MyClawGo Bot Workspace</h1>
        <p className="mt-2 text-sm text-slate-300">
          Session ID: {sessionId} · isolated docker runtime initialized.
        </p>

        {lowCredits && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-200">
            <p>
              Credits are insufficient. Please recharge credits to continue
              running tasks.
            </p>
            <button
              type="button"
              onClick={() => router.push(pricingHref)}
              className="mt-2 inline-flex h-9 items-center rounded-md bg-amber-300 px-3 text-sm font-semibold text-amber-950"
            >
              Recharge Credits
            </button>
          </div>
        )}

        <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400">
              Start chatting naturally. Example: install gog skill / list
              available skills. All actions run only inside your own container,
              and your conversation context is stored in your private My Claw Go
              workspace.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <span
                  className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-600' : 'bg-slate-700'}`}
                >
                  {m.text}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
          <button
            type="button"
            onClick={() => setInput('/cmd openclaw skills list')}
            disabled={loading || lowCredits}
            className="rounded-md border border-white/15 px-2 py-1 hover:bg-white/5 disabled:opacity-60"
          >
            Try: skills list
          </button>
          <button
            type="button"
            onClick={() => setInput('/cmd openclaw models status')}
            disabled={loading || lowCredits}
            className="rounded-md border border-white/15 px-2 py-1 hover:bg-white/5 disabled:opacity-60"
          >
            Try: models status
          </button>
          <button
            type="button"
            onClick={() => setInput('/cmd clawhub search browser-use')}
            disabled={loading || lowCredits}
            className="rounded-md border border-white/15 px-2 py-1 hover:bg-white/5 disabled:opacity-60"
          >
            Try: skill search
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            disabled={lowCredits}
            className="h-11 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 text-sm disabled:opacity-60"
            placeholder={
              lowCredits
                ? 'Recharge credits to continue'
                : 'Ask naturally, or run a safe command directly (e.g. openclaw skills list)'
            }
          />
          <button
            type="button"
            onClick={onSend}
            disabled={loading || lowCredits}
            className="h-11 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {lowCredits ? 'Recharge Needed' : loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </main>
  );
}
