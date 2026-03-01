import { NextResponse } from 'next/server';
import { createSession } from '@/lib/myclawgo/session-store';
import { ensureUserContainer } from '@/lib/myclawgo/docker-manager';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt || '').trim();

    if (!prompt) {
      return NextResponse.json({ ok: false, error: 'Prompt is required' }, { status: 400 });
    }

    const session = await createSession(prompt);
    const container = await ensureUserContainer(session);

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      redirectTo: `/${session.id}/bot`,
      credits: session.credits,
      runtime: container,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
