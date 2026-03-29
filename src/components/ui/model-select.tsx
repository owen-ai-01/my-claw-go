'use client';

import { AVAILABLE_MODELS, type ModelOption } from '@/lib/myclawgo/model-catalog';
import { useEffect, useMemo, useState } from 'react';

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
  placeholder = 'Search or enter model ID…',
  className = '',
  selectClassName = '',
  inputClassName = '',
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

  const datalistId = useMemo(() => `model-select-${Math.random().toString(36).slice(2)}`, []);
  const baseInput = 'w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50';

  function handleInputChange(next: string) {
    const matched = options.find((m) => m.label === next || m.id === next);
    onChange((matched?.id || next).trim());
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <input
        list={datalistId}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        className={`${baseInput} ${selectClassName} ${inputClassName}`}
      />
      <datalist id={datalistId}>
        {options.map((model) => (
          <option key={model.id} value={model.id} label={model.label} />
        ))}
      </datalist>
    </div>
  );
}
