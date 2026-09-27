// Page-level URLs. Every screen has its own path so the back button, reloads,
// and links work. Answers are never put in the URL; they stay in the session
// (memory + sessionStorage for this tab only).

import { evaluate } from "../engine/evaluate";
import type { Session } from "../engine/session";
import { GLOBAL_RED_FLAGS, RULES_BY_ID } from "../rules";

export type Route =
  | { page: "home" }
  | { page: "safety"; n: number }
  | { page: "stop"; flag: string; rule?: string }
  | { page: "symptom" }
  | { page: "choose" }
  | { page: "confirm"; rule: string }
  | { page: "warning"; rule: string; n: number }
  | { page: "question"; rule: string; n: number }
  | { page: "check"; rule: string }
  | { page: "review"; rule: string }
  | { page: "result"; rule: string }
  | { page: "rules" }
  | { page: "rule_detail"; rule: string }
  | { page: "about" }
  | { page: "find" }
  | { page: "not_found" };

const ID = "([a-z0-9_]+)";
const N = "([1-9][0-9]*)";

const PATTERNS: [RegExp, (m: RegExpMatchArray) => Route][] = [
  [/^\/$/, () => ({ page: "home" })],
  [new RegExp(`^/safety/${N}$`), (m) => ({ page: "safety", n: Number(m[1]) })],
  [new RegExp(`^/stop/${ID}$`), (m) => ({ page: "stop", flag: m[1] })],
  [new RegExp(`^/stop/${ID}/${ID}$`), (m) => ({ page: "stop", rule: m[1], flag: m[2] })],
  [/^\/symptom$/, () => ({ page: "symptom" })],
  [/^\/symptom\/choose$/, () => ({ page: "choose" })],
  [new RegExp(`^/assess/${ID}$`), (m) => ({ page: "confirm", rule: m[1] })],
  [new RegExp(`^/assess/${ID}/warning/${N}$`), (m) => ({ page: "warning", rule: m[1], n: Number(m[2]) })],
  [new RegExp(`^/assess/${ID}/q/${N}$`), (m) => ({ page: "question", rule: m[1], n: Number(m[2]) })],
  [new RegExp(`^/assess/${ID}/check$`), (m) => ({ page: "check", rule: m[1] })],
  [new RegExp(`^/assess/${ID}/review$`), (m) => ({ page: "review", rule: m[1] })],
  [new RegExp(`^/assess/${ID}/result$`), (m) => ({ page: "result", rule: m[1] })],
  [/^\/rules$/, () => ({ page: "rules" })],
  [new RegExp(`^/rules/${ID}$`), (m) => ({ page: "rule_detail", rule: m[1] })],
  [/^\/about$/, () => ({ page: "about" })],
  [/^\/find$/, () => ({ page: "find" })],
];

export function parsePath(path: string): Route {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  for (const [re, make] of PATTERNS) {
    const m = clean.match(re);
    if (m) {
      const r = make(m);
      if ("rule" in r && r.rule !== undefined && !RULES_BY_ID[r.rule]) return { page: "not_found" };
      if (r.page === "stop" && !findFlag(r.flag, r.rule)) return { page: "not_found" };
      return r;
    }
  }
  return { page: "not_found" };
}

export function pathFor(r: Route): string {
  switch (r.page) {
    case "home":
      return "/";
    case "safety":
      return `/safety/${r.n}`;
    case "stop":
      return r.rule ? `/stop/${r.rule}/${r.flag}` : `/stop/${r.flag}`;
    case "symptom":
      return "/symptom";
    case "choose":
      return "/symptom/choose";
    case "confirm":
      return `/assess/${r.rule}`;
    case "warning":
      return `/assess/${r.rule}/warning/${r.n}`;
    case "question":
      return `/assess/${r.rule}/q/${r.n}`;
    case "check":
      return `/assess/${r.rule}/check`;
    case "review":
      return `/assess/${r.rule}/review`;
    case "result":
      return `/assess/${r.rule}/result`;
    case "rules":
      return "/rules";
    case "rule_detail":
      return `/rules/${r.rule}`;
    case "about":
      return "/about";
    case "find":
      return "/find";
    case "not_found":
      return "/404";
  }
}

export function findFlag(flagId: string, ruleId?: string) {
  if (ruleId) return RULES_BY_ID[ruleId]?.red_flags.find((f) => f.id === flagId);
  return GLOBAL_RED_FLAGS.find((f) => f.id === flagId);
}

function firstUnclearedSafety(s: Session): number | null {
  const i = GLOBAL_RED_FLAGS.findIndex((f) => !s.red_flags_cleared.includes(f.id));
  return i === -1 ? null : i + 1;
}

function firstUnclearedWarning(s: Session, ruleId: string): number | null {
  const i = RULES_BY_ID[ruleId].red_flags.findIndex((f) => !s.rule_red_flags_cleared.includes(f.id));
  return i === -1 ? null : i + 1;
}

export interface Redirect {
  to: string;
  /** Remember the requested page and return to it after the safety check. */
  remember?: string;
}

/**
 * Enforces the order of the flow for any URL, including deep links:
 * safety check first, then the rule's warning signs, then questions,
 * and the result only after review.
 */
export function guard(r: Route, s: Session): Redirect | null {
  if (r.page === "safety") {
    const first = firstUnclearedSafety(s) ?? GLOBAL_RED_FLAGS.length;
    if (r.n > GLOBAL_RED_FLAGS.length) return { to: pathFor({ page: "safety", n: first }) };
    if (r.n > first) return { to: pathFor({ page: "safety", n: first }) };
    return null;
  }

  const needsSafety = ["symptom", "choose", "confirm", "warning", "question", "check", "review", "result"].includes(r.page);
  if (needsSafety) {
    const first = firstUnclearedSafety(s);
    if (first !== null) return { to: pathFor({ page: "safety", n: first }), remember: pathFor(r) };
  }

  if (r.page === "choose" && !s.complaint_text) return { to: "/symptom" };

  if (r.page === "warning" || r.page === "question" || r.page === "check" || r.page === "review" || r.page === "result") {
    if (s.rule_id !== r.rule) return { to: pathFor({ page: "confirm", rule: r.rule }) };
    const firstWarning = firstUnclearedWarning(s, r.rule);
    const nWarnings = RULES_BY_ID[r.rule].red_flags.length;
    if (r.page === "warning") {
      const cap = firstWarning ?? nWarnings;
      if (r.n > nWarnings || r.n > cap) return { to: pathFor({ page: "warning", rule: r.rule, n: cap }) };
      return null;
    }
    if (firstWarning !== null) return { to: pathFor({ page: "warning", rule: r.rule, n: firstWarning }) };
    // Pattern checks and red flag screens use one screen; scoring rules use one question per screen.
    const single = RULES_BY_ID[r.rule].assessment_type !== "scoring_algorithm";
    if (single && (r.page === "question" || r.page === "review")) return { to: pathFor({ page: "check", rule: r.rule }) };
    if (!single && r.page === "check") return { to: pathFor({ page: "question", rule: r.rule, n: 1 }) };
  }

  if (r.page === "result") {
    const ev = evaluate(RULES_BY_ID[r.rule], s.answers);
    const single = RULES_BY_ID[r.rule].assessment_type !== "scoring_algorithm";
    if (!s.completed_at || ev.blocked) return { to: pathFor({ page: single ? "check" : "review", rule: r.rule }) };
  }
  return null;
}

export function titleFor(r: Route, questionCount?: number): string {
  const rule = "rule" in r && r.rule ? RULES_BY_ID[r.rule] : undefined;
  const t = (() => {
    switch (r.page) {
      case "home":
        return "Symptom to care pathway";
      case "safety":
        return `Safety check ${r.n} of ${GLOBAL_RED_FLAGS.length}`;
      case "stop":
        return "Seek care now";
      case "symptom":
        return "What is your main symptom?";
      case "choose":
        return "Choose an assessment";
      case "confirm":
        return `${rule!.assessment_title} (${rule!.short_name})`;
      case "warning":
        return `${rule!.assessment_title}: warning sign ${r.n} of ${rule!.red_flags.length}`;
      case "question":
        return `${rule!.assessment_title}: question ${r.n}${questionCount ? ` of ${questionCount}` : ""}`;
      case "check":
        return rule!.assessment_type === "red_flag" ? `Emergency screening: ${rule!.condition}` : `${rule!.assessment_title} (${rule!.name})`;
      case "review":
        return `${rule!.assessment_title}: review answers`;
      case "result":
        return `${rule!.assessment_title}: result`;
      case "rules":
        return "Rules library";
      case "rule_detail":
        return rule!.name;
      case "about":
        return "How it works";
      case "find":
        return "Find a provider";
      case "not_found":
        return "Page not found";
    }
  })();
  return `${t} · OLA BOT`;
}
