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

  async function onClick() {
    if (loading) return;
    setLoading(true);

    try {
      const session = await authClient.getSession();
      if (!session?.data?.user?.id) {
        router.push(withLocale('/auth/login', locale));
        return;
      }
      router.push(withLocale('/chat', locale));
    } catch {
      router.push(withLocale('/auth/login', locale));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-60"
    >
      {loading ? 'Loading...' : 'Start My OpenClaw'}
    </button>
  );
}
