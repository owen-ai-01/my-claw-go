import { ensureUserContainer } from '@/lib/myclawgo/docker-manager';
import { createSession } from '@/lib/myclawgo/session-store';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt || '').trim();

    if (!prompt) {
      return NextResponse.json(
        { ok: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (prompt.length > 600) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Prompt is too long. Keep it under 600 characters.',
        },
        { status: 400 }
      );
    }

    const session = await createSession(prompt);
    const container = await ensureUserContainer(session);

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      credits: session.credits,
      runtime: container,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
