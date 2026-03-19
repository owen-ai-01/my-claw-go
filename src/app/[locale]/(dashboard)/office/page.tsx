import { Metadata } from 'next';
import { OfficeShell } from '@/components/dashboard/office/office-shell';

export const metadata: Metadata = {
  title: 'Office',
  description: 'Your AI team at a glance',
};

export default function OfficePage() {
  return <OfficeShell />;
}
