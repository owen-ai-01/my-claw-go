import { AgentDetails } from '@/components/settings/agents/agent-details';

export default async function AgentDetailsPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <AgentDetails agentId={agentId} />;
}
