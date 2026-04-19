import { consumeCredits, getUserCredits } from '@/credits/credits';
import { auth } from '@/lib/auth';
import {
  creditsFromUsd,
  estimateUsage,
  estimateUsdCostByModel,
} from '@/lib/myclawgo/billing';
import {
  ensureUserContainer,
  runOpenClawChatInContainer,
  runWhitelistedCommandInContainer,
} from '@/lib/myclawgo/docker-manager';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';
import { appendMessage } from '@/lib/myclawgo/user-data';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

// Owner email - receives full error details for debugging
const OWNER_EMAIL =
  process.env.MYCLAWGO_OWNER_EMAIL || 'support@myclawgo.com';

function isOwner(email?: string | null) {
  return email === OWNER_EMAIL;
}

function safeError(rawError: string, ownerEmail?: string | null): string {
  if (isOwner(ownerEmail)) return rawError;
  const msg = String(rawError || '');
  if (
    msg.includes('initializing') ||
    msg.includes('Runtime returned empty response') ||
    msg.includes('Credits are insufficient') ||
    msg.includes('Please retry your message')
  ) {
    return msg;
  }
  return 'Sorry, a server error occurred. Please try again in a moment.';
}

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
    const ownerEmail = authSession?.user?.email;
    return NextResponse.json(
      {
        ok: false,
        error: safeError(
          ensured.error || 'Failed to prepare user runtime',
          ownerEmail
        ),
      },
      { status: 500 }
    );
  }

  const intent = parseNaturalLanguageIntent(message);
  if (intent.kind !== 'none') {
    // Save user message before processing intent
    await appendMessage(sessionId, { role: 'user', text: message }).catch(
      () => {}
    );

    const result = await runWhitelistedCommandInContainer(
      runtimeSession,
      intent.command
    );
    if (!result.ok) {
      const ownerEmail = authSession?.user?.email;
      return NextResponse.json(
        {
          ok: false,
          error: safeError(result.error || 'Command failed', ownerEmail),
        },
        { status: 500 }
      );
    }

    const header =
      intent.kind === 'install-skill'
        ? `✅ Tried installing skill: ${intent.skill}`
        : intent.kind === 'list-skills'
          ? '📦 Skills in your container runtime'
          : '🤖 Agents in your container runtime';

    const intentReply = `${header}\n\n${result.output}`;
    // Save assistant reply
    await appendMessage(sessionId, {
      role: 'assistant',
      text: intentReply,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      reply: intentReply,
      container: runtimeSession.containerName,
      mode: 'container-intent',
    });
  }

  // Save user message first (before agent call, so it's never lost)
  await appendMessage(sessionId, { role: 'user', text: message }).catch(
    () => {}
  );

  const result = await runOpenClawChatInContainer(runtimeSession, message);
  if (!result.ok) {
    const ownerEmail = authSession?.user?.email;
    return NextResponse.json(
      {
        ok: false,
        error: safeError(result.error || 'Runtime error', ownerEmail),
      },
      { status: 500 }
    );
  }

  // Save assistant reply
  await appendMessage(sessionId, {
    role: 'assistant',
    text: result.reply,
    model: result.model,
    tokens: result.usage
      ? {
          input: result.usage.inputTokens,
          output: result.usage.outputTokens,
          total: result.usage.totalTokens,
        }
      : undefined,
  }).catch(() => {});

  // Credit deduction only when session owner is authenticated and calling their own bot route
  let creditsLeft: number | null = null;
  let creditsUsed: number | null = null;
  if (currentUserId === sessionId) {
    try {
      const modelUsed =
        result.model ||
        process.env.MYCLAWGO_RUNTIME_MODEL ||
        'openrouter/minimax/minimax-m2.5';
      const usage = result.usage || estimateUsage(message, result.reply);
      const usdCost = estimateUsdCostByModel({
        model: modelUsed,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      const used = creditsFromUsd(usdCost);
      await consumeCredits({
        userId: currentUserId,
        amount: used,
        description: `MyClawGo runtime usage: model=${modelUsed}, input=${usage.inputTokens}, output=${usage.outputTokens}, total=${usage.totalTokens}, est_cost=$${usdCost.toFixed(6)}`,
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
    model:
      result.model ||
      process.env.MYCLAWGO_RUNTIME_MODEL ||
      'openrouter/minimax/minimax-m2.5',
  });
}
