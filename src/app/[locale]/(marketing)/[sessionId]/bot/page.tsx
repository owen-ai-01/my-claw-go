'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';

function normalizeError(raw: string) {
  if (!raw) return 'Request failed. Please retry.';
  if (raw.includes('spawn docker ENOENT')) {
    return 'Runtime backend is not ready: Docker is missing on server.';
  }
  return raw;
}

export default function BotPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'bot'; text: string }>>([]);
  const [loading, setLoading] = useState(false);

  async function onSend() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const isCommand = text.startsWith('/cmd ');
      const endpoint = isCommand
        ? `/api/runtime/${sessionId}/exec`
        : `/api/runtime/${sessionId}/chat`;
      const payload = isCommand ? { command: text.slice(5).trim() } : { message: text };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setMessages((m) => [...m, { role: 'bot', text: `⚠️ ${normalizeError(String(data?.error || 'Request failed'))}` }]);
        return;
      }

      const replyText = isCommand
        ? `🛠️ [${data?.container || 'container'}]\n${data?.output || '(no output)'}`
        : data?.reply || 'No reply';

      setMessages((m) => [...m, { role: 'bot', text: replyText }]);
    } catch {
      setMessages((m) => [...m, { role: 'bot', text: '⚠️ Network request failed. Please retry.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">MyClawGo Bot Workspace</h1>
        <p className="mt-2 text-sm text-slate-300">Session ID: {sessionId} · isolated docker runtime initialized.</p>

        <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400">
              Start chatting naturally. Example: 安装一下gog这个skill / 列出有哪些skill。These actions run only in your own container.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <span className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-600' : 'bg-slate-700'}`}>
                  {m.text}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            className="h-11 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 text-sm"
            placeholder="Ask naturally, e.g. 安装一下gog这个skill"
          />
          <button
            onClick={onSend}
            disabled={loading}
            className="h-11 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </main>
  );
}
