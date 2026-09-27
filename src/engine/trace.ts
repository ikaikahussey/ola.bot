// Fixed-template text renderings of an evaluation. Used on screen, in the PDF,
// and in the provider handoff summary.

import { CARE_LEVEL_LABEL } from "./careLevels";
import type { Evaluation, ItemTrace } from "./evaluate";
import type { Rule } from "./types";

export const RULE_LINE = "─".repeat(44);

export function fmtPoints(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

export function itemLine(item: ItemTrace, method: Evaluation["method"]): string {
  const base = `${item.label}: ${item.answer_text}`;
  if (item.status === "clinician_only") {
    return `${base} (${fmtPoints(item.points)}) — ${item.note ?? ""}`.trim();
  }
  if (item.status === "not_applicable") return base;
  if (method !== "sum") {
    if (item.status === "missing" || item.status === "unsure") return `${base} (treated as unknown)`;
    return base;
  }
  if (item.status === "missing" || item.status === "unsure") {
    const extra = item.worst_points !== item.points ? `; could be ${fmtPoints(item.worst_points)}` : "";
    return `${base} (counted as ${fmtPoints(item.points)}${extra})`;
  }
  return `${base} (${fmtPoints(item.points)})`;
}

export const ASSESSMENT_TYPE_LABEL: Record<Rule["assessment_type"], string> = {
  scoring_algorithm: "Scoring algorithm",
  diagnostic_confirmation: "Diagnostic confirmation (not scored)",
  red_flag: "Red flag screening (emergency stop)",
};

/** Treatment-window status for rules with a time_window, or null. */
export function windowStatus(rule: Rule, answers: Record<string, string | undefined>) {
  const tw = rule.time_window;
  if (!tw) return null;
  const v = answers[tw.item];
  if (!v || v === "unsure") return { window: tw, status: null };
  return { window: tw, status: tw.status[v] ?? null };
}

export function patternTraceLines(rule: Rule, ev: Evaluation, answers: Record<string, string | undefined>): string[] {
  const lines: string[] = [];
  const section = (title: string, mark: string, state: string) => {
    const f = ev.findings.filter((x) => x.state === state);
    if (!f.length) return;
    lines.push("", title);
    for (const x of f) lines.push(`${mark} ${x.label}`);
  };
  lines.push(`Assessment: ${rule.name} — Pattern matching`);
  lines.push(RULE_LINE);
  lines.push(`Assessment type: ${ASSESSMENT_TYPE_LABEL[rule.assessment_type]}`);
  section("Findings present:", "✓", "present");
  section("Findings absent:", "○", "absent");
  section("Not answered or not sure:", "?", "unknown");
  section("Other answers:", "•", "info");
  lines.push("", RULE_LINE);
  if (ev.pattern) lines.push(`Conclusion: ${ev.pattern.label}`);
  lines.push(`Pattern rule: ${rule.scoring.method === "pattern" ? rule.scoring.pattern_text : ""}`);
  const w = windowStatus(rule, answers);
  if (w) {
    lines.push("", `${w.window.label}:`);
    lines.push(w.status ? `- ${w.status.text}` : "- Onset not answered; the window cannot be determined.");
  }
  lines.push("", "Routing path:");
  ev.path.forEach((p, i) => lines.push(`  ${i + 1}. ${p.label}: ${p.met ? "YES" : "NO"}${p.met ? ` → ${ev.result_def.label}` : ""}`));
  lines.push("", `Result: ${ev.result_def.label}`);
  lines.push(`Recommendation: ${ev.result_def.recommendation}`);
  if (ev.range_note) lines.push(`Note: ${ev.range_note}`);
  if (ev.caution_note) lines.push(`Note: ${ev.caution_note}`);
  if (ev.limited) lines.push("Assessment limited by missing data.");
  lines.push(`Reference: ${rule.citations.map((c) => c.text).join(" ")}`);
  return lines;
}

export function traceLines(rule: Rule, ev: Evaluation, answers: Record<string, string | undefined> = {}): string[] {
  if (ev.method === "pattern") return patternTraceLines(rule, ev, answers);
  const lines: string[] = [];
  lines.push(`${rule.name} — ${rule.condition}`);
  lines.push(RULE_LINE);
  for (const item of ev.items) lines.push(itemLine(item, ev.method));
  lines.push(RULE_LINE);
  if (ev.method === "sum") {
    lines.push(`Total: ${ev.score} point${ev.score === 1 ? "" : "s"} (possible range ${ev.score_min} to ${ev.score_max})`);
    for (const [name, value] of Object.entries(ev.subscales)) lines.push(`Subscale "${name}": ${value}`);
  } else {
    lines.push("Decision path:");
    ev.path.forEach((p, i) => {
      lines.push(`  ${i + 1}. ${p.label}: ${p.met ? "YES" : "NO"}${p.met ? ` → ${ev.result_def.label}` : ""}`);
    });
  }
  lines.push(`Result: ${ev.result_def.label} (${ev.result_reason})`);
  lines.push(`Threshold: ${rule.scoring.threshold_text}`);
  lines.push(`Interpretation: ${ev.result_def.interpretation}`);
  lines.push(`Recommendation: ${ev.result_def.recommendation}`);
  if (ev.range_note) lines.push(`Note: ${ev.range_note}`);
  if (ev.caution_note) lines.push(`Note: ${ev.caution_note}`);
  if (ev.limited) lines.push("Assessment limited by missing data.");
  return lines;
}

export function resultSummary(rule: Rule, ev: Evaluation): string {
  const score = ev.method === "sum" ? `score ${ev.score} of ${ev.score_max}` : "decision rule";
  return `${rule.short_name}: ${ev.result_def.label} (${score})`;
}

/** What the user can say to the provider. Contains no raw answers. */
export function tellProvider(rule: Rule, ev: Evaluation): string {
  const scorePart =
    ev.method === "sum"
      ? ` My score was ${ev.score} (${ev.result_def.label}).`
      : ev.pattern
        ? ` The symptom pattern check found: ${ev.pattern.label}. The result was: ${ev.result_def.label}.`
        : ` The result was: ${ev.result_def.label}.`;
  const limited = ev.limited ? " Some answers were missing or uncertain." : "";
  return `I completed the ${rule.name} for ${rule.condition.toLowerCase()}.${scorePart}${limited}`;
}

export interface HandoffInput {
  rule: Rule;
  ev: Evaluation;
  sessionId: string;
  timestamp: string;
}

/** Shareable summary: rule, score, result, care level. No item-level answers. */
export function handoffSummary({ rule, ev, sessionId, timestamp }: HandoffInput): string {
  const primary = rule.citations[0];
  const lines = [
    "OLA BOT symptom assessment summary",
    `Date/time: ${timestamp}`,
    `Session ID: ${sessionId}`,
    `Concern: ${rule.condition}`,
    `Rule used: ${rule.name} (version ${rule.version}; ${primary.text})`,
    ev.method === "sum"
      ? `Score: ${ev.score} (possible ${ev.score_min} to ${ev.score_max})`
      : ev.pattern
        ? `Pattern check: ${ev.pattern.label} (routing: ${ev.result_reason})`
        : `Decision rule outcome: ${ev.result_reason}`,
    `Result: ${ev.result_def.label}`,
    `Care level advised: ${CARE_LEVEL_LABEL[ev.result_def.care.level]}, ${ev.result_def.care.within}`,
  ];
  if (ev.limited) lines.push(`Missing or uncertain items: ${ev.missing.length + ev.unsure.length}`);
  lines.push("Self-reported by patient using a validated rule. Not a diagnosis.");
  return lines.join("\n");
}
