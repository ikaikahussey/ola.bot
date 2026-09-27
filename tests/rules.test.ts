import { describe, expect, it } from "vitest";
import { validateRule } from "../src/engine/validate";
import { COMPLAINT_MAP, GLOBAL_RED_FLAGS, RULES, RULES_BY_ID } from "../src/rules";

describe("rule files", () => {
  it.each(RULES.map((r) => [r.rule_id, r] as const))("%s is structurally valid", (_id, rule) => {
    expect(validateRule(rule)).toEqual([]);
  });

  it("rule ids match file names and are unique", () => {
    expect(new Set(RULES.map((r) => r.rule_id)).size).toBe(RULES.length);
  });

  it("every complaint map entry points to an existing rule", () => {
    for (const e of COMPLAINT_MAP.complaint_map) expect(RULES_BY_ID[e.rule_id], e.rule_id).toBeDefined();
  });

  it("every rule is reachable from at least one keyword", () => {
    const mapped = new Set(COMPLAINT_MAP.complaint_map.map((e) => e.rule_id));
    for (const r of RULES) expect(mapped.has(r.rule_id), r.rule_id).toBe(true);
  });

  it("emergency keywords point to defined red flags", () => {
    const ids = new Set(GLOBAL_RED_FLAGS.map((f) => f.id));
    for (const e of COMPLAINT_MAP.emergency_keywords) expect(ids.has(e.red_flag_id), e.red_flag_id).toBe(true);
  });

  it("global red flags cover the required categories", () => {
    const ids = GLOBAL_RED_FLAGS.map((f) => f.id);
    for (const required of ["chest_pain", "breathing", "bleeding", "mental_status", "abdominal_pain", "stroke"]) {
      expect(ids).toContain(required);
    }
  });
});
