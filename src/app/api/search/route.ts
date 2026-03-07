import { docsI18nConfig } from '@/lib/docs/i18n';
import { source } from '@/lib/source';
import { createTokenizer } from '@orama/tokenizers/mandarin';
import { createI18nSearchAPI } from 'fumadocs-core/search/server';

const searchAPI = createI18nSearchAPI('advanced', {
  i18n: docsI18nConfig,
  indexes: source.getLanguages().flatMap(({ language, pages }) =>
    pages.map((page) => ({
      title: page.data.title,
      description: page.data.description,
      structuredData: page.data.structuredData,
      id: page.url,
      url: page.url,
      locale: language,
    }))
  ),
  localeMap: {
    zh: {
      components: { tokenizer: createTokenizer() },
      search: { threshold: 0, tolerance: 0 },
    },
    en: 'english',
  },
  search: { limit: 20 },
});

export const GET = async (request: Request) => {
  const response = await searchAPI.GET(request);
  return response;
};
