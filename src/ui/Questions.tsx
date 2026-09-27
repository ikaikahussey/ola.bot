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
}: {
  item: AskedItem;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const name = useId();
  const options =
    item.type === "yes_no"
      ? [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]
      : item.options.map((o) => ({ value: o.value, label: o.label }));
  options.push({ value: "unsure", label: "Not sure" });
  return (
    <fieldset>
      <legend>{item.question}</legend>
      {options.map((o) => (
        <label className="choice" key={o.value}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
      {item.help && (
        <details className="help">
          <summary>Not sure?</summary>
          <p>{item.help}</p>
        </details>
      )}
    </fieldset>
  );
}
