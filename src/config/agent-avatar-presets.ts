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
  {
    id: 'robot-main',
    label: 'Robot',
    roleHint: 'main',
    gender: 'neutral',
    ageGroup: 'middle',
    image: '/avatars/agents/robot-main.svg',
    emoji: '🤖',
  },
  {
    id: 'female-long-straight',
    label: 'Young Woman (Long Straight Hair)',
    gender: 'female',
    ageGroup: 'young',
    image: '/avatars/agents/female-long-straight.svg',
    emoji: '👩',
  },
  {
    id: 'female-long-curly',
    label: 'Young Woman (Long Curly Hair)',
    gender: 'female',
    ageGroup: 'young',
    image: '/avatars/agents/female-long-curly.svg',
    emoji: '👩',
  },
  {
    id: 'female-long-wavy',
    label: 'Young Woman (Long Wavy Hair)',
    gender: 'female',
    ageGroup: 'young',
    image: '/avatars/agents/female-long-wavy.svg',
    emoji: '👩',
  },
  {
    id: 'female-middle-bob',
    label: 'Middle-aged Woman (Bob)',
    gender: 'female',
    ageGroup: 'middle',
    image: '/avatars/agents/female-middle-bob.svg',
    emoji: '👩‍💼',
  },
  {
    id: 'female-middle-bun',
    label: 'Middle-aged Woman (Bun)',
    gender: 'female',
    ageGroup: 'middle',
    image: '/avatars/agents/female-middle-bun.svg',
    emoji: '👩‍💼',
  },
  {
    id: 'female-senior',
    label: 'Senior Woman',
    gender: 'female',
    ageGroup: 'senior',
    image: '/avatars/agents/female-senior.svg',
    emoji: '👩‍🦳',
  },
  {
    id: 'male-young-short',
    label: 'Young Man (Short Hair)',
    gender: 'male',
    ageGroup: 'young',
    image: '/avatars/agents/male-young-short.svg',
    emoji: '👨',
  },
  {
    id: 'male-young-curly',
    label: 'Young Man (Curly Hair)',
    gender: 'male',
    ageGroup: 'young',
    image: '/avatars/agents/male-young-curly.svg',
    emoji: '👨',
  },
  {
    id: 'male-middle',
    label: 'Middle-aged Man',
    gender: 'male',
    ageGroup: 'middle',
    image: '/avatars/agents/male-middle.svg',
    emoji: '👨‍💼',
  },
  {
    id: 'male-middle-caesar',
    label: 'Middle-aged Man (Caesar Cut)',
    gender: 'male',
    ageGroup: 'middle',
    image: '/avatars/agents/male-middle-caesar.svg',
    emoji: '👨‍💼',
  },
  {
    id: 'male-senior',
    label: 'Senior Man',
    gender: 'male',
    ageGroup: 'senior',
    image: '/avatars/agents/male-senior.svg',
    emoji: '👨‍🦳',
  },
];
