import fs from 'node:fs/promises';
import { BRIDGE_LOG_PATH, GATEWAY_LOG_PATH } from '../lib/paths.js';

export async function getRecentLogs(source: 'bridge' | 'gateway', lines = 100) {
  const filePath = source === 'bridge' ? BRIDGE_LOG_PATH : GATEWAY_LOG_PATH;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const allLines = raw.split('\n').filter(Boolean);
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}
