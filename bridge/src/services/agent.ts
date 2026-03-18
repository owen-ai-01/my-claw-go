import fs from 'node:fs/promises';
import path from 'node:path';
import { BridgeError } from '../lib/errors.js';
import { OPENCLAW_CONFIG_PATH } from '../lib/paths.js';
import { getBridgeState } from './state.js';

type AgentIdentity = {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
};

type TelegramAccount = {
  enabled?: boolean;
  botToken?: string;
  name?: string;
  webhookUrl?: string;
  webhookPath?: string;
  dmPolicy?: string;
  allowFrom?: string[];
  groupPolicy?: string;
  groupAllowFrom?: string[];
  streaming?: string;
};

type UpdateTelegramPatch = {
  enabled?: boolean;
  botToken?: string;
  bindingEnabled?: boolean;
};

type AgentConfigEntry = {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  default?: boolean;
  identity?: AgentIdentity;
};

type OpenClawConfig = {
  agents?: {
    list?: AgentConfigEntry[];
  };
  channels?: {
    telegram?: {
      enabled?: boolean;
      dmPolicy?: string;
      allowFrom?: string[];
      groupPolicy?: string;
      groupAllowFrom?: string[];
      streaming?: string;
      accounts?: Record<string, TelegramAccount>;
    };
  };
  bindings?: Array<{
    agentId?: string;
    match?: {
      channel?: string;
      accountId?: string;
    };
  }>;
};

export type AgentListItem = {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  isDefault: boolean;
  identity?: AgentIdentity;
  telegram?: {
    accountId: string;
    enabled: boolean;
    hasBotToken: boolean;
    name?: string;
    bindingEnabled: boolean;
    webhookUrl?: string;
    webhookPath?: string;
  } | null;
};

export type AgentDetail = AgentListItem & {
  agentsMdPath: string | null;
  agentsMdExists: boolean;
};

async function readConfig() {
  const raw = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as OpenClawConfig;
}

async function writeConfig(config: OpenClawConfig) {
  await fs.writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toAgentListItem(config: OpenClawConfig, defaultAgentId: string | undefined, agent: AgentConfigEntry): AgentListItem {
  const accountId = agent.id;
  const telegramAccount = config.channels?.telegram?.accounts?.[accountId];
  const bindingEnabled = !!config.bindings?.some((binding) => binding.agentId === agent.id && binding.match?.channel === 'telegram' && binding.match?.accountId === accountId);

  return {
    id: agent.id,
    name: agent.name || agent.identity?.name || agent.id,
    workspace: agent.workspace,
    agentDir: agent.agentDir,
    model: agent.model,
    isDefault: agent.default === true || agent.id === defaultAgentId,
    identity: agent.identity,
    telegram: telegramAccount
      ? {
          accountId,
          enabled: telegramAccount.enabled !== false,
          hasBotToken: !!telegramAccount.botToken,
          name: telegramAccount.name,
          bindingEnabled,
          webhookUrl: telegramAccount.webhookUrl,
          webhookPath: telegramAccount.webhookPath,
        }
      : null,
  };
}

export async function listAgents() {
  const config = await readConfig();
  const state = await getBridgeState();
  const agents = (config?.agents?.list || []).map((agent) => toAgentListItem(config, state.defaultAgentId, agent));
  return {
    defaultAgentId: state.defaultAgentId,
    agents,
  };
}

export async function ensureAgentExists(agentId: string) {
  const agents = await listAgents();
  const found = agents.agents.find((agent) => agent.id === agentId);
  if (!found) {
    throw new BridgeError('AGENT_NOT_FOUND', `Agent not found: ${agentId}`, 404);
  }
  return found;
}

export async function getAgent(agentId: string): Promise<AgentDetail> {
  const config = await readConfig();
  const state = await getBridgeState();
  const found = config?.agents?.list?.find((agent) => agent.id === agentId);
  if (!found) {
    throw new BridgeError('AGENT_NOT_FOUND', `Agent not found: ${agentId}`, 404);
  }

  const detail = toAgentListItem(config, state.defaultAgentId, found);
  const agentsMdPath = found.workspace ? path.join(found.workspace, 'AGENTS.md') : null;
  const agentsMdExists = agentsMdPath ? await pathExists(agentsMdPath) : false;
  return {
    ...detail,
    agentsMdPath,
    agentsMdExists,
  };
}

export async function getAgentMarkdown(agentId: string) {
  const agent = await getAgent(agentId);
  if (!agent.agentsMdPath) {
    throw new BridgeError('AGENTS_MD_NOT_FOUND', `AGENTS.md path not configured for agent: ${agentId}`, 404);
  }

  if (!agent.agentsMdExists) {
    throw new BridgeError('AGENTS_MD_NOT_FOUND', `AGENTS.md not found for agent: ${agentId}`, 404);
  }

  const content = await fs.readFile(agent.agentsMdPath, 'utf8');
  return {
    agentId,
    path: agent.agentsMdPath,
    content,
  };
}

export async function updateAgentMarkdown(agentId: string, content: string) {
  const agent = await getAgent(agentId);
  if (!agent.agentsMdPath) {
    throw new BridgeError('AGENTS_MD_NOT_FOUND', `AGENTS.md path not configured for agent: ${agentId}`, 404);
  }

  await fs.mkdir(path.dirname(agent.agentsMdPath), { recursive: true });
  await fs.writeFile(agent.agentsMdPath, content, 'utf8');
  return {
    agentId,
    path: agent.agentsMdPath,
    updated: true,
  };
}

export async function updateAgent(agentId: string, patch: { model?: string }) {
  const config = await readConfig();
  const agents = config.agents?.list || [];
  const index = agents.findIndex((agent) => agent.id === agentId);
  if (index < 0) {
    throw new BridgeError('AGENT_NOT_FOUND', `Agent not found: ${agentId}`, 404);
  }

  const next = { ...agents[index] };
  if (typeof patch.model === 'string') {
    const trimmed = patch.model.trim();
    if (!trimmed) {
      delete next.model;
    } else {
      next.model = trimmed;
    }
  }

  agents[index] = next;
  config.agents = {
    ...(config.agents || {}),
    list: agents,
  };
  await writeConfig(config);
  return getAgent(agentId);
}

export async function updateAgentTelegram(agentId: string, patch: UpdateTelegramPatch) {
  const config = await readConfig();
  const agent = config.agents?.list?.find((entry) => entry.id === agentId);
  if (!agent) {
    throw new BridgeError('AGENT_NOT_FOUND', `Agent not found: ${agentId}`, 404);
  }

  config.channels = config.channels || {};
  config.channels.telegram = config.channels.telegram || {};
  config.channels.telegram.accounts = config.channels.telegram.accounts || {};

  const currentAccount = config.channels.telegram.accounts[agentId] || {};
  const nextAccount: TelegramAccount = { ...currentAccount };

  if (typeof patch.enabled === 'boolean') {
    nextAccount.enabled = patch.enabled;
  }
  if (typeof patch.botToken === 'string') {
    const trimmed = patch.botToken.trim();
    if (!trimmed) {
      delete nextAccount.botToken;
    } else {
      nextAccount.botToken = trimmed;
    }
  }

  if (Object.keys(nextAccount).length === 0 || (!nextAccount.botToken && nextAccount.enabled === false)) {
    delete config.channels.telegram.accounts[agentId];
  } else {
    // OpenClaw 2026.3.13+ requires dmPolicy + allowFrom
    nextAccount.dmPolicy = nextAccount.dmPolicy || 'open';
    nextAccount.allowFrom = nextAccount.allowFrom || ['*'];
    nextAccount.groupPolicy = nextAccount.groupPolicy || 'disabled';
    nextAccount.streaming = nextAccount.streaming || 'partial';
    
    config.channels.telegram.accounts[agentId] = nextAccount;
  }
  
  // Ensure top-level telegram also has required fields
  if (config.channels.telegram.enabled !== false) {
    config.channels.telegram.dmPolicy = config.channels.telegram.dmPolicy || 'open';
    config.channels.telegram.allowFrom = config.channels.telegram.allowFrom || ['*'];
    config.channels.telegram.groupPolicy = config.channels.telegram.groupPolicy || 'disabled';
    config.channels.telegram.streaming = config.channels.telegram.streaming || 'partial';
  }

  const bindings = [...(config.bindings || [])];
  const bindingIndex = bindings.findIndex((binding) => binding.agentId === agentId && binding.match?.channel === 'telegram' && binding.match?.accountId === agentId);

  if (patch.bindingEnabled === true) {
    if (bindingIndex < 0) {
      bindings.push({
        agentId,
        match: {
          channel: 'telegram',
          accountId: agentId,
        },
      });
    }
  } else if (patch.bindingEnabled === false) {
    if (bindingIndex >= 0) {
      bindings.splice(bindingIndex, 1);
    }
  }

  config.bindings = bindings;
  await writeConfig(config);
  return getAgent(agentId);
}
