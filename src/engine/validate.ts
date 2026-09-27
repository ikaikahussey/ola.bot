// Structural checks for rule files. Run in unit tests and at app start so a
// malformed rule can never execute.

import { evalCondition, fillValue, isAsked, scoreRange } from "./evaluate";
import type { Condition, Rule } from "./types";

const CARE_LEVELS = new Set([
  "emergency_911", "crisis", "emergency_department", "urgent_care", "telehealth", "mental_health", "primary_care", "self_care",
]);
const ACTIONS = new Set(["call_911", "go_to_ed", "crisis_988", "urgent_care_today"]);

function conditionVars(c: Condition): string[] {
  if ("all" in c) return c.all.flatMap(conditionVars);
  if ("any" in c) return c.any.flatMap(conditionVars);
  if ("not" in c) return conditionVars(c.not);
  if ("any_yes" in c) return c.any_yes;
  if ("all_yes" in c) return c.all_yes;
  if ("all_no" in c) return c.all_no;
  if ("var" in c) return [c.var];
  return [];
}

export function validateRule(rule: Rule): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(`${rule.rule_id}: ${m}`);
  for (const k of ["rule_id", "name", "short_name", "assessment_title", "condition", "version", "last_updated", "license_note", "validated_population"] as const) {
    if (!rule[k] || typeof rule[k] !== "string") err(`missing ${k}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(rule.version)) err("version must be semver");
  if (!rule.changelog?.some((c) => c.version === rule.version)) err("changelog has no entry for current version");
  if (!rule.citations?.length) err("needs at least one citation");
  for (const c of rule.citations ?? []) if (!/^https:\/\//.test(c.url)) err(`citation url must be https: ${c.url}`);

  const ids = new Set<string>();
  const seen: string[] = [];
  for (const item of rule.items) {
    if (ids.has(item.id)) err(`duplicate item id ${item.id}`);
    ids.add(item.id);
    if (isAsked(item)) {
      if (!item.question || !item.trace_label) err(`${item.id}: needs question and trace_label`);
      if (item.type === "choice") {
        if (item.options.length < 2) err(`${item.id}: choice needs 2+ options`);
        if (item.options.filter((o) => o.benign).length !== 1) err(`${item.id}: choice needs exactly one benign option`);
        if (item.options.filter((o) => o.concerning).length > 1) err(`${item.id}: at most one concerning option`);
      }
      if (item.show_if) {
        for (const v of conditionVars(item.show_if)) if (!seen.includes(v)) err(`${item.id}: show_if references ${v}, which is not an earlier item`);
      }
      fillValue(item, "base");
      fillValue(item, "worst");
    }
    seen.push(item.id);
  }

  const results = new Set(Object.keys(rule.results));
  const referenced = new Set<string>();
  const checkCond = (c: Condition, where: string) => {
    for (const v of conditionVars(c)) if (!ids.has(v)) err(`${where}: unknown variable ${v}`);
    try {
      evalCondition(c, { answers: {}, score: 0, subscales: {} });
    } catch (e) {
      err(`${where}: ${(e as Error).message}`);
    }
  };
  for (const o of rule.overrides ?? []) {
    referenced.add(o.result);
    checkCond(o.when, `override "${o.label}"`);
  }
  if (rule.scoring.method === "sum") {
    const range = scoreRange(rule)!;
    for (const b of rule.scoring.bands) {
      referenced.add(b.result);
      if (b.min > b.max) err(`band ${b.result}: min > max`);
      if (b.when) checkCond(b.when, `band ${b.result}`);
    }
    // Every reachable score must fall in at least one unconditional band.
    for (let s = range.min; s <= range.max; s++) {
      if (!rule.scoring.bands.some((b) => !b.when && s >= b.min && s <= b.max)) err(`score ${s} has no unconditional band`);
    }
    for (const [name, list] of Object.entries(rule.scoring.subscales ?? {})) {
      for (const id of list) if (!ids.has(id)) err(`subscale ${name}: unknown item ${id}`);
    }
  } else {
    for (const s of rule.scoring.steps) {
      referenced.add(s.result);
      checkCond(s.when, `step "${s.label}"`);
    }
    referenced.add(rule.scoring.default_result);
  }
  for (const r of referenced) if (!results.has(r)) err(`result "${r}" is referenced but not defined`);
  for (const r of results) if (!referenced.has(r)) err(`result "${r}" is defined but never reachable`);

  for (const [key, def] of Object.entries(rule.results)) {
    if (!CARE_LEVELS.has(def.care.level)) err(`result ${key}: unknown care level ${def.care.level}`);
    if (!def.care.within) err(`result ${key}: missing care.within`);
    if (/call your doctor/i.test(JSON.stringify(def))) err(`result ${key}: vague "call your doctor" wording`);
  }
  for (const f of rule.red_flags) if (!ACTIONS.has(f.action)) err(`red flag ${f.id}: unknown action ${f.action}`);
  return errors;
}
