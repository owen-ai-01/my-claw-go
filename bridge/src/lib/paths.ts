import path from 'node:path';

export const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/home/openclaw/.openclaw';
export const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_HOME, 'openclaw.json');
export const BRIDGE_STATE_PATH = path.join(OPENCLAW_HOME, 'bridge-state.json');
export const GATEWAY_LOG_PATH = path.join(OPENCLAW_HOME, 'gateway.log');
export const BRIDGE_LOG_PATH = path.join(OPENCLAW_HOME, 'bridge.log');
