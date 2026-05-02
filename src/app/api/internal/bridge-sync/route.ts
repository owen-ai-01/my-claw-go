import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { runtimeAllocation, userAgentDoc, userGroup, userChatMessage } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

async function resolveUserFromBridgeToken(token: string): Promise<string | null> {
  const db = await getDb();
  const [alloc] = await db
    .select({ userId: runtimeAllocation.userId })
    .from(runtimeAllocation)
    .where(and(eq(runtimeAllocation.bridgeToken, token), eq(runtimeAllocation.status, 'ready')))
    .limit(1);
  return alloc?.userId ?? null;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = await resolveUserFromBridgeToken(token);
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unknown bridge token' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.type !== 'string') {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }

  const db = await getDb();
  const now = new Date();

  const MAX_CONTENT = 5 * 1024 * 1024; // 5 MB

  if (body.type === 'agent_doc') {
    const { agentId, docKey, content } = body as { agentId: string; docKey: string; content: string };
    const VALID_DOC_KEYS = ['agents', 'identity', 'user', 'soul', 'tools'];
    if (!agentId || !docKey || typeof content !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 });
    }
    if (!VALID_DOC_KEYS.includes(docKey)) {
      return NextResponse.json({ ok: false, error: 'Invalid docKey' }, { status: 400 });
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT) {
      return NextResponse.json({ ok: false, error: 'Content too large' }, { status: 413 });
    }
    await db
      .insert(userAgentDoc)
      .values({ id: randomUUID(), userId, agentId, docKey, content, updatedAt: now })
      .onConflictDoUpdate({
        target: [userAgentDoc.userId, userAgentDoc.agentId, userAgentDoc.docKey],
        set: { content, updatedAt: now },
      });
    return NextResponse.json({ ok: true });
  }

  if (body.type === 'group_upsert') {
    const g = body.group as {
      id: string; name: string; description?: string; leaderId: string;
      members: string[]; relay?: unknown; channels?: unknown; createdAt?: string;
    };
    if (!g?.id || !g.name || !g.leaderId || !Array.isArray(g.members)) {
      return NextResponse.json({ ok: false, error: 'Missing group fields' }, { status: 400 });
    }
    await db
      .insert(userGroup)
      .values({
        id: randomUUID(),
        userId,
        groupId: g.id,
        name: g.name,
        description: g.description ?? null,
        leaderId: g.leaderId,
        members: g.members,
        relay: g.relay ?? null,
        channels: g.channels ?? null,
        groupCreatedAt: g.createdAt ? new Date(g.createdAt) : now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userGroup.userId, userGroup.groupId],
        set: {
          name: g.name,
          description: g.description ?? null,
          leaderId: g.leaderId,
          members: g.members,
          relay: g.relay ?? null,
          channels: g.channels ?? null,
          updatedAt: now,
        },
      });
    return NextResponse.json({ ok: true });
  }

  if (body.type === 'group_delete') {
    const { groupId } = body as { groupId: string };
    if (!groupId) return NextResponse.json({ ok: false, error: 'Missing groupId' }, { status: 400 });
    await db
      .delete(userGroup)
      .where(and(eq(userGroup.userId, userId), eq(userGroup.groupId, groupId)));
    return NextResponse.json({ ok: true });
  }

  if (body.type === 'chat_message') {
    const m = body as {
      messageId: string; role: string; agentId: string; content: string;
      groupId?: string; channel: string; chatScope: string;
      routedAgentId?: string; meta?: unknown;
    };
    if (!m.role || !m.agentId || typeof m.content !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing message fields' }, { status: 400 });
    }
    if (m.role !== 'user' && m.role !== 'assistant') {
      return NextResponse.json({ ok: false, error: 'Invalid role' }, { status: 400 });
    }
    if (Buffer.byteLength(m.content, 'utf8') > MAX_CONTENT) {
      return NextResponse.json({ ok: false, error: 'Content too large' }, { status: 413 });
    }
    await db.insert(userChatMessage).values({
      id: m.messageId || randomUUID(),
      userId,
      agentId: m.agentId,
      role: m.role,
      content: m.content,
      status: 'done',
      groupId: m.groupId ?? null,
      channel: m.channel || 'direct',
      chatScope: m.chatScope || 'default',
      routedAgentId: m.routedAgentId ?? null,
      metaJson: m.meta ?? null,
    }).onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: `Unknown event type: ${body.type}` }, { status: 400 });
}
