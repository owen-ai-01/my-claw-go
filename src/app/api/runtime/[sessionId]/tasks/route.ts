import { consumeCredits, getUserCredits } from '@/credits/credits';
import { auth } from '@/lib/auth';
import {
  creditsFromUsd,
  estimateUsage,
  estimateUsdCostByModel,
} from '@/lib/myclawgo/billing';
import { createRuntimeTask } from '@/lib/myclawgo/runtime-task-queue';
import { isSafeCommandInput } from '@/lib/myclawgo/command-policy';
import {
  ensureUserContainer,
  runOpenClawChatInContainer,
  runWhitelistedCommandInContainer,
} from '@/lib/myclawgo/docker-manager';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';
import { appendMessage } from '@/lib/myclawgo/user-data';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const OWNER_EMAIL =
  process.env.MYCLAWGO_OWNER_EMAIL || 'ouyanghuiping@gmail.com';

function isOwner(email?: string | null) {
  return email === OWNER_EMAIL;
}

function safeError(rawError: string, ownerEmail?: string | null): string {
  if (isOwner(ownerEmail)) return rawError;
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

async function runTaskMessage(
  sessionId: string,
  message: string,
  currentUserId: string,
  ownerEmail?: string | null,
  isCommand?: boolean
) {
  const runtimeSession = await getSession(sessionId);
  if (!runtimeSession) throw new Error('Session not found');

  await touchSession(sessionId);

  const ensured = await ensureUserContainer(runtimeSession);
  if (!ensured.ok) {
    throw new Error(
      safeError(ensured.error || 'Failed to prepare user runtime', ownerEmail)
    );
  }


  if (isCommand) {
    if (!isSafeCommandInput(message)) {
      throw new Error('Command is not allowed.');
    }
    const cmdResult = await runWhitelistedCommandInContainer(runtimeSession, message);
    if (!cmdResult.ok) {
      throw new Error(safeError(cmdResult.error || 'Command failed', ownerEmail));
    }
    const cmdReply = `🛠️ [${runtimeSession.containerName}]
${cmdResult.output || '(no output)'}`;
    await appendMessage(sessionId, {
      role: 'assistant',
      text: cmdReply,
    }).catch(() => {});
    return { reply: cmdReply };
  }

  const intent = parseNaturalLanguageIntent(message);
  if (intent.kind !== 'none') {
    const result = await runWhitelistedCommandInContainer(
      runtimeSession,
      intent.command
    );
    if (!result.ok) {
      throw new Error(safeError(result.error || 'Command failed', ownerEmail));
    }

    const header =
      intent.kind === 'install-skill'
        ? `✅ Tried installing skill: ${intent.skill}`
        : intent.kind === 'list-skills'
          ? '📦 Skills in your container runtime'
          : '🤖 Agents in your container runtime';

    const intentReply = `${header}\n\n${result.output}`;
    await appendMessage(sessionId, {
      role: 'assistant',
      text: intentReply,
    }).catch(() => {});

    return { reply: intentReply };
  }

  const result = await runOpenClawChatInContainer(runtimeSession, message);
  if (!result.ok) {
    throw new Error(safeError(result.error || 'Runtime error', ownerEmail));
  }

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
    await getUserCredits(currentUserId).catch(() => null);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'credit consume failed';
    if (msg.toLowerCase().includes('insufficient')) {
      throw new Error('Credits are insufficient. Please recharge credits.');
    }
  }

  return { reply: result.reply };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || '').trim();
  const isCommand = Boolean(body?.isCommand);

  if (!message) {
    return NextResponse.json(
      { ok: false, error: 'Message is required' },
      { status: 400 }
    );
  }

  const authSession = await auth.api.getSession({ headers: await headers() });
  const currentUserId = authSession?.user?.id;
  if (!currentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (currentUserId !== sessionId) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden: session does not belong to current user' },
      { status: 403 }
    );
  }

  await appendMessage(sessionId, { role: 'user', text: message }).catch(() => {});

  const task = await createRuntimeTask(sessionId, message, isCommand, () =>
    runTaskMessage(sessionId, message, currentUserId, authSession?.user?.email, isCommand)
  );

  return NextResponse.json({
    ok: true,
    taskId: task.id,
    status: task.status,
  });
}
