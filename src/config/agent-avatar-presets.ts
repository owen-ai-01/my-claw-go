export type AgentAvatarPreset = {
  id: string;
  label: string;
  roleHint?: string;
  gender?: 'male' | 'female' | 'neutral';
  ageGroup?: 'young' | 'middle' | 'senior';
  image: string;
  emoji?: string;
};

export const AGENT_AVATAR_PRESETS: AgentAvatarPreset[] = [
  { id: 'robot-main', label: 'Main Robot', roleHint: 'main', gender: 'neutral', ageGroup: 'middle', image: '/avatars/agents/robot-main.svg', emoji: '🤖' },
  { id: 'pm-young-female', label: 'PM (Young, Female)', roleHint: 'product manager', gender: 'female', ageGroup: 'young', image: '/avatars/agents/pm-young-female.svg', emoji: '🧑‍💼' },
  { id: 'pm-senior-male', label: 'PM (Senior, Male)', roleHint: 'product manager', gender: 'male', ageGroup: 'senior', image: '/avatars/agents/pm-senior-male.svg', emoji: '👨‍💼' },
  { id: 'designer-young-female', label: 'Designer (Young, Female)', roleHint: 'designer', gender: 'female', ageGroup: 'young', image: '/avatars/agents/designer-young-female.svg', emoji: '👩‍🎨' },
  { id: 'designer-senior-male', label: 'Designer (Senior, Male)', roleHint: 'designer', gender: 'male', ageGroup: 'senior', image: '/avatars/agents/designer-senior-male.svg', emoji: '🧑‍🎨' },
  { id: 'dev-young-male', label: 'Developer (Young, Male)', roleHint: 'tech developer', gender: 'male', ageGroup: 'young', image: '/avatars/agents/dev-young-male.svg', emoji: '👨‍💻' },
  { id: 'dev-senior-female', label: 'Developer (Senior, Female)', roleHint: 'tech developer', gender: 'female', ageGroup: 'senior', image: '/avatars/agents/dev-senior-female.svg', emoji: '👩‍💻' },
  { id: 'ceo-assistant-female', label: 'CEO Assistant (Female)', roleHint: 'ceo assistant', gender: 'female', ageGroup: 'middle', image: '/avatars/agents/ceo-assistant-female.svg', emoji: '👩‍💼' },
  { id: 'ceo-assistant-male', label: 'CEO Assistant (Male)', roleHint: 'ceo assistant', gender: 'male', ageGroup: 'middle', image: '/avatars/agents/ceo-assistant-male.svg', emoji: '👨‍💼' },
  { id: 'ops-middle-age', label: 'Operations (Middle Age)', roleHint: 'operations', gender: 'neutral', ageGroup: 'middle', image: '/avatars/agents/ops-middle-age.svg', emoji: '🧑‍🔧' },
  { id: 'support-young', label: 'Support (Young)', roleHint: 'support', gender: 'neutral', ageGroup: 'young', image: '/avatars/agents/support-young.svg', emoji: '🧑‍💬' },
  { id: 'analyst-senior', label: 'Analyst (Senior)', roleHint: 'analyst', gender: 'neutral', ageGroup: 'senior', image: '/avatars/agents/analyst-senior.svg', emoji: '🧑‍📊' },
];
