import type { Evaluation } from "./evaluate";
import type { Answers, Rule } from "./types";

export interface Session {
  id: string;
  started_at: string;
  red_flags_cleared: string[];
  complaint_text: string;
  rule_id: string | null;
  rule_red_flags_cleared: string[];
  answers: Answers;
  completed_at: string | null;
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

export function newSession(): Session {
  return {
    id: newSessionId(),
    started_at: new Date().toISOString(),
    red_flags_cleared: [],
    complaint_text: "",
    rule_id: null,
    rule_red_flags_cleared: [],
    answers: {},
    completed_at: null,
  };
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} (${iso})`;
}

/** Payload for the consented outcome log. Contains answers but no free text. */
export function logPayload(session: Session, rule: Rule, ev: Evaluation) {
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(session.answers)) if (v !== undefined) answers[k] = v;
  return {
    consent: true as const,
    session_id: session.id,
    timestamp: session.completed_at ?? new Date().toISOString(),
    rule_id: rule.rule_id,
    rule_version: rule.version,
    answers,
    score: ev.score,
    result: ev.result,
    care_level: ev.result_def.care.level,
  };
}
