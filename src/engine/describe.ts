import type { Condition, Rule } from "./types";

/** Human-readable text for a rule condition, using item trace labels. */
export function describeCondition(c: Condition, rule: Rule): string {
  const label = (id: string) => rule.items.find((i) => i.id === id)?.trace_label ?? id;
  if ("all" in c) return c.all.map((x) => describeCondition(x, rule)).join(" AND ");
  if ("any" in c) return "(" + c.any.map((x) => describeCondition(x, rule)).join(" OR ") + ")";
  if ("not" in c) return `NOT ${describeCondition(c.not, rule)}`;
  if ("any_yes" in c) return `any yes: ${c.any_yes.map(label).join("; ")}`;
  if ("all_yes" in c) return `all yes: ${c.all_yes.map(label).join("; ")}`;
  if ("all_no" in c) return `all no: ${c.all_no.map(label).join("; ")}`;
  if ("score_gte" in c) return `score ≥ ${c.score_gte}`;
  if ("score_lte" in c) return `score ≤ ${c.score_lte}`;
  if ("subscale" in c) return `subscale ${c.subscale}${c.gte !== undefined ? ` ≥ ${c.gte}` : ""}${c.lte !== undefined ? ` ≤ ${c.lte}` : ""}`;
  if ("pattern" in c) return `pattern = ${c.pattern}`;
  if ("pattern_in" in c) return `pattern is one of ${c.pattern_in.join(", ")}`;
  if ("includes" in c) {
    const item = rule.items.find((i) => i.id === c.var);
    const opt = item && "options" in item ? item.options.find((o) => o.value === c.includes)?.label : undefined;
    return `${label(c.var)} includes "${opt ?? c.includes}"`;
  }
  if ("equals" in c) return `${label(c.var)} = ${c.equals}`;
  if ("in" in c) return `${label(c.var)} is one of ${c.in.join(", ")}`;
  return JSON.stringify(c);
}
