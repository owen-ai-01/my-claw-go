'use client';

import { useEffect, useState } from 'react';

type RuntimeStatus =
  | { ok: true; state: 'not_created'; reason: string; containerName?: string }
  | { ok: true; state: 'ready'; reason: string; containerName?: string }
  | { ok: false; error: string };

function ReadyChatLayout({ containerName }: { containerName?: string }) {
  return (
    <div className="grid min-h-[72vh] grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">MyClawGo Chat</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This area will become the OpenClaw-style direct chat entry.
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
            Ready
          </span>
        </div>

        <div className="mt-5 rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Runtime container</p>
          <p className="mt-1 break-all text-sm font-medium">
            {containerName || 'unknown'}
          </p>
        </div>

        <div className="mt-4 rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Goal</p>
          <p className="mt-1 text-sm">
            Replace the old long task-chain chat with a direct OpenClaw-like chat path.
          </p>
        </div>
      </aside>

      <section className="flex min-h-[72vh] flex-col rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Chat</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Next step: wire this panel directly to the user runtime in an OpenClaw-style flow.
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-between">
          <div className="flex flex-1 items-center justify-center px-6 py-10">
            <div className="max-w-xl text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl">
                💬
              </div>
              <h3 className="text-xl font-semibold">Direct chat layout ready</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                We now have a dedicated chat surface separated from runtime creation.
                The next step is to connect this directly to the user Docker OpenClaw,
                following the same short-chain idea as OpenClaw&apos;s own /chat.
              </p>
            </div>
          </div>

          <div className="border-t px-6 py-4">
            <div className="flex items-center gap-3 rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground">
              <div className="flex-1 text-left">Chat input will be connected in the next step.</div>
              <button
                type="button"
                disabled
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-80"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ChatShell() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [creating, setCreating] = useState(false);

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

  async function onCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/chat/create', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as
        | (RuntimeStatus & { mode?: string })
        | { ok?: boolean; error?: string; mode?: string; containerName?: string };
      if (!res.ok || !data || data.ok !== true) {
        const error = 'error' in (data || {}) ? (data as { error?: string }).error : undefined;
        setStatus({ ok: false, error: error || 'Failed to create MyClawGo' });
        return;
      }
      setStatus({
        ok: true,
        state: 'ready',
        reason: 'runtime-created',
        containerName: data.containerName,
      });
    } finally {
      setCreating(false);
    }
  }

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
              onClick={onCreate}
              disabled={creating}
              className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              {creating ? 'Creating…' : 'Create MyClawGo'}
            </button>
          </div>
        </div>
      ) : null}

      {status?.ok && status.state === 'ready' ? (
        <ReadyChatLayout containerName={status.containerName} />
      ) : null}

      {status && !status.ok ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {status.error}
        </div>
      ) : null}
    </div>
  );
}
