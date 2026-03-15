import fs from 'node:fs/promises';
import { BridgeError } from '../lib/errors.js';
import { OPENCLAW_CONFIG_PATH } from '../lib/paths.js';
import { getBridgeState } from './state.js';

export async function listAgents() {
  const raw = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
  const json = JSON.parse(raw) as { agents?: { list?: Array<{ id: string; workspace?: string }> } };
  const state = await getBridgeState();
  return {
    defaultAgentId: state.defaultAgentId,
    agents: json?.agents?.list || [],
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
