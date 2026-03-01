'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

function buildBotPath(locale: string, sessionId: string) {
  if (!locale || locale === 'de') return `/${sessionId}/bot`;
  return `/${locale}/${sessionId}/bot`;
}

function normalizeError(raw: string) {
  if (!raw) return 'Failed to create runtime session';
  if (raw.includes('spawn docker ENOENT')) {
    return 'Server runtime is not ready: Docker is not installed yet.';
  }
  return raw;
}

export function StartBox({
  placeholder,
  button,
}: {
  placeholder: string;
  button: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const locale = useLocale();

  const onSubmit = async () => {
    const value = prompt.trim();
    if (!value || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/runtime/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: value }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setError(normalizeError(String(data?.error || 'Failed to create runtime session')));
        return;
      }

      if (data?.sessionId) {
        router.push(buildBotPath(locale, data.sessionId));
        return;
      }

      setError('Session created, but redirect failed. Please retry.');
    } catch {
      setError('Network request failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 md:flex-row">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          className="h-12 flex-1 rounded-xl border border-white/10 bg-slate-900/80 px-4 text-sm outline-none placeholder:text-slate-500 focus:border-slate-400"
          placeholder={placeholder}
        />
        <button
          onClick={onSubmit}
          disabled={loading}
          className="h-12 rounded-xl bg-white px-6 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:opacity-60"
        >
          {loading ? 'Creating...' : button}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {error}
        </p>
      )}
    </div>
  );
}
