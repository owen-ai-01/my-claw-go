'use client';

import { AVAILABLE_MODELS, type ModelOption } from '@/lib/myclawgo/model-catalog';
import { useEffect, useMemo, useState } from 'react';

const CUSTOM_SENTINEL = '__custom__';

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
  placeholder = 'Select or enter model ID…',
  className = '',
  selectClassName = '',
  inputClassName = '',
}: Props) {
  const [options, setOptions] = useState<ModelOption[]>(AVAILABLE_MODELS);

  const knownIds = useMemo(() => options.map((m) => m.id), [options]);
  const isKnown = !value || knownIds.includes(value);
  const [mode, setMode] = useState<'select' | 'custom'>(isKnown ? 'select' : 'custom');

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

  // If value changes externally and is not in list, switch to custom
  useEffect(() => {
    if (value && !knownIds.includes(value)) setMode('custom');
  }, [value, knownIds]);

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = e.target.value;
    if (selected === CUSTOM_SENTINEL) {
      setMode('custom');
      onChange('');
    } else {
      setMode('select');
      onChange(selected);
    }
  }

  const baseSelect = 'w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50';
  const baseInput = 'w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50';

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <select
        value={mode === 'custom' ? CUSTOM_SENTINEL : (value || '')}
        onChange={handleSelectChange}
        className={`${baseSelect} ${selectClassName}`}
      >
        <option value="">{placeholder}</option>
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom model ID…</option>
      </select>

      {mode === 'custom' && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. openrouter/openai/gpt-4o-mini"
          className={`${baseInput} ${inputClassName}`}
        />
      )}
    </div>
  );
}
