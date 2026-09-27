// Outcome logging. Only called when the user ticks the consent box. Stores the
// session ID, rule, answers, score, and result. Does not store IP address,
// user agent, location, or free-text complaint.

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./npi";

export interface LogEntry {
  consent: true;
  session_id: string;
  timestamp: string;
  rule_id: string;
  rule_version: string;
  assessment_type: string;
  answers: Record<string, string>;
  score: number | null;
  result: string;
  care_level: string;
}

const ID = /^[a-z0-9_-]{1,64}$/i;
// Answer values: option ids, or comma-separated option ids for checkbox items ("" = none).
const ANSWER = /^[a-z0-9_,-]{0,300}$/i;
const TYPES = ["scoring_algorithm", "diagnostic_confirmation", "red_flag"];

export function validateLogEntry(body: unknown): LogEntry {
  const b = body as Partial<LogEntry> | null;
  if (!b || typeof b !== "object") throw new HttpError(400, "Invalid body");
  if (b.consent !== true) throw new HttpError(400, "Consent is required");
  if (typeof b.session_id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.session_id)) throw new HttpError(400, "Invalid session_id");
  if (typeof b.timestamp !== "string" || Number.isNaN(Date.parse(b.timestamp))) throw new HttpError(400, "Invalid timestamp");
  for (const k of ["rule_id", "result", "care_level"] as const) {
    if (typeof b[k] !== "string" || !ID.test(b[k] as string)) throw new HttpError(400, `Invalid ${k}`);
  }
  if (typeof b.rule_version !== "string" || !/^\d+\.\d+\.\d+$/.test(b.rule_version)) throw new HttpError(400, "Invalid rule_version");
  if (b.score !== null && typeof b.score !== "number") throw new HttpError(400, "Invalid score");
  const assessmentType = b.assessment_type ?? "scoring_algorithm";
  if (!TYPES.includes(assessmentType)) throw new HttpError(400, "Invalid assessment_type");
  const answers: Record<string, string> = {};
  if (!b.answers || typeof b.answers !== "object") throw new HttpError(400, "Invalid answers");
  for (const [k, v] of Object.entries(b.answers)) {
    if (!ID.test(k) || typeof v !== "string" || !ANSWER.test(v)) throw new HttpError(400, "Invalid answers");
    answers[k] = v;
  }
  return {
    consent: true,
    session_id: b.session_id,
    timestamp: b.timestamp,
    rule_id: b.rule_id!,
    rule_version: b.rule_version,
    assessment_type: assessmentType,
    answers,
    score: b.score ?? null,
    result: b.result!,
    care_level: b.care_level!,
  };
}

export async function writeLog(entry: LogEntry, dir = process.env.LOG_DIR ?? "data"): Promise<void> {
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "outcome-log.jsonl"), JSON.stringify(entry) + "\n", "utf8");
}
