export interface PillOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

export function PillSelector<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="pill-group">
      {label && <span className="pill-label">{label}</span>}
      <div className="pills" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            title={option.title}
            className={`pill ${option.value === value ? "active" : ""}`}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
