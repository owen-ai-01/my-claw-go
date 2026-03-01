'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function StartMyOpenClawButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);

    try {
      const session = await authClient.getSession();
      if (!session?.data?.user?.id) {
        router.push('/login');
        return;
      }

      const res = await fetch('/api/runtime/start', { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (data?.action === 'login-required') {
        router.push('/login');
        return;
      }
      if (data?.redirectTo) {
        router.push(data.redirectTo);
        return;
      }

      router.push('/pricing');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
    >
      {loading ? 'Checking...' : 'Start My OpenClaw'}
    </button>
  );
}
