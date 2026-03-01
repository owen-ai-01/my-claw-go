export interface Suggestion {
  text: string;
  prompt: string;
}

// English base prompts used across locales (simple; shown to user and combined with fixed base prompt)
const professionalPromptsEn: { text: string; prompt: string }[] = [
  { text: 'Formal headshot (tie)', prompt: 'suit and tie' },
  { text: 'Business suit (no tie)', prompt: 'business suit, no tie' },
  { text: 'Black suit', prompt: 'black suit, white shirt' },
  { text: 'White suit', prompt: 'white suit' },
];

function getEnPrompt(index: number): string {
  return professionalPromptsEn[index].prompt;
}

// Professional headshot suggestions (localized labels). Prompts remain in English for model quality.
const professionalSuggestions: Record<
  string,
  { text: string; prompt: string }[]
> = {
  en: [...professionalPromptsEn],
  zh: [
    { text: '系领带', prompt: '系领带' },
    { text: '不系领带', prompt: '不系领带' },
    { text: '黑色西装', prompt: '黑色西装 白衬衫' },
    { text: '白色西装', prompt: '白色西装' },
  ],
  'zh-Hant': [
    { text: '打領帶', prompt: '打領帶' },
    { text: '不打領帶', prompt: '不打領帶' },
    { text: '黑色西裝', prompt: '黑色西裝 白襯衫' },
    { text: '白色西裝', prompt: '白色西裝' },
  ],
  ja: [
    { text: 'ネクタイあり', prompt: 'ネクタイあり' },
    { text: 'ネクタイなし', prompt: 'ネクタイなし' },
    { text: '黒スーツ', prompt: '黒スーツ 白シャツ' },
    { text: '白スーツ', prompt: '白スーツ' },
  ],
  ko: [
    { text: '넥타이 착용', prompt: '넥타이 착용' },
    { text: '넥타이 없음', prompt: '넥타이 없음' },
    { text: '검은색 수트', prompt: '검은색 수트 흰 셔츠' },
    { text: '흰색 수트', prompt: '흰색 수트' },
  ],
};

function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getRandomSuggestions(count = 5, locale = 'en'): Suggestion[] {
  const list = professionalSuggestions[locale] ?? professionalSuggestions.en;
  return shuffle(list).slice(0, count);
}
