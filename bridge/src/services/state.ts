import fs from 'node:fs/promises';
import { BRIDGE_STATE_PATH } from '../lib/paths.js';

type BridgeState = {
  defaultAgentId: string;
};

export async function getBridgeState(): Promise<BridgeState> {
  try {
    const raw = await fs.readFile(BRIDGE_STATE_PATH, 'utf8');
    return JSON.parse(raw) as BridgeState;
  } catch {
    return { defaultAgentId: 'main' };
  }
}

export async function setDefaultAgentId(agentId: string) {
  const state = await getBridgeState();
  state.defaultAgentId = agentId;
  await fs.writeFile(BRIDGE_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  return state;
}
