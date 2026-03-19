import fs from 'node:fs/promises';
import { BridgeError } from '../lib/errors.js';
import { OPENCLAW_CONFIG_PATH } from '../lib/paths.js';

type GroupType = 'project' | 'department' | 'temporary';

type Group = {
  id: string;
  name: string;
  description?: string;
  type: GroupType;
  leaderId: string;
  members: string[];
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

async function readConfig(): Promise<OpenClawConfig> {
  const raw = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeConfig(config: OpenClawConfig) {
  await fs.writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

export async function listGroups() {
  const config = await readConfig();
  const groups = config.groups?.list || [];
  return { groups };
}

export async function getGroup(groupId: string) {
  const config = await readConfig();
  const group = config.groups?.list?.find((g) => g.id === groupId);
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
}) {
  const { id, name, description, type, leaderId, members } = params;

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

  const config = await readConfig();
  config.groups = config.groups || {};
  config.groups.list = config.groups.list || [];

  const exists = config.groups.list.some((g) => g.id === id);
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
    members: [...new Set(members)], // 去重
    createdAt: now,
    updatedAt: now,
  };

  config.groups.list.push(newGroup);
  await writeConfig(config);

  return newGroup;
}

export async function updateGroup(groupId: string, patch: {
  name?: string;
  description?: string;
  leaderId?: string;
  members?: string[];
}) {
  const config = await readConfig();
  const groups = config.groups?.list || [];
  const index = groups.findIndex((g) => g.id === groupId);

  if (index < 0) {
    throw new BridgeError('GROUP_NOT_FOUND', `Group not found: ${groupId}`, 404);
  }

  const group = { ...groups[index] };

  if (patch.name !== undefined) {
    if (!patch.name.trim()) {
      throw new BridgeError('INVALID_GROUP_NAME', 'Group name cannot be empty', 400);
    }
    group.name = patch.name.trim();
  }

  if (patch.description !== undefined) {
    group.description = patch.description.trim() || undefined;
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

  group.updatedAt = new Date().toISOString();
  groups[index] = group;
  config.groups = { ...config.groups, list: groups };
  await writeConfig(config);

  return group;
}

export async function deleteGroup(groupId: string) {
  const config = await readConfig();
  const groups = config.groups?.list || [];
  const index = groups.findIndex((g) => g.id === groupId);

  if (index < 0) {
    throw new BridgeError('GROUP_NOT_FOUND', `Group not found: ${groupId}`, 404);
  }

  groups.splice(index, 1);
  config.groups = { ...config.groups, list: groups };
  await writeConfig(config);

  return { deleted: true, groupId };
}
