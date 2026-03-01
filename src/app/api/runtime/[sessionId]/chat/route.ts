import { NextResponse } from 'next/server';
import { getSession, touchSession } from '@/lib/myclawgo/session-store';
import {
  runOpenClawChatInContainer,
  runWhitelistedCommandInContainer,
} from '@/lib/myclawgo/docker-manager';

type Intent =
  | { kind: 'install-skill'; command: string; skill: string }
  | { kind: 'list-skills'; command: string }
  | { kind: 'list-agents'; command: string }
  | { kind: 'none' };

function parseNaturalLanguageIntent(message: string): Intent {
  const text = message.trim();

  if (!text) return { kind: 'none' };

  // Examples:
  // - 安装一下gog这个skill
  // - install skill gog
  // - 安装 skill: add-agent
  const installCn = text.match(/安装(?:一下)?\s*([a-zA-Z0-9-_]+)\s*(?:这个)?\s*skill/i);
  const installEn = text.match(/install\s+(?:the\s+)?skill\s+([a-zA-Z0-9-_]+)/i);
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
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || '').trim();

  if (!message) {
    return NextResponse.json({ ok: false, error: 'Message is required' }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  await touchSession(sessionId);

  // Natural-language-to-container-action bridge
  const intent = parseNaturalLanguageIntent(message);
  if (intent.kind !== 'none') {
    const result = await runWhitelistedCommandInContainer(session, intent.command);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
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
      credits: session.credits,
      container: session.containerName,
      mode: 'container-intent',
    });
  }

  const result = await runOpenClawChatInContainer(session, message);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    reply: result.reply,
    credits: session.credits,
    container: session.containerName,
    mode: 'openclaw-chat',
  });
}
