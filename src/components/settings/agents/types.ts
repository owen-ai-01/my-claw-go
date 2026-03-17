export type AgentRecord = {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  isDefault?: boolean;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
  };
  telegram?: {
    accountId: string;
    enabled: boolean;
    hasBotToken: boolean;
    name?: string;
    bindingEnabled: boolean;
    webhookUrl?: string;
    webhookPath?: string;
  } | null;
};

export type AgentDetailRecord = AgentRecord & {
  agentsMdPath: string | null;
  agentsMdExists: boolean;
};
