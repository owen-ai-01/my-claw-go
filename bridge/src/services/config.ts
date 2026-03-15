import fs from 'node:fs/promises';
import { BridgeError } from '../lib/errors.js';
import { OPENCLAW_CONFIG_PATH } from '../lib/paths.js';

const ALLOWED_CONFIG_PATHS = [
  'agents.list',
  'agents.defaults',
  'gateway.mode',
  'gateway.auth',
  'gateway.controlUi',
  'channels.telegram',
  'bindings',
];

function getByPath(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function setByPath(obj: any, path: string, value: unknown) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[keys[keys.length - 1]!] = value;
}

function assertAllowed(configPath: string) {
  if (!ALLOWED_CONFIG_PATHS.includes(configPath)) {
    throw new BridgeError('CONFIG_PATH_NOT_ALLOWED', `Config path not allowed: ${configPath}`, 403);
  }
}

export async function getConfig(configPath = 'all') {
  const raw = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
  const json = JSON.parse(raw);
  if (configPath === 'all') return json;
  assertAllowed(configPath);
  return getByPath(json, configPath);
}

export async function setConfig(configPath: string, value: unknown) {
  assertAllowed(configPath);
  const raw = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
  const json = JSON.parse(raw);
  setByPath(json, configPath, value);
  await fs.writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(json, null, 2), 'utf8');
  return { path: configPath, updated: true };
}
