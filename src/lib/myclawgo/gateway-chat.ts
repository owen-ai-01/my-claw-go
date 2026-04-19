import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureUserContainer } from '@/lib/myclawgo/docker-manager';
import { getSession } from '@/lib/myclawgo/session-store';

const execFileAsync = promisify(execFile);
const MAIN_SESSION_KEY = 'agent:main:main';

async function dockerExecJson(
  containerName: string,
  method: string,
  params: Record<string, unknown>
) {
  const payload = JSON.stringify(params).replace(/"/g, '\\"');
  const cmd = `su - openclaw -c "openclaw gateway call ${method} --params \"${payload}\" --json"`;
  const { stdout } = await execFileAsync(
    'sg',
    [
      'docker',
      '-c',
      `docker exec ${containerName} sh -lc '${cmd.replace(/'/g, `'\\''`)}'`,
    ],
    { maxBuffer: 2 * 1024 * 1024 }
  );
  return JSON.parse(stdout) as Record<string, any>;
}

function flattenMessageText(message: any) {
  const content = Array.isArray(message?.content) ? message.content : [];
  return content
    .filter(
      (part: any) => part?.type === 'text' && typeof part?.text === 'string'
    )
    .map((part: any) => part.text)
    .join('\n\n')
    .trim();
}

export async function loadGatewayChatHistory(userId: string) {
  const session = await getSession(userId);
  if (!session) {
    return [];
  }
  const ensured = await ensureUserContainer(session);
  if (!ensured.ok) {
    throw new Error(ensured.error || 'Failed to ensure user container');
  }
  const res = await dockerExecJson(session.containerName, 'chat.history', {
    sessionKey: MAIN_SESSION_KEY,
    limit: 100,
  });
  const rawMessages = Array.isArray(res?.messages) ? res.messages : [];
  return rawMessages
    .map((msg: any, idx: number) => ({
      id: `${msg?.timestamp || Date.now()}-${idx}`,
      role: msg?.role === 'user' ? 'user' : 'assistant',
      text: flattenMessageText(msg),
      timestamp:
        typeof msg?.timestamp === 'number'
          ? new Date(msg.timestamp).toISOString()
          : undefined,
    }))
    .filter((msg: any) => msg.text);
}

export async function sendGatewayChatMessage(userId: string, message: string) {
  const session = await getSession(userId);
  if (!session) {
    throw new Error('Runtime session not found');
  }
  const ensured = await ensureUserContainer(session);
  if (!ensured.ok) {
    throw new Error(ensured.error || 'Failed to ensure user container');
  }

  const before = await dockerExecJson(session.containerName, 'chat.history', {
    sessionKey: MAIN_SESSION_KEY,
    limit: 20,
  });
  const beforeMessages = Array.isArray(before?.messages) ? before.messages : [];
  const beforeAssistantCount = beforeMessages.filter(
    (msg: any) => msg?.role === 'assistant'
  ).length;

  await dockerExecJson(session.containerName, 'chat.send', {
    sessionKey: MAIN_SESSION_KEY,
    message,
    deliver: false,
    timeoutMs: 90000,
    thinking: 'off',
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 95_000) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const history = await dockerExecJson(
      session.containerName,
      'chat.history',
      {
        sessionKey: MAIN_SESSION_KEY,
        limit: 20,
      }
    );
    const messages = Array.isArray(history?.messages) ? history.messages : [];
    const assistantMessages = messages.filter(
      (msg: any) => msg?.role === 'assistant'
    );
    if (assistantMessages.length > beforeAssistantCount) {
      const latest = assistantMessages[assistantMessages.length - 1];
      const text = flattenMessageText(latest);
      if (text) {
        return {
          reply: text,
          sessionKey: history?.sessionKey || MAIN_SESSION_KEY,
          messages,
        };
      }
    }
  }

  throw new Error('Gateway chat timed out waiting for assistant reply');
}
