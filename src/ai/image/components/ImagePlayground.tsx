'use client';

import { Download } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { useImageGeneration } from '../hooks/use-image-generation';
import { MODEL_CONFIGS, type ProviderKey } from '../lib/provider-config';
import { PROVIDERS, PROVIDER_ORDER } from '../lib/provider-config';
import type { Suggestion } from '../lib/suggestions';
import { ImageGeneratorHeader } from './ImageGeneratorHeader';
import { ModelCardCarousel } from './ModelCardCarousel';
import { ModelSelect } from './ModelSelect';
import { PromptInput } from './PromptInput';

export function ImagePlayground({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  const locale = useLocale();
  const {
    images,
    timings,
    failedProviders,
    isLoading,
    startGeneration,
    activePrompt,
  } = useImageGeneration();

  // Fixed provider/model: no model selection UI
  const selectedModels: Record<ProviderKey, string> = MODEL_CONFIGS.performance;
  const showProviders = false;
  const enabledProviders = { replicate: true };

  // Localized texts for deletion notice
  const localizedTexts: Record<
    string,
    { deletionNotice: string; downloadButton: string }
  > = {
    zh: {
      deletionNotice:
        '生成的图片本网站会定时删除，您如果需要保留还请下载下来。',
      downloadButton: '下载',
    },
    'zh-Hant': {
      deletionNotice:
        '生成的圖片本網站會定時刪除，您如果需要保留還請下載下來。',
      downloadButton: '下載',
    },
    ja: {
      deletionNotice:
        '生成された画像は当サイトで定期的に削除されます。保存が必要な場合はダウンロードしてください。',
      downloadButton: 'ダウンロード',
    },
    ko: {
      deletionNotice:
        '생성된 이미지는 본 웹사이트에서 정기적으로 삭제됩니다. 보관이 필요하시면 다운로드해 주세요.',
      downloadButton: '다운로드',
    },
    en: {
      deletionNotice:
        'Generated images will be periodically deleted from our website. Please download them if you need to keep them.',
      downloadButton: 'Download',
    },
  };
  const lt = localizedTexts[locale] ?? localizedTexts.en;

  const providerToModel = {
    replicate: selectedModels.replicate,
  };

  const handlePromptSubmit = (
    newPrompt: string,
    imageBase64?: string,
    imageUrl?: string
  ) => {
    // Use fixed provider list
    const activeProviders: ProviderKey[] = ['replicate'];
    startGeneration(
      newPrompt,
      activeProviders,
      providerToModel,
      imageBase64,
      imageUrl
    );
  };

  // Get the first replicate image and timing
  const replicateImage = images.find((img) => img.provider === 'replicate');
  const replicateTiming = timings.replicate;

  return (
    <div className="rounded-lg bg-background py-4 px-4 sm:px-6">
      <div className="mx-auto">
        {/* Input prompt with integrated result display */}
        <PromptInput
          onSubmit={handlePromptSubmit}
          isLoading={isLoading}
          showProviders={showProviders}
          onToggleProviders={() => {}}
          mode={'performance'}
          onModeChange={() => {}}
          suggestions={suggestions}
          requiresImage={selectedModels.replicate === 'google/nano-banana'}
          generatedImage={replicateImage?.image}
          generationTime={replicateTiming?.elapsed}
        />

        {/* Deletion notice */}
        {images.length > 0 && (
          <div className="mt-8 text-center">
            <div className="text-sm text-muted-foreground">
              {lt.deletionNotice}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
