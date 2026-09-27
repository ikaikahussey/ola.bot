// Deterministic rule execution. Given a rule and the user's answers, produce the
// score, the result, and an item-by-item trace. No randomness, no network, no
// generated text: every output string comes from the rule file or a fixed template.

import type {
  Answers,
  AskedItem,
  CheckboxItem,
  ChoiceItem,
  Condition,
  Item,
  PatternLevel,
  ResultDef,
  Rule,
  YesNoItem,
} from "./types";

export type FillMode = "base" | "worst";

export interface EvalContext {
  answers: Answers;
  score: number;
  subscales: Record<string, number>;
  /** Pattern level id (pattern rules only). */
  pattern?: string;
}

export type ItemStatus = "answered" | "unsure" | "missing" | "clinician_only" | "not_applicable";

export interface ItemTrace {
  id: string;
  label: string;
  question: string | null;
  status: ItemStatus;
  /** Display text of the answer: "YES", "NO", option label, "NOT SURE", "NOT ANSWERED". */
  answer_text: string;
  /** Points counted toward the score (sum rules). */
  points: number;
  /** Points this item would add under the cautious (worst-case) reading. */
  worst_points: number;
  note?: string;
  critical: boolean;
  required: boolean;
}

export type FindingState = "present" | "absent" | "unknown" | "info";

/** One line of the ✓/○ checklist shown for pattern rules. */
export interface Finding {
  item_id: string;
  label: string;
  state: FindingState;
  weight?: "essential" | "supporting" | "critical";
}

export interface PathStep {
  label: string;
  met: boolean;
  result: string;
}

export interface Evaluation {
  rule_id: string;
  method: "sum" | "decision" | "pattern";
  items: ItemTrace[];
  /** Pattern rules: the pattern level used for routing. */
  pattern: PatternLevel | null;
  findings: Finding[];
  score: number | null;
  worst_score: number | null;
  score_min: number | null;
  score_max: number | null;
  subscales: Record<string, number>;
  base_result: string;
  worst_result: string;
  /** Result used for care routing. */
  result: string;
  result_def: ResultDef;
  result_reason: string;
  path: PathStep[];
  missing: ItemTrace[];
  unsure: ItemTrace[];
  /** More than one required item unanswered: the user must go back. */
  blocked: boolean;
  limited: boolean;
  routed_cautiously: boolean;
  caution_note: string | null;
  range_note: string | null;
}

export function isAsked(item: Item): item is AskedItem {
  return item.type !== "clinician_only";
}

export function evalCondition(cond: Condition, ctx: EvalContext): boolean {
  if ("all" in cond) return cond.all.every((c) => evalCondition(c, ctx));
  if ("any" in cond) return cond.any.some((c) => evalCondition(c, ctx));
  if ("not" in cond) return !evalCondition(cond.not, ctx);
  if ("any_yes" in cond) return cond.any_yes.some((v) => ctx.answers[v] === "yes");
  if ("all_yes" in cond) return cond.all_yes.every((v) => ctx.answers[v] === "yes");
  if ("all_no" in cond) return cond.all_no.every((v) => ctx.answers[v] === "no");
  if ("score_gte" in cond) return ctx.score >= cond.score_gte;
  if ("score_lte" in cond) return ctx.score <= cond.score_lte;
  if ("subscale" in cond) {
    const s = ctx.subscales[cond.subscale] ?? 0;
    if (cond.gte !== undefined && s < cond.gte) return false;
    if (cond.lte !== undefined && s > cond.lte) return false;
    return true;
  }
  if ("pattern" in cond) return ctx.pattern === cond.pattern;
  if ("pattern_in" in cond) return cond.pattern_in.includes(ctx.pattern ?? "");
  if ("includes" in cond) return splitSelected(ctx.answers[cond.var]).includes(cond.includes);
  if ("equals" in cond) return ctx.answers[cond.var] === cond.equals;
  if ("in" in cond) return cond.in.includes(ctx.answers[cond.var] ?? "");
  throw new Error(`Unknown condition: ${JSON.stringify(cond)}`);
}

export function splitSelected(value: string | undefined): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function yesNoPoints(item: YesNoItem, value: string): number {
  if (value === "yes") return item.points_if_yes ?? 0;
  if (value === "no") return item.points_if_no ?? 0;
  return 0;
}

function choicePoints(item: ChoiceItem, value: string): number {
  return item.options.find((o) => o.value === value)?.points ?? 0;
}

export function itemPoints(item: Item, value: string | undefined): number {
  if (item.type === "clinician_only") return item.fixed_points;
  if (value === undefined) return 0;
  if (item.type === "yes_no") return yesNoPoints(item, value);
  if (item.type === "checkbox") return checkboxPoints(item, value);
  return choicePoints(item, value);
}

function checkboxPoints(item: CheckboxItem, value: string): number {
  const sel = splitSelected(value);
  return item.options.filter((o) => sel.includes(o.value)).reduce((a, o) => a + (o.points ?? 0), 0);
}

function hasPoints(item: YesNoItem): boolean {
  return item.points_if_yes !== undefined || item.points_if_no !== undefined;
}

/** The answer assumed for an unknown item in the given mode. */
export function fillValue(item: AskedItem, mode: FillMode): string {
  if (item.type === "yes_no") {
    if (hasPoints(item)) {
      const yes = item.points_if_yes ?? 0;
      const no = item.points_if_no ?? 0;
      if (yes === no) return mode === "worst" ? (item.concerning_answer ?? "yes") : "no";
      const higher = yes > no ? "yes" : "no";
      const lower = higher === "yes" ? "no" : "yes";
      return mode === "worst" ? higher : lower;
    }
    const concerning = item.concerning_answer ?? "yes";
    return mode === "worst" ? concerning : concerning === "yes" ? "no" : "yes";
  }
  const opts = item.options;
  if (item.type === "checkbox") {
    if (mode === "base") return "";
    const flagged = opts.filter((o) => o.concerning);
    return (flagged.length ? flagged : opts).map((o) => o.value).join(",");
  }
  if (mode === "worst") {
    const flagged = opts.find((o) => o.concerning);
    if (flagged) return flagged.value;
    return opts.reduce((a, b) => ((b.points ?? 0) > (a.points ?? 0) ? b : a)).value;
  }
  const benign = opts.find((o) => o.benign);
  if (!benign) throw new Error(`${item.id}: choice item has no benign option`);
  return benign.value;
}

function isKnown(value: string | undefined): value is string {
  return value !== undefined && value !== "unsure";
}

/**
 * Fill unknown answers for one mode and decide which items apply. Items are
 * processed in file order so show_if can depend on earlier items. Items that do
 * not apply take their benign value so they cannot trigger conditions.
 */
export function resolve(
  rule: Rule,
  raw: Answers,
  mode: FillMode,
): { filled: Answers; visible: Set<string> } {
  const filled: Answers = {};
  const visible = new Set<string>();
  const probe: EvalContext = { answers: filled, score: 0, subscales: {} };
  for (const item of rule.items) {
    if (!isAsked(item)) {
      visible.add(item.id);
      continue;
    }
    const applies = item.show_if ? evalCondition(item.show_if, probe) : true;
    if (applies) {
      visible.add(item.id);
      const v = raw[item.id];
      filled[item.id] = isKnown(v) ? v : fillValue(item, mode);
    } else {
      filled[item.id] = fillValue(item, "base");
    }
  }
  return { filled, visible };
}

/** Items the intake should ask, given the answers so far (cautious visibility). */
export function visibleItems(rule: Rule, raw: Answers): AskedItem[] {
  const { visible } = resolve(rule, raw, "worst");
  return rule.items.filter(isAsked).filter((i) => visible.has(i.id));
}

function computeScore(rule: Rule, filled: Answers, visible: Set<string>) {
  let score = 0;
  const subscales: Record<string, number> = {};
  for (const item of rule.items) {
    if (!visible.has(item.id)) continue;
    score += itemPoints(item, filled[item.id]);
  }
  if (rule.scoring.method === "sum" && rule.scoring.subscales) {
    for (const [name, ids] of Object.entries(rule.scoring.subscales)) {
      subscales[name] = ids.reduce((acc, id) => {
        const item = rule.items.find((i) => i.id === id);
        return item && visible.has(id) ? acc + itemPoints(item, filled[id]) : acc;
      }, 0);
    }
  }
  return { score, subscales };
}

export function patternLevel(rule: Rule, ctx: EvalContext): PatternLevel | null {
  if (rule.scoring.method !== "pattern") return null;
  const levels = rule.scoring.levels;
  return levels.find((l) => l.when && evalCondition(l.when, ctx)) ?? levels[levels.length - 1];
}

interface Selection {
  result: string;
  reason: string;
  path: PathStep[];
  pattern: PatternLevel | null;
}

function selectResult(rule: Rule, ctx: EvalContext): Selection {
  const pattern = patternLevel(rule, ctx);
  if (pattern) ctx = { ...ctx, pattern: pattern.id };
  const sel = selectRoute(rule, ctx);
  return { ...sel, pattern };
}

function selectRoute(rule: Rule, ctx: EvalContext): Omit<Selection, "pattern"> {
  const path: PathStep[] = [];
  for (const o of rule.overrides ?? []) {
    const met = evalCondition(o.when, ctx);
    path.push({ label: `Safety check: ${o.label}`, met, result: o.result });
    if (met) return { result: o.result, reason: `Safety check: ${o.label}`, path };
  }
  const scoring = rule.scoring;
  if (scoring.method === "sum") {
    for (const b of scoring.bands) {
      if (ctx.score >= b.min && ctx.score <= b.max && (!b.when || evalCondition(b.when, ctx))) {
        const range = b.min === b.max ? `${b.min}` : `${b.min} to ${b.max}`;
        return { result: b.result, reason: `Score ${ctx.score} is in the range ${range}`, path };
      }
    }
    throw new Error(`${rule.rule_id}: no band matches score ${ctx.score}`);
  }
  for (const s of scoring.steps) {
    const met = evalCondition(s.when, ctx);
    path.push({ label: s.label, met, result: s.result });
    if (met) return { result: s.result, reason: s.label, path };
  }
  path.push({ label: "No criteria met", met: true, result: scoring.default_result });
  return { result: scoring.default_result, reason: "No criteria met", path };
}

function answerText(item: AskedItem, value: string | undefined): string {
  if (value === undefined) return "NOT ANSWERED";
  if (value === "unsure") return "NOT SURE";
  if (item.type === "yes_no") return value.toUpperCase();
  if (item.type === "checkbox") {
    const sel = splitSelected(value);
    return sel.length ? item.options.filter((o) => sel.includes(o.value)).map((o) => o.label).join("; ") : "NONE";
  }
  return item.options.find((o) => o.value === value)?.label ?? value;
}

export function scoreRange(rule: Rule): { min: number; max: number } | null {
  if (rule.scoring.method !== "sum") return null;
  let min = 0;
  let max = 0;
  for (const item of rule.items) {
    if (item.type === "clinician_only") {
      min += item.fixed_points;
      max += item.fixed_points;
    } else if (item.type === "yes_no") {
      const pts = [item.points_if_yes ?? 0, item.points_if_no ?? 0];
      min += Math.min(...pts);
      max += Math.max(...pts);
    } else if (item.type === "checkbox") {
      for (const o of item.options) {
        const p = o.points ?? 0;
        if (p < 0) min += p;
        else max += p;
      }
    } else {
      const pts = item.options.map((o) => o.points ?? 0);
      min += Math.min(...pts);
      max += Math.max(...pts);
    }
  }
  return { min, max };
}

export function evaluate(rule: Rule, raw: Answers): Evaluation {
  const base = resolve(rule, raw, "base");
  const worst = resolve(rule, raw, "worst");
  const baseScore = computeScore(rule, base.filled, base.visible);
  const worstScore = computeScore(rule, worst.filled, worst.visible);
  const baseSel = selectResult(rule, { answers: base.filled, ...baseScore });
  const worstSel = selectResult(rule, { answers: worst.filled, ...worstScore });

  const items: ItemTrace[] = [];
  for (const item of rule.items) {
    if (item.type === "clinician_only") {
      items.push({
        id: item.id,
        label: item.trace_label,
        question: null,
        status: "clinician_only",
        answer_text: "NOT ASSESSED",
        points: item.fixed_points,
        worst_points: item.fixed_points,
        note: item.note,
        critical: false,
        required: false,
      });
      continue;
    }
    const value = raw[item.id];
    const inWorst = worst.visible.has(item.id);
    const inBase = base.visible.has(item.id);
    if (!inWorst && !inBase) {
      items.push({
        id: item.id,
        label: item.trace_label,
        question: item.question,
        status: "not_applicable",
        answer_text: "NOT ASKED (does not apply)",
        points: 0,
        worst_points: 0,
        critical: !!item.critical,
        required: item.required !== false,
      });
      continue;
    }
    const status: ItemStatus = value === undefined ? "missing" : value === "unsure" ? "unsure" : "answered";
    items.push({
      id: item.id,
      label: item.trace_label,
      question: item.question,
      status,
      answer_text: answerText(item, value),
      points: inBase ? itemPoints(item, base.filled[item.id]) : 0,
      worst_points: inWorst ? itemPoints(item, worst.filled[item.id]) : 0,
      critical: !!item.critical,
      required: item.required !== false,
    });
  }

  const missing = items.filter((i) => i.status === "missing");
  const unsure = items.filter((i) => i.status === "unsure");
  const unknownCritical = [...missing, ...unsure].filter((i) => i.critical);
  const differs = baseSel.result !== worstSel.result;
  const routedCautiously = differs && unknownCritical.length > 0;
  const result = routedCautiously ? worstSel.result : baseSel.result;
  const chosen = routedCautiously ? worstSel : baseSel;

  const resultDef = rule.results[result];
  if (!resultDef) throw new Error(`${rule.rule_id}: result "${result}" is not defined`);

  const isSum = rule.scoring.method === "sum";
  const range = scoreRange(rule);

  let rangeNote: string | null = null;
  if (differs) {
    const worstLabel = rule.results[worstSel.result].label;
    rangeNote = isSum
      ? `Unanswered or "not sure" items could raise the score to ${worstScore.score}, which would be: ${worstLabel}.`
      : `If the unanswered or "not sure" items were answered the other way, the result could be: ${worstLabel}.`;
  }
  const cautionNote = routedCautiously
    ? `Care routing uses the more cautious result because these important items were not answered: ${unknownCritical
        .map((i) => i.label)
        .join("; ")}.`
    : null;

  return {
    rule_id: rule.rule_id,
    method: rule.scoring.method,
    items,
    pattern: chosen.pattern,
    findings: buildFindings(rule, raw, items),
    score: isSum ? baseScore.score : null,
    worst_score: isSum ? worstScore.score : null,
    score_min: range?.min ?? null,
    score_max: range?.max ?? null,
    subscales: baseScore.subscales,
    base_result: baseSel.result,
    worst_result: worstSel.result,
    result,
    result_def: resultDef,
    result_reason: chosen.reason,
    path: chosen.path,
    missing,
    unsure,
    blocked: missing.filter((i) => i.required).length > 1,
    limited: missing.length + unsure.length > 0,
    routed_cautiously: routedCautiously,
    caution_note: cautionNote,
    range_note: rangeNote,
  };
}

/** Checklist of findings: yes/no items and each checkbox option, marked present, absent, or unknown. */
export function buildFindings(rule: Rule, raw: Answers, items: ItemTrace[]): Finding[] {
  const out: Finding[] = [];
  for (const item of rule.items) {
    if (!isAsked(item)) continue;
    const trace = items.find((t) => t.id === item.id);
    if (!trace || trace.status === "not_applicable") continue;
    const v = raw[item.id];
    const unknown = v === undefined || v === "unsure";
    const weight = item.finding_weight;
    if (item.type === "yes_no") {
      out.push({ item_id: item.id, label: item.trace_label, state: unknown ? "unknown" : v === "yes" ? "present" : "absent", weight });
    } else if (item.type === "checkbox") {
      const sel = splitSelected(v);
      for (const o of item.options) {
        out.push({ item_id: item.id, label: o.label, state: unknown ? "unknown" : sel.includes(o.value) ? "present" : "absent", weight });
      }
    } else {
      const label = unknown ? item.trace_label : `${item.trace_label}: ${item.options.find((o) => o.value === v)?.label ?? v}`;
      out.push({ item_id: item.id, label, state: unknown ? "unknown" : "info", weight });
    }
  }
  return out;
}
