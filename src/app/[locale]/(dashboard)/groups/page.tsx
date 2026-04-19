import { GroupsShell } from '@/components/dashboard/groups/groups-shell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Groups',
  description: 'Manage your AI team groups',
};

export default function GroupsPage() {
  return <GroupsShell />;
}
