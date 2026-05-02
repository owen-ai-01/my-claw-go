import { randomUUID } from 'node:crypto';

export type AgentDocEvent = {
  type: 'agent_doc';
  agentId: string;
  docKey: string;
  content: string;
};

export type GroupUpsertEvent = {
  type: 'group_upsert';
  group: {
    id: string;
    name: string;
    description?: string;
    leaderId: string;
    members: string[];
    relay?: { enabled?: boolean; maxTurns?: number; cooldownMs?: number };
    channels?: unknown;
    createdAt: string;
    updatedAt: string;
  };
};

export type GroupDeleteEvent = {
  type: 'group_delete';
  groupId: string;
};

export type ChatMessageEvent = {
  type: 'chat_message';
  messageId: string;
  role: 'user' | 'assistant';
  agentId: string;
  content: string;
  groupId?: string;
  channel: string;
  chatScope: string;
  routedAgentId?: string;
  meta?: Record<string, unknown>;
};

export type SyncEvent = AgentDocEvent | GroupUpsertEvent | GroupDeleteEvent | ChatMessageEvent;

export function syncToPg(event: SyncEvent): void {
  const appUrl = process.env.MYCLAWGO_APP_URL;
  const token = process.env.BRIDGE_TOKEN;
  if (!appUrl || !token) return;

  const body: SyncEvent =
    event.type === 'chat_message'
      ? { ...event, messageId: event.messageId || randomUUID() }
      : event;

  fetch(`${appUrl}/api/internal/bridge-sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}
