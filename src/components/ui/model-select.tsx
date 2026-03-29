'use client';

import { AVAILABLE_MODELS, type ModelOption } from '@/lib/myclawgo/model-catalog';
import { useEffect, useState } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
};

export function ModelSelect({
  value,
  onChange,
  placeholder = 'Select model…',
  className = '',
  selectClassName = '',
}: Props) {
  const [options, setOptions] = useState<ModelOption[]>(AVAILABLE_MODELS);

  useEffect(() => {
    let canceled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/models/options', { cache: 'no-store' });
        const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { options?: ModelOption[] } };
        if (!canceled && res.ok && payload.ok && Array.isArray(payload.data?.options) && payload.data.options.length > 0) {
          setOptions(payload.data.options);
        }
      } catch {
        // keep fallback list
      }
    };
    void load();
    return () => {
      canceled = true;
    };
  }, []);

  const baseInput = 'w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50';

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} ${selectClassName}`}
      >
        <option value="">{placeholder}</option>
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label} ({model.id})
          </option>
        ))}
      </select>
    </div>
  );
}
