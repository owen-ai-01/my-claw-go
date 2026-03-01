import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { imageHelpers } from '../lib/image-helpers';
import type { ProviderTiming } from '../lib/image-types';
import {
  FireworksIcon,
  OpenAIIcon,
  ReplicateIcon,
  falAILogo,
} from '../lib/logos';
import type { ProviderKey } from '../lib/provider-config';
import { ImageDisplay } from './ImageDisplay';

interface ModelSelectProps {
  label: string;
  models: string[];
  value: string;
  providerKey: ProviderKey;
  onChange: (value: string, providerKey: ProviderKey) => void;
  iconPath: string;
  color: string;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  image: string | null | undefined;
  timing?: ProviderTiming;
  failed?: boolean;
  modelId: string;
}

const PROVIDER_ICONS = {
  openai: OpenAIIcon,
  replicate: ReplicateIcon,
  fireworks: FireworksIcon,
  fal: falAILogo,
} as const;

const PROVIDER_LINKS = {
  openai: 'openai',
  replicate: 'replicate',
  fireworks: 'fireworks',
  fal: 'fal',
} as const;

export function ModelSelect({
  label,
  models,
  value,
  providerKey,
  onChange,
  enabled = true,
  image,
  timing,
  failed,
  modelId,
}: ModelSelectProps) {
  // Simplified version - only show the image without provider info and model selection
  return (
    <Card className="w-full">
      <CardContent className="h-full p-4">
        <ImageDisplay
          modelId={modelId}
          provider={providerKey}
          image={image}
          timing={timing}
          failed={failed}
        />
      </CardContent>
    </Card>
  );
}
