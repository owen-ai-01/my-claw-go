'use client';

import { AGENT_AVATAR_PRESETS } from '@/config/agent-avatar-presets';

export function AgentAvatarPicker({
  value,
  onChange,
  onEmojiChange,
}: {
  value: string;
  onChange: (url: string) => void;
  onEmojiChange?: (emoji: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 overflow-hidden rounded-full">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg">
              🤖
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          Or choose a default avatar
        </p>
        <div className="grid grid-cols-6 gap-2.5">
          {AGENT_AVATAR_PRESETS.map((preset) => {
            const active = value === preset.image;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onChange(preset.image);
                  if (onEmojiChange && preset.emoji)
                    onEmojiChange(preset.emoji);
                }}
                title={preset.label}
                className="relative overflow-hidden rounded-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preset.image}
                  alt={preset.label}
                  className="h-12 w-12 object-cover"
                />
                {active ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-white">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
