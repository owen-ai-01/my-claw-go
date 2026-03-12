'use client';

import { useEffect, useState } from 'react';

type RuntimeStatus =
  | { ok: true; state: 'not_created'; reason: string; containerName?: string }
  | { ok: true; state: 'ready'; reason: string; containerName?: string }
  | { ok: false; error: string };

export function ChatShell() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      const res = await fetch('/api/chat/runtime-status').catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as RuntimeStatus;
      if (stopped) return;
      if (!data || typeof data !== 'object') {
        setStatus({ ok: false, error: 'Failed to load runtime status' });
        return;
      }
      setStatus(data);
    };
    run();
    return () => {
      stopped = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Your MyClawGo workspace chat will live here.
        </p>
      </div>

      {!status ? (
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">Checking your MyClawGo status…</p>
        </div>
      ) : null}

      {status?.ok && status.state === 'not_created' ? (
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <h2 className="text-xl font-semibold">Create MyClawGo</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Create your private OpenClaw cloud workspace first. After it is ready,
              you will enter chat directly.
            </p>
            <button
              type="button"
              disabled
              className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground opacity-80"
            >
              Create MyClawGo
            </button>
            <p className="mt-4 text-xs text-muted-foreground">
              Step 2: real create flow will be connected next.
            </p>
          </div>
        </div>
      ) : null}

      {status?.ok && status.state === 'ready' ? (
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <h2 className="text-xl font-semibold">Chat ready</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Your runtime already exists. Next step is to replace this placeholder with
              the direct OpenClaw-style chat experience.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Container: {status.containerName || 'unknown'}
            </p>
          </div>
        </div>
      ) : null}

      {status && !status.ok ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {status.error}
        </div>
      ) : null}
    </div>
  );
}
