// POST /api/assessments/:id/submit — runs a rule on the server with the same
// engine the browser uses. For integrations; the web app evaluates locally and
// does not send answers unless the user consents to logging.

import { randomUUID } from "node:crypto";
import { ED_MAP_URL, specialtyForLevel } from "../src/engine/careLevels";
import { evaluate } from "../src/engine/evaluate";
import { traceLines } from "../src/engine/trace";
import type { Answers, Rule } from "../src/engine/types";
import { RULES_BY_ID } from "../src/rules";
import { HttpError } from "./npi";

export interface SubmitBody {
  assessment_type?: string;
  answers?: Record<string, unknown>;
  user_consent_logged?: boolean;
}

/** Accepts booleans (true → "yes"), strings, and arrays for checkbox items. */
export function normalizeAnswers(rule: Rule, raw: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const [k, v] of Object.entries(raw)) {
    const item = rule.items.find((i) => i.id === k);
    if (!item || item.type === "clinician_only") throw new HttpError(400, `Unknown item: ${k}`);
    if (v === null || v === undefined) continue;
    if (item.type === "checkbox") {
      const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",").filter(Boolean) : null;
      if (!list || list.some((x) => typeof x !== "string" || !item.options.some((o) => o.value === x))) throw new HttpError(400, `Invalid options for ${k}`);
      out[k] = item.options.map((o) => o.value).filter((x) => list.includes(x)).join(",");
      continue;
    }
    const s = v === true ? "yes" : v === false ? "no" : typeof v === "string" ? v : null;
    const allowed = item.type === "yes_no" ? ["yes", "no", "unsure"] : [...item.options.map((o) => o.value), "unsure"];
    if (s === null || !allowed.includes(s)) throw new HttpError(400, `Invalid answer for ${k}`);
    out[k] = s;
  }
  return out;
}

export function submitAssessment(ruleId: string, body: SubmitBody) {
  const rule = RULES_BY_ID[ruleId];
  if (!rule) throw new HttpError(404, `Unknown assessment: ${ruleId}`);
  if (body.assessment_type && body.assessment_type !== rule.assessment_type) {
    throw new HttpError(400, `assessment_type must be "${rule.assessment_type}" for ${ruleId}`);
  }
  if (!body.answers || typeof body.answers !== "object") throw new HttpError(400, "answers is required");
  const answers = normalizeAnswers(rule, body.answers);
  const ev = evaluate(rule, answers);
  if (ev.blocked) {
    throw new HttpError(422, `Missing required answers: ${ev.missing.filter((m) => m.required).map((m) => m.id).join(", ")}`);
  }
  const care = ev.result_def.care;
  const findings = (state: string) => ev.findings.filter((f) => f.state === state).map((f) => f.label);
  const emergency = rule.assessment_type === "red_flag" && care.level === "emergency_911";
  return {
    answers,
    ev,
    response: {
      session_id: randomUUID(),
      assessment_id: rule.rule_id,
      assessment_type: rule.assessment_type,
      rule_version: rule.version,
      result: ev.result,
      result_label: ev.result_def.label,
      interpretation: ev.pattern?.interpretation ?? ev.result_def.interpretation,
      pattern: ev.pattern ? { id: ev.pattern.id, label: ev.pattern.label, matched: ev.pattern.matched } : null,
      score: ev.score,
      routing: {
        care_level: care.level,
        within: care.within,
        where: care.where_detail,
        message: ev.result_def.recommendation,
        ed_instead_if: care.ed_redirect,
        specialty: care.finder_specialty ?? specialtyForLevel(care.level),
      },
      ...(emergency
        ? { message: "CALL 911 IMMEDIATELY", ui_action: "show_emergency_screen_only", nearest_hospital: null, find_emergency_room_url: ED_MAP_URL }
        : {}),
      audit_trail: {
        findings_present: findings("present"),
        findings_absent: findings("absent"),
        findings_unknown: findings("unknown"),
        other_answers: findings("info"),
        pattern_match: ev.pattern?.matched ?? null,
        time_criticality: rule.time_criticality ?? null,
        routing_path: ev.path,
        routed_cautiously: ev.routed_cautiously,
        trace: traceLines(rule, ev, answers),
      },
      logged: false,
    },
  };
}
