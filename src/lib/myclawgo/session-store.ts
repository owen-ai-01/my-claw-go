import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type UserSession = {
  id: string;
  initialPrompt: string;
  credits: number;
  containerName: string;
  userDataDir: string;
  createdAt: string;
  lastActiveAt: string;
};

const CONTAINER_PREFIX = process.env.MYCLAWGO_CONTAINER_PREFIX || 'myclawgo';

const BASE_DIR =
  process.env.MYCLAWGO_DATA_DIR ||
  '/home/openclaw/project/my-claw-go/.runtime-data';
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');

async function ensureBase() {
  await fs.mkdir(BASE_DIR, { recursive: true });
}

async function readAll(): Promise<Record<string, UserSession>> {
  await ensureBase();
  try {
    const raw = await fs.readFile(SESSIONS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, UserSession>) {
  await ensureBase();
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(data, null, 2));
}

export function createSessionId() {
  return crypto.randomBytes(6).toString('hex');
}

export async function createSession(initialPrompt: string) {
  const sessions = await readAll();
  const id = createSessionId();
  const userDataDir = path.join(BASE_DIR, 'users', id);
  const now = new Date().toISOString();
  const session: UserSession = {
    id,
    initialPrompt,
    credits: 100,
    containerName: `${CONTAINER_PREFIX}-${id}`,
    userDataDir,
    createdAt: now,
    lastActiveAt: now,
  };
  sessions[id] = session;
  await fs.mkdir(userDataDir, { recursive: true });
  await writeAll(sessions);
  return session;
}

export async function ensureSessionById(
  id: string,
  initialPrompt = 'user-start'
) {
  const sessions = await readAll();
  if (sessions[id]) {
    sessions[id].lastActiveAt = new Date().toISOString();
    await writeAll(sessions);
    return sessions[id];
  }

  const userDataDir = path.join(BASE_DIR, 'users', id);
  const now = new Date().toISOString();
  const session: UserSession = {
    id,
    initialPrompt,
    credits: 0,
    containerName: `${CONTAINER_PREFIX}-${id}`,
    userDataDir,
    createdAt: now,
    lastActiveAt: now,
  };
  sessions[id] = session;
  await fs.mkdir(userDataDir, { recursive: true });
  await writeAll(sessions);
  return session;
}

export async function getSession(id: string) {
  const sessions = await readAll();
  return sessions[id] || null;
}

export async function touchSession(id: string) {
  const sessions = await readAll();
  if (!sessions[id]) return null;
  sessions[id].lastActiveAt = new Date().toISOString();
  await writeAll(sessions);
  return sessions[id];
}
