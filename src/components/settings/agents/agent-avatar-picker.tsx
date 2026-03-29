'use client';

import { AGENT_AVATAR_PRESETS } from '@/config/agent-avatar-presets';
import { uploadFileFromBrowser } from '@/storage/client';
import { useMemo, useState } from 'react';

export function AgentAvatarPicker({
  value,
  onChange,
  onEmojiChange,
}: {
  value: string;
  onChange: (url: string) => void;
  onEmojiChange?: (emoji: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const selectedPreset = useMemo(() => AGENT_AVATAR_PRESETS.find((item) => item.image === value), [value]);

  async function onFileChange(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await uploadFileFromBrowser(file, 'agent-avatars');
      onChange(result.url);
      if (onEmojiChange) onEmojiChange('🤖');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-full border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg">🤖</div>
          )}
        </div>
        <label className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted cursor-pointer">
          {uploading ? 'Uploading…' : 'Upload Avatar'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] || null)}
            disabled={uploading}
          />
        </label>
        {selectedPreset ? <span className="text-xs text-muted-foreground">{selectedPreset.label}</span> : null}
      </div>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">Or choose a default avatar</p>
        <div className="grid grid-cols-6 gap-2">
          {AGENT_AVATAR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onChange(preset.image);
                if (onEmojiChange && preset.emoji) onEmojiChange(preset.emoji);
              }}
              title={preset.label}
              className={`overflow-hidden rounded-full border transition-all ${value === preset.image ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preset.image} alt={preset.label} className="h-10 w-10 object-cover" />
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
