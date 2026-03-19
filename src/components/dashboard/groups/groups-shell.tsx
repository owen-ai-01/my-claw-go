'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Routes } from '@/routes';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type Group = {
  id: string;
  name: string;
  description?: string;
  type: 'project' | 'department' | 'temporary';
  leaderId: string;
  members: string[];
  createdAt: string;
  updatedAt: string;
};

type AgentItem = {
  id: string;
  name?: string;
  identity?: {
    name?: string;
    emoji?: string;
  };
};

function agentLabel(agent: Partial<AgentItem>) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id || 'Agent';
}

function agentEmoji(agent: Partial<AgentItem>) {
  return agent.identity?.emoji?.trim() || '🤖';
}

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function CreateGroupDrawer({
  open,
  onOpenChange,
  onSuccess,
  agents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  agents: AgentItem[];
}) {
  const [groupId, setGroupId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'project' | 'department' | 'temporary'>('project');
  const [leaderId, setLeaderId] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId.trim() || !name.trim() || !leaderId || selectedMembers.length < 2 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: groupId.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          leaderId,
          members: selectedMembers,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        throw new Error(data?.error?.message || data?.error || 'Failed to create group');
      }

      toast.success(`Group ${name} created successfully`);
      setGroupId('');
      setName('');
      setDescription('');
      setType('project');
      setLeaderId('');
      setSelectedMembers([]);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create group';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 gap-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-base">Create Group</SheetTitle>
          <SheetDescription>Assemble a team of AI agents to work together.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5">
          {error ? (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Group ID *</label>
              <input
                required
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                placeholder="tech-team, sales-squad, etc."
                pattern="[a-zA-Z0-9_-]+"
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Group Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tech Team, Sales Squad, etc."
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this group does..."
                rows={3}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Type *</label>
              <select
                required
                value={type}
                onChange={(e) => setType(e.target.value as Group['type'])}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              >
                <option value="project">Project</option>
                <option value="department">Department</option>
                <option value="temporary">Temporary</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Select Members * (min 2)</label>
              <div className="mt-2 space-y-2">
                {agents.map((agent) => (
                  <label key={agent.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(agent.id)}
                      onChange={() => setSelectedMembers((prev) => toggleValue(prev, agent.id))}
                    />
                    <span className="text-lg">{agentEmoji(agent)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{agentLabel(agent)}</p>
                      <p className="truncate text-xs text-muted-foreground">@{agent.id}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Selected: {selectedMembers.length}</p>
            </div>

            <div>
              <label className="text-sm font-medium">Group Leader *</label>
              <select
                required
                value={leaderId}
                onChange={(e) => setLeaderId(e.target.value)}
                disabled={selectedMembers.length === 0}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              >
                <option value="">Select leader...</option>
                {selectedMembers.map((memberId) => {
                  const agent = agents.find((a) => a.id === memberId);
                  return (
                    <option key={memberId} value={memberId}>
                      {agent ? agentLabel(agent) : memberId}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Must be a selected member</p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!groupId.trim() || !name.trim() || !leaderId || selectedMembers.length < 2 || submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Group'}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function GroupConfigDrawer({
  open,
  onOpenChange,
  group,
  agents,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group | null;
  agents: AgentItem[];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Group['type']>('project');
  const [leaderId, setLeaderId] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !group) return;
    setName(group.name || '');
    setDescription(group.description || '');
    setType(group.type);
    setLeaderId(group.leaderId);
    setSelectedMembers(group.members || []);
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
    setError(null);
  }, [open, group]);

  const availableLeaderIds = useMemo(() => selectedMembers, [selectedMembers]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!group || !name.trim() || !leaderId || selectedMembers.length < 2 || saving) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(group.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          leaderId,
          members: selectedMembers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        throw new Error(data?.error?.message || data?.error || 'Failed to update group');
      }
      toast.success(`Group ${name} updated successfully`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update group';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!group || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(group.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        throw new Error(data?.error?.message || data?.error || 'Failed to delete group');
      }
      toast.success(`Group ${group.name} deleted`);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete group';
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function toggleMember(agentId: string) {
    setSelectedMembers((prev) => {
      const next = toggleValue(prev, agentId);
      if (!next.includes(leaderId)) {
        setLeaderId(next[0] || '');
      }
      return next;
    });
  }

  if (!group) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 gap-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-base">Group Settings</SheetTitle>
          <SheetDescription>Manage members, leader and group profile for @{group.id}.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-5">
          {error ? (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              <div className="font-medium">Group ID</div>
              <div className="mt-1 text-muted-foreground">@{group.id}</div>
            </div>

            <div>
              <label className="text-sm font-medium">Group Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Type *</label>
              <select
                required
                value={type}
                onChange={(e) => setType(e.target.value as Group['type'])}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              >
                <option value="project">Project</option>
                <option value="department">Department</option>
                <option value="temporary">Temporary</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Members * (min 2)</label>
              <div className="mt-2 space-y-2">
                {agents.map((agent) => (
                  <label key={agent.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(agent.id)}
                      onChange={() => toggleMember(agent.id)}
                    />
                    <span className="text-lg">{agentEmoji(agent)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{agentLabel(agent)}</p>
                      <p className="truncate text-xs text-muted-foreground">@{agent.id}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Selected: {selectedMembers.length}</p>
            </div>

            <div>
              <label className="text-sm font-medium">Group Leader *</label>
              <select
                required
                value={leaderId}
                onChange={(e) => setLeaderId(e.target.value)}
                disabled={availableLeaderIds.length === 0}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              >
                <option value="">Select leader...</option>
                {availableLeaderIds.map((memberId) => {
                  const agent = agents.find((a) => a.id === memberId);
                  return (
                    <option key={memberId} value={memberId}>
                      {agent ? agentLabel(agent) : memberId}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Leader must also be a member</p>
            </div>

            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              Created: {new Date(group.createdAt).toLocaleString()}
              <br />
              Updated: {new Date(group.updatedAt).toLocaleString()}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving || deleting}
              className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !leaderId || selectedMembers.length < 2 || saving || deleting}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>

          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="text-sm font-semibold text-red-700">Danger Zone</div>
            <p className="mt-1 text-xs text-red-600">Deleting a group removes its structure. Existing agents remain intact.</p>
            <div className="mt-4 flex gap-3">
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="flex-1 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving || deleting}
                  className="w-full rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  Delete Group
                </button>
              )}
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function GroupCard({
  group,
  agents,
  onManage,
}: {
  group: Group;
  agents: AgentItem[];
  onManage: (group: Group) => void;
}) {
  const router = useRouter();
  const leader = agents.find((a) => a.id === group.leaderId);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{group.name}</h3>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">@{group.id}</p>
          {group.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{group.description}</p>}
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{group.type}</span>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">👥</span>
          <span>{group.members.length} members</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">👑</span>
          <span>Leader: {leader ? agentLabel(leader) : group.leaderId}</span>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => router.push(`${Routes.Chat}?group=${group.id}`)}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          Group Chat
        </button>
        <button
          type="button"
          onClick={() => onManage(group)}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          Manage
        </button>
      </div>
    </div>
  );
}

export function GroupsShell() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [groupsRes, agentsRes] = await Promise.all([
        fetch('/api/groups', { cache: 'no-store' }),
        fetch('/api/agents', { cache: 'no-store' }),
      ]);

      const groupsData = await groupsRes.json().catch(() => ({}));
      const agentsData = await agentsRes.json().catch(() => ({}));

      if (groupsData.ok && groupsData.data?.groups) {
        setGroups(groupsData.data.groups);
        if (selectedGroup) {
          const nextSelected = groupsData.data.groups.find((item: Group) => item.id === selectedGroup.id) || null;
          setSelectedGroup(nextSelected);
        }
      }

      if (agentsData.ok && agentsData.data?.agents) {
        setAgents(agentsData.data.agents);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }

  function openManage(group: Group) {
    setSelectedGroup(group);
    setManageOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assemble AI teams to work together on projects and tasks.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          + Create Group
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <div className="mb-4 text-4xl">👥</div>
          <h3 className="text-lg font-semibold">No groups yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create your first AI team to enable collaborative work.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Create First Group
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} agents={agents} onManage={openManage} />
          ))}
        </div>
      )}

      <CreateGroupDrawer open={createOpen} onOpenChange={setCreateOpen} onSuccess={loadData} agents={agents} />
      <GroupConfigDrawer
        open={manageOpen}
        onOpenChange={setManageOpen}
        group={selectedGroup}
        agents={agents}
        onSaved={loadData}
        onDeleted={() => {
          setSelectedGroup(null);
          loadData();
        }}
      />
    </div>
  );
}
