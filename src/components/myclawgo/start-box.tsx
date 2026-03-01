'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StartBox({
  placeholder,
  button,
}: {
  placeholder: string;
  button: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onSubmit = async () => {
    const value = prompt.trim();
    if (!value || loading) return;

    setLoading(true);
    try {
      const res = await fetch('/api/runtime/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: value }),
      });
      const data = await res.json();
      if (data?.ok && data?.redirectTo) {
        router.push(data.redirectTo);
        return;
      }
      alert(data?.error || 'Failed to create runtime session');
    } catch {
      alert('Network error, please retry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-3 md:flex-row">
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
  );
}
