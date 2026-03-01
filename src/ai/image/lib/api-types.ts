import type { ProviderKey } from './provider-config';

export interface GenerateImageRequest {
  prompt: string;
  provider?: ProviderKey; // Made optional since we force replicate
  modelId: string;
  imageBase64?: string;
  imageUrl?: string;
}

export interface GenerateImageResponse {
  image?: string;
  error?: string;
}
