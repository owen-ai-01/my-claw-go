const HETZNER_API = 'https://api.hetzner.cloud/v1';

async function hetznerFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${HETZNER_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Hetzner API ${options.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

export interface HetznerCreateServerParams {
  name: string;
  serverType: string;
  location: string;
  imageId?: number;
  imageName?: string;
  firewallId: number;
  sshKeyId: number;
  userData: string;
  labels?: Record<string, string>;
}

export function hetznerClient(token: string) {
  return {
    async createServer(params: HetznerCreateServerParams) {
      const body: Record<string, unknown> = {
        name: params.name,
        server_type: params.serverType,
        location: params.location,
        firewalls: [{ firewall: { id: params.firewallId } }],
        ssh_keys: [{ id: params.sshKeyId }],
        user_data: params.userData,
        labels: params.labels ?? {},
      };
      if (params.imageId) {
        body.image = params.imageId;
      } else {
        body.image = params.imageName ?? 'ubuntu-24.04';
      }
      const data = await hetznerFetch(token, '/servers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return data.server as { id: number; name: string; public_net: { ipv4: { ip: string } } };
    },

    async poweroff(serverId: number) {
      await hetznerFetch(token, `/servers/${serverId}/actions/poweroff`, { method: 'POST' });
    },

    async poweron(serverId: number) {
      await hetznerFetch(token, `/servers/${serverId}/actions/poweron`, { method: 'POST' });
    },

    async deleteServer(serverId: number) {
      await hetznerFetch(token, `/servers/${serverId}`, { method: 'DELETE' });
    },

    async changeType(serverId: number, serverType: string, upgradeDisk = true) {
      await hetznerFetch(token, `/servers/${serverId}/actions/change_type`, {
        method: 'POST',
        body: JSON.stringify({ server_type: serverType, upgrade_disk: upgradeDisk }),
      });
    },
  };
}
