import fs from 'node:fs/promises';
import path from 'node:path';
import { BridgeError } from '../lib/errors.js';
import { OPENCLAW_CONFIG_PATH, OPENCLAW_HOME } from '../lib/paths.js';

type GroupType = 'project' | 'department' | 'temporary';

type Group = {
  id: string;
  name: string;
  description?: string;
  type: GroupType;
  leaderId: string;
  members: string[];
  relay?: {
    enabled?: boolean;
    maxTurns?: number; // max auto-handoff turns after leader response
    cooldownMs?: number; // delay between handoff turns
  };
  channels?: {
    telegram?: {
      groupId?: string;
      enabled: boolean;
    };
  };
  createdAt: string;
  updatedAt: string;
};

type OpenClawConfig = {
  groups?: {
    list?: Group[];
  };
  [key: string]: unknown;
};

type GroupStore = {
  version: 1;
  groups: Group[];
};

const GROUPS_STORE_PATH = path.join(OPENCLAW_HOME, 'myclawgo-groups.json');

async function readConfig(): Promise<OpenClawConfig> {
  const raw = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeConfig(config: OpenClawConfig) {
  await fs.writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

async function readGroupStore(): Promise<GroupStore> {
  try {
    const raw = await fs.readFile(GROUPS_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GroupStore>;
    return {
      version: 1,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { version: 1, groups: [] };
    }
    throw error;
  }
}

async function writeGroupStore(store: GroupStore) {
  await fs.writeFile(GROUPS_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

async function ensureGroupStore() {
  const config = await readConfig();
  const configGroups = config.groups?.list || [];
  const store = await readGroupStore();

  if (configGroups.length > 0 && store.groups.length === 0) {
    await writeGroupStore({ version: 1, groups: configGroups });
  }

  if (config.groups !== undefined) {
    delete config.groups;
    await writeConfig(config);
  }

  return readGroupStore();
}

export async function listGroups() {
  const store = await ensureGroupStore();
  return { groups: store.groups };
}

export async function getGroup(groupId: string) {
  const store = await ensureGroupStore();
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) {
    throw new BridgeError('GROUP_NOT_FOUND', `Group not found: ${groupId}`, 404);
  }
  return group;
}

export async function createGroup(params: {
  id: string;
  name: string;
  description?: string;
  type: GroupType;
  leaderId: string;
  members: string[];
  relay?: {
    enabled?: boolean;
    maxTurns?: number;
    cooldownMs?: number;
  };
}) {
  const { id, name, description, type, leaderId, members, relay } = params;

  if (!id || !/^[a-z0-9_-]+$/i.test(id)) {
    throw new BridgeError('INVALID_GROUP_ID', 'Group ID must be alphanumeric with hyphens/underscores', 400);
  }

  if (!name?.trim()) {
    throw new BridgeError('INVALID_GROUP_NAME', 'Group name is required', 400);
  }

  if (!leaderId || !members.includes(leaderId)) {
    throw new BridgeError('INVALID_LEADER', 'Leader must be a member of the group', 400);
  }

  if (!members || members.length < 2) {
    throw new BridgeError('INVALID_MEMBERS', 'Group must have at least 2 members', 400);
  }

  const store = await ensureGroupStore();
  const exists = store.groups.some((g) => g.id === id);
  if (exists) {
    throw new BridgeError('GROUP_EXISTS', `Group ${id} already exists`, 409);
  }

  const now = new Date().toISOString();
  const newGroup: Group = {
    id,
    name: name.trim(),
    description: description?.trim(),
    type,
    leaderId,
    members: [...new Set(members)],
    relay: {
      enabled: relay?.enabled ?? true,
      maxTurns: Math.min(Math.max(Number(relay?.maxTurns || 6), 1), 20),
      cooldownMs: Math.min(Math.max(Number(relay?.cooldownMs || 900), 0), 10_000),
    },
    createdAt: now,
    updatedAt: now,
  };

  store.groups.push(newGroup);
  await writeGroupStore(store);

  return newGroup;
}

export async function updateGroup(groupId: string, patch: {
  name?: string;
  description?: string;
  type?: GroupType;
  leaderId?: string;
  members?: string[];
  relay?: {
    enabled?: boolean;
    maxTurns?: number;
    cooldownMs?: number;
  };
}) {
  const store = await ensureGroupStore();
  const index = store.groups.findIndex((g) => g.id === groupId);

  if (index < 0) {
    throw new BridgeError('GROUP_NOT_FOUND', `Group not found: ${groupId}`, 404);
  }

  const group = { ...store.groups[index] };

  if (patch.name !== undefined) {
    if (!patch.name.trim()) {
      throw new BridgeError('INVALID_GROUP_NAME', 'Group name cannot be empty', 400);
    }
    group.name = patch.name.trim();
  }

  if (patch.description !== undefined) {
    group.description = patch.description.trim() || undefined;
  }

  if (patch.type !== undefined) {
    group.type = patch.type;
  }

  if (patch.members !== undefined) {
    if (patch.members.length < 2) {
      throw new BridgeError('INVALID_MEMBERS', 'Group must have at least 2 members', 400);
    }
    group.members = [...new Set(patch.members)];
  }

  if (patch.leaderId !== undefined) {
    if (!group.members.includes(patch.leaderId)) {
      throw new BridgeError('INVALID_LEADER', 'Leader must be a member of the group', 400);
    }
    group.leaderId = patch.leaderId;
  }

  if (patch.relay !== undefined) {
    const prev = group.relay || {};
    group.relay = {
      enabled: patch.relay.enabled ?? prev.enabled ?? true,
      maxTurns: patch.relay.maxTurns !== undefined
        ? Math.min(Math.max(Number(patch.relay.maxTurns), 1), 20)
        : (prev.maxTurns ?? 6),
      cooldownMs: patch.relay.cooldownMs !== undefined
        ? Math.min(Math.max(Number(patch.relay.cooldownMs), 0), 10_000)
        : (prev.cooldownMs ?? 900),
    };
  }

  group.updatedAt = new Date().toISOString();
  store.groups[index] = group;
  await writeGroupStore(store);

  return group;
}

export async function deleteGroup(groupId: string) {
  const store = await ensureGroupStore();
  const index = store.groups.findIndex((g) => g.id === groupId);

  if (index < 0) {
    throw new BridgeError('GROUP_NOT_FOUND', `Group not found: ${groupId}`, 404);
  }

  store.groups.splice(index, 1);
  await writeGroupStore(store);

  return { deleted: true, groupId };
}
