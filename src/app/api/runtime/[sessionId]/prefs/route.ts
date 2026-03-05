import { auth } from '@/lib/auth';
import {
  AVAILABLE_MODELS,
  readUserPrefs,
  saveUserPrefs,
} from '@/lib/myclawgo/user-data';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (authSession?.user?.id !== sessionId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const prefs = await readUserPrefs(sessionId);
  return NextResponse.json({ ok: true, prefs, models: AVAILABLE_MODELS });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (authSession?.user?.id !== sessionId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const validIds = AVAILABLE_MODELS.map((m) => m.id);
  if (body?.model && !validIds.includes(body.model)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid model' },
      { status: 400 }
    );
  }
  const prefs = await saveUserPrefs(sessionId, { model: body.model });
  return NextResponse.json({ ok: true, prefs });
}
