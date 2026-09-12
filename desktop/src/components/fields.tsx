import { useEffect, useState } from "react";

/** Settings form primitives. Each commits through onChange when the user is done editing. */

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="field toggle-field">
      <span className="field-text">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </label>
  );
}

export function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      let next = parsed;
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      onChange(Math.round(next));
      setDraft(String(Math.round(next)));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <label className="field">
      <span className="field-text">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <input
        className="input number"
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
}

export function TextField({
  label,
  hint,
  value,
  placeholder,
  mono,
  onChange,
  action,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (value: string) => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="field">
      <div className="field-text">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <div className="field-row">
        <input
          className={`input ${mono ? "mono" : ""}`}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(value.trim())}
        />
        {action}
      </div>
    </div>
  );
}

export function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  // local drag state; commit only when the pointer/keyboard gesture ends
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;
  return (
    <div className="field slider-field">
      <div className="field-text row">
        <span className="field-label">{label}</span>
        <span className="field-value">{format ? format(shown) : shown.toFixed(2)}</span>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(event) => setDrag(Number(event.target.value))}
        onPointerUp={() => {
          if (drag !== null) onChange(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null) onChange(drag);
          setDrag(null);
        }}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="field">
      <span className="field-text">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <select className="input select" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
