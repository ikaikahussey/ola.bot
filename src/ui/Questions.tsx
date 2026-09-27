import { useId } from "react";
import type { AskedItem } from "../engine/types";

export function YesNoButtons({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="row">
      <button className="primary" onClick={onNo} style={{ minWidth: 120 }}>
        No
      </button>
      <button onClick={onYes} style={{ minWidth: 120 }}>
        Yes
      </button>
    </div>
  );
}

export function QuestionField({
  item,
  value,
  onChange,
  compact = false,
  allowUnsure = true,
  invalid = false,
}: {
  item: AskedItem;
  value: string | undefined;
  onChange: (v: string) => void;
  /** Smaller legend, used when several questions share one screen. */
  compact?: boolean;
  allowUnsure?: boolean;
  invalid?: boolean;
}) {
  const name = useId();
  const legendStyle = compact ? { fontSize: "1.05rem", marginBottom: "0.5rem" } : undefined;
  if (item.type === "checkbox") {
    const selected = value ? value.split(",").filter(Boolean) : [];
    const toggle = (v: string) => {
      const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
      // Keep option order stable so the stored value is deterministic.
      onChange(item.options.map((o) => o.value).filter((x) => next.includes(x)).join(","));
    };
    return (
      <fieldset>
        <legend style={legendStyle}>{item.question}</legend>
        {item.options.map((o) => (
          <label className="choice" key={o.value}>
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
        {item.help && <p className="small sub">{item.help}</p>}
      </fieldset>
    );
  }
  const options =
    item.type === "yes_no"
      ? [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]
      : item.options.map((o) => ({ value: o.value, label: o.label }));
  if (allowUnsure) options.push({ value: "unsure", label: "Not sure" });
  return (
    <fieldset aria-invalid={invalid || undefined} className={invalid ? "invalid" : undefined}>
      <legend style={legendStyle}>
        {item.question}
        {compact && item.required === false && <span className="small sub"> (optional)</span>}
      </legend>
      <div className={compact && item.type === "yes_no" ? "row" : undefined}>
        {options.map((o) => (
          <label className="choice" key={o.value} style={compact && item.type === "yes_no" ? { flex: "1 1 120px", marginBottom: 0 } : undefined}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {item.help && (
        <details className="help">
          <summary>Not sure?</summary>
          <p>{item.help}</p>
        </details>
      )}
      {invalid && <p className="small" style={{ color: "var(--alert)" }}>Please answer this question (“Not sure” is an answer).</p>}
    </fieldset>
  );
}
