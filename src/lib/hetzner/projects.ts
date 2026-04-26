export interface HetznerProjectConfig {
  id: string;
  name: string;
  apiToken: string;
  region: string;
  maxServers: number;
  sshKeyId: number;
  firewallId: number;
  snapshotId: number | null;
}

function parseNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid HETZNER_PROJECTS ${field}`);
  }
  return n;
}

function normalizeProject(raw: Record<string, unknown>): HetznerProjectConfig {
  const id = String(raw.id ?? '').trim();
  const name = String(raw.name ?? '').trim();
  const apiToken = String(raw.apiToken ?? '').trim();
  const region = String(raw.region ?? 'fsn1').trim();

  if (!id) throw new Error('Invalid HETZNER_PROJECTS id');
  if (!name) throw new Error(`Invalid HETZNER_PROJECTS name for ${id}`);
  if (!apiToken) throw new Error(`Invalid HETZNER_PROJECTS apiToken for ${id}`);
  if (!region) throw new Error(`Invalid HETZNER_PROJECTS region for ${id}`);

  return {
    id,
    name,
    apiToken,
    region,
    maxServers:
      raw.maxServers === undefined
        ? 90
        : parseNumber(raw.maxServers, `maxServers for ${id}`),
    sshKeyId: parseNumber(raw.sshKeyId, `sshKeyId for ${id}`),
    firewallId: parseNumber(raw.firewallId, `firewallId for ${id}`),
    snapshotId:
      raw.snapshotId === null || raw.snapshotId === undefined
        ? null
        : parseNumber(raw.snapshotId, `snapshotId for ${id}`),
  };
}

export function getHetznerProjects(): HetznerProjectConfig[] {
  const raw = process.env.HETZNER_PROJECTS;
  if (!raw) throw new Error('HETZNER_PROJECTS not set');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid HETZNER_PROJECTS JSON: ${String(err)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('HETZNER_PROJECTS must be a JSON array');
  }

  const projects = parsed.map((item) =>
    normalizeProject(item as Record<string, unknown>)
  );
  if (projects.length === 0) {
    throw new Error('HETZNER_PROJECTS must contain at least one project');
  }

  return projects;
}

export function getHetznerProjectById(projectId: string) {
  return getHetznerProjects().find((project) => project.id === projectId);
}
