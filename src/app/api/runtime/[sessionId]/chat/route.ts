import { consumeCredits, getUserCredits } from '@/credits/credits';
import { auth } from '@/lib/auth';
import {
  ensureUserContainer,
  runOpenClawChatInContainer,
  runWhitelistedCommandInContainer,
} from '@/lib/myclawgo/docker-manager';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

type Intent =
  | { kind: 'install-skill'; command: string; skill: string }
  | { kind: 'list-skills'; command: string }
  | { kind: 'list-agents'; command: string }
  | { kind: 'none' };

function parseNaturalLanguageIntent(message: string): Intent {
  const text = message.trim();
  if (!text) return { kind: 'none' };

  const installCn = text.match(
    /安装(?:一下)?\s*([a-zA-Z0-9-_]+)\s*(?:这个)?\s*skill/i
  );
  const installEn = text.match(
    /install\s+(?:the\s+)?skill\s+([a-zA-Z0-9-_]+)/i
  );
  const installAlt = text.match(/skill\s*[:：]\s*([a-zA-Z0-9-_]+)\s*.*安装/i);

  const skill = installCn?.[1] || installEn?.[1] || installAlt?.[1];
  if (skill) {
    return {
      kind: 'install-skill',
      skill,
      command: `clawhub install ${skill} --dir /home/openclaw/.openclaw/workspace/skills --force`,
    };
  }

  if (/有哪些\s*skill|列出\s*skill|skills?\s*list|list\s*skills?/i.test(text)) {
    return { kind: 'list-skills', command: 'openclaw skills list' };
  }

  if (/有哪些\s*agent|列出\s*agent|agents?\s*list|list\s*agents?/i.test(text)) {
    return { kind: 'list-agents', command: 'openclaw agents list --bindings' };
  }

  return { kind: 'none' };
}

function estimateTokens(message: string, reply: string) {
  const chars = (message?.length || 0) + (reply?.length || 0);
  return Math.max(1, Math.ceil(chars / 4));
}

function estimateUsdCostFromTokens(tokens: number) {
  // configurable rough estimate for runtime billing, default: $0.00001/token
  const usdPerToken = Number(process.env.MYCLAWGO_USD_PER_TOKEN || '0.00001');
  return tokens * usdPerToken;
}

function creditsFromUsd(usdCost: number) {
  // 1 credit = $0.001 cost
  const usdPerCredit = Number(process.env.MYCLAWGO_USD_PER_CREDIT || '0.001');
  return Math.max(1, Math.ceil(usdCost / usdPerCredit));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || '').trim();

  if (!message) {
    return NextResponse.json(
      { ok: false, error: 'Message is required' },
      { status: 400 }
    );
  }

  if (message.length > 4000) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Message is too long. Keep it under 4000 characters.',
      },
      { status: 400 }
    );
  }

  const authSession = await auth.api.getSession({ headers: await headers() });
  const currentUserId = authSession?.user?.id;

  if (!currentUserId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (currentUserId !== sessionId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Forbidden: session does not belong to current user',
      },
      { status: 403 }
    );
  }

  const runtimeSession = await getSession(sessionId);
  if (!runtimeSession) {
    return NextResponse.json(
      { ok: false, error: 'Session not found' },
      { status: 404 }
    );
  }

  await touchSession(sessionId);

  // Ensure container exists for this user session (covers old users without pre-created runtime)
  const ensured = await ensureUserContainer(runtimeSession);
  if (!ensured.ok) {
    return NextResponse.json(
      { ok: false, error: ensured.error || 'Failed to prepare user runtime' },
      { status: 500 }
    );
  }

  const intent = parseNaturalLanguageIntent(message);
  if (intent.kind !== 'none') {
    const result = await runWhitelistedCommandInContainer(
      runtimeSession,
      intent.command
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    const header =
      intent.kind === 'install-skill'
        ? `✅ Tried installing skill: ${intent.skill}`
        : intent.kind === 'list-skills'
          ? '📦 Skills in your container runtime'
          : '🤖 Agents in your container runtime';

    return NextResponse.json({
      ok: true,
      reply: `${header}\n\n${result.output}`,
      container: runtimeSession.containerName,
      mode: 'container-intent',
    });
  }

  const result = await runOpenClawChatInContainer(runtimeSession, message);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 }
    );
  }

  // Credit deduction only when session owner is authenticated and calling their own bot route
  let creditsLeft: number | null = null;
  let creditsUsed: number | null = null;
  if (currentUserId === sessionId) {
    try {
      const tokens = estimateTokens(message, result.reply);
      const usdCost = estimateUsdCostFromTokens(tokens);
      const used = creditsFromUsd(usdCost);
      await consumeCredits({
        userId: currentUserId,
        amount: used,
        description: `MyClawGo runtime usage: estimated ${tokens} tokens (~$${usdCost.toFixed(4)})`,
      });
      creditsUsed = used;
      creditsLeft = await getUserCredits(currentUserId);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'credit consume failed';
      if (msg.toLowerCase().includes('insufficient')) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Credits are insufficient. Please recharge credits to continue running tasks.',
            code: 'INSUFFICIENT_CREDITS',
          },
          { status: 402 }
        );
      }
      // non-blocking for temporary issues
      console.error('credit deduction warning:', msg);
    }
  }

  return NextResponse.json({
    ok: true,
    reply: result.reply,
    credits: creditsLeft,
    creditsUsed,
    container: runtimeSession.containerName,
    mode: 'openclaw-chat',
  });
}
