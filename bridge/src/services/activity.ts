import fs from 'node:fs/promises';
import { BRIDGE_ACTIVITY_PATH } from '../lib/paths.js';

export type ActivityEvent = {
  at: number;
  agentId: string;
  kind: 'chat' | 'tool' | 'file' | 'cmd' | 'task' | 'status';
  action: string;
  detail?: string;
  runId?: string;
  model?: string;
};

export async function appendActivity(event: ActivityEvent) {
  try {
    await fs.appendFile(BRIDGE_ACTIVITY_PATH, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // ignore activity write errors
  }
}

export async function listRecentActivity(limit = 120): Promise<ActivityEvent[]> {
  try {
    const raw = await fs.readFile(BRIDGE_ACTIVITY_PATH, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const recent = lines.slice(-Math.min(Math.max(limit, 10), 500));
    const items = recent
      .map((line) => {
        try {
          return JSON.parse(line) as ActivityEvent;
        } catch {
          return null;
        }
      })
      .filter((v): v is ActivityEvent => !!v)
      .sort((a, b) => b.at - a.at);
    return items;
  } catch {
    return [];
  }
}
