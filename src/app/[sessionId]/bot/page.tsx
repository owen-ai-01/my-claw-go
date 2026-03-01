'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';

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
      const res = await fetch(`/api/runtime/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: 'bot', text: data?.reply || 'No reply' }]);
    } catch {
      setMessages((m) => [...m, { role: 'bot', text: 'Request failed. Please retry.' }]);
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
            <p className="text-sm text-slate-400">Start chatting. This workspace maps to your dedicated OpenClaw runtime.</p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <span className={`inline-block rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-600' : 'bg-slate-700'}`}>
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
            placeholder="Type your message..."
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
