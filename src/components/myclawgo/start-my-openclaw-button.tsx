'use client';

import { authClient } from '@/lib/auth-client';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function withLocale(path: string, locale: string) {
  if (!path.startsWith('/')) return `/${locale}/${path}`;
  if (path === '/') return `/${locale}`;
  const normalized = path.toLowerCase();
  if (
    normalized.startsWith(`/${locale.toLowerCase()}/`) ||
    normalized === `/${locale.toLowerCase()}`
  ) {
    return path;
  }
  return `/${locale}${path}`;
}

export function StartMyOpenClawButton() {
  const router = useRouter();
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const session = await authClient.getSession();
      if (!session?.data?.user?.id) {
        router.push(withLocale('/auth/login', locale));
        return;
      }

      const res = await fetch('/api/runtime/start', { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (data?.action === 'login-required') {
        router.push(withLocale('/auth/login', locale));
        return;
      }

      if (data?.redirectTo) {
        router.push(withLocale(String(data.redirectTo), locale));
        return;
      }

      if (!res.ok && data?.action === 'runtime-not-ready') {
        setError(
          String(
            data?.error ||
              'Runtime is warming up. Please retry in a few seconds.'
          )
        );
        return;
      }

      router.push(withLocale('/pricing', locale));
    } catch {
      setError('We’re having trouble connecting to our servers. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-60"
      >
        {loading ? 'Checking...' : 'Start My OpenClaw'}
      </button>
      {error && <p className="text-sm text-amber-600">{error}</p>}
    </div>
  );
}
