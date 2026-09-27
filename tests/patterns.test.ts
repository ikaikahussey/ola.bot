// Diagnostic confirmation and red flag rules (spec: "Diagnostic Confirmation & Red Flag Pathways").

import { describe, expect, it } from "vitest";
import { evaluate } from "../src/engine/evaluate";
import { handoffSummary, traceLines, windowStatus } from "../src/engine/trace";
import type { Answers } from "../src/engine/types";
import { RULES, RULES_BY_ID } from "../src/rules";

const run = (id: string, a: Answers) => evaluate(RULES_BY_ID[id], a);

describe("assessment types", () => {
  it("existing rules are scoring algorithms; new ones are typed correctly", () => {
    expect(RULES_BY_ID.centor_sore_throat.assessment_type).toBe("scoring_algorithm");
    expect(RULES_BY_ID.herpes_zoster_confirmation.assessment_type).toBe("diagnostic_confirmation");
    expect(RULES_BY_ID.acute_angle_closure_glaucoma.assessment_type).toBe("diagnostic_confirmation");
    expect(RULES_BY_ID.appendicitis_redflags.assessment_type).toBe("diagnostic_confirmation");
    expect(RULES_BY_ID.ami_redflags.assessment_type).toBe("red_flag");
    expect(RULES.filter((r) => r.assessment_type !== "scoring_algorithm")).toHaveLength(4);
  });
  it("pattern rules produce no numeric score", () => {
    const ev = run("herpes_zoster_confirmation", { rash_present: "yes", dermatomal_distribution: "yes", rash_onset_days: "1_to_3d", ophthalmic_involvement: "no", red_flag_symptoms: "" });
    expect(ev.method).toBe("pattern");
    expect(ev.score).toBeNull();
  });
});

describe("herpes zoster", () => {
  const typical = { rash_present: "yes", dermatomal_distribution: "yes", prodromal_pain: "yes", rash_onset_days: "1_to_3d", ophthalmic_involvement: "no", red_flag_symptoms: "" };

  it("rash + dermatomal within 3 days → consistent, antivirals today", () => {
    const ev = run("herpes_zoster_confirmation", typical);
    expect(ev.pattern?.id).toBe("consistent");
    expect(ev.pattern?.matched).toBe(true);
    expect(ev.result).toBe("antiviral_today");
    expect(ev.result_def.care.level).toBe("urgent_care");
  });
  it("72-hour window status follows onset", () => {
    const rule = RULES_BY_ID.herpes_zoster_confirmation;
    expect(windowStatus(rule, { rash_onset_days: "0_to_24h" })?.status?.state).toBe("open");
    expect(windowStatus(rule, { rash_onset_days: "1_to_3d" })?.status?.state).toBe("closing");
    expect(windowStatus(rule, { rash_onset_days: "4_to_7d" })?.status?.state).toBe("closed");
    expect(windowStatus(rule, {})?.status).toBeNull();
  });
  it("4–7 days → primary care this week; over 7 days → routine", () => {
    expect(run("herpes_zoster_confirmation", { ...typical, rash_onset_days: "4_to_7d" }).result).toBe("primary_week");
    expect(run("herpes_zoster_confirmation", { ...typical, rash_onset_days: "over_7d" }).result).toBe("primary_routine");
  });
  it("eye involvement → ED, regardless of pattern", () => {
    expect(run("herpes_zoster_confirmation", { ...typical, ophthalmic_involvement: "yes" }).result).toBe("ed_eye");
    expect(run("herpes_zoster_confirmation", { ...typical, red_flag_symptoms: "eye_pain" }).result).toBe("ed_eye");
    expect(run("herpes_zoster_confirmation", { ...typical, red_flag_symptoms: "neuro_symptoms,high_fever" }).result).toBe("ed_neuro");
  });
  it("spreading, fever, or infection → urgent care today", () => {
    expect(run("herpes_zoster_confirmation", { ...typical, red_flag_symptoms: "spreading" }).result).toBe("urgent_complication");
  });
  it("not one-sided → inconsistent, evaluation", () => {
    const ev = run("herpes_zoster_confirmation", { ...typical, dermatomal_distribution: "no" });
    expect(ev.pattern?.id).toBe("inconsistent");
    expect(ev.result).toBe("evaluate");
  });
  it("audit lists every finding present and absent, including checkbox options", () => {
    const rule = RULES_BY_ID.herpes_zoster_confirmation;
    const ev = run("herpes_zoster_confirmation", typical);
    const text = traceLines(rule, ev, typical).join("\n");
    expect(text).toContain("Assessment type: Diagnostic confirmation (not scored)");
    expect(text).toContain("Findings present:\n✓ Painful rash or blisters");
    expect(text).toContain("○ Rash near eye, forehead, or tip of nose");
    expect(text).toContain("○ High fever (over 102°F / 39°C)");
    expect(text).toContain("Conclusion: Pattern CONSISTENT with herpes zoster (shingles)");
    expect(text).toContain("72-hour window is closing");
    expect(ev.findings.filter((f) => f.state === "absent").map((f) => f.label)).toHaveLength(6);
  });
  it("unknown onset routes cautiously to same-day antivirals", () => {
    const ev = run("herpes_zoster_confirmation", { ...typical, rash_onset_days: "unsure" });
    expect(ev.result).toBe("antiviral_today");
    expect(ev.routed_cautiously).toBe(true);
  });
  it("optional items may be skipped; two required items missing blocks", () => {
    const { prodromal_pain: _p, red_flag_symptoms: _r, ...req } = typical;
    expect(run("herpes_zoster_confirmation", req).blocked).toBe(false);
    expect(run("herpes_zoster_confirmation", { rash_present: "yes", dermatomal_distribution: "yes", rash_onset_days: "1_to_3d" }).blocked).toBe(false);
    expect(run("herpes_zoster_confirmation", { rash_present: "yes", dermatomal_distribution: "yes" }).blocked).toBe(true);
  });
  it("handoff summary names the pattern, not raw answers", () => {
    const rule = RULES_BY_ID.herpes_zoster_confirmation;
    const s = handoffSummary({ rule, ev: run(rule.rule_id, typical), sessionId: "x", timestamp: "t" });
    expect(s).toContain("Pattern check: Pattern CONSISTENT with herpes zoster (shingles)");
  });
});

describe("acute angle-closure glaucoma", () => {
  const none = { acute_eye_pain: "no", halos: "no", vision_blur: "no", conjunctival_injection: "no", systemic_symptoms: "no", symptom_onset: "over_24h" };
  it("sudden pain + blurred vision → concerning, ED now", () => {
    const ev = run("acute_angle_closure_glaucoma", { ...none, acute_eye_pain: "yes", vision_blur: "yes", symptom_onset: "6_to_24h" });
    expect(ev.pattern?.id).toBe("concerning");
    expect(ev.result).toBe("ed_now");
    expect(ev.result_def.care.level).toBe("emergency_department");
  });
  it("sudden pain + halos → ED now", () => {
    expect(run("acute_angle_closure_glaucoma", { ...none, acute_eye_pain: "yes", halos: "yes" }).result).toBe("ed_now");
  });
  it("onset within 6 hours → ED now even without the full pattern", () => {
    const ev = run("acute_angle_closure_glaucoma", { ...none, symptom_onset: "1_to_6h" });
    expect(ev.pattern?.id).toBe("atypical");
    expect(ev.result).toBe("ed_now");
  });
  it("sudden pain alone, 6–24 hours → eye care immediately", () => {
    expect(run("acute_angle_closure_glaucoma", { ...none, acute_eye_pain: "yes", symptom_onset: "6_to_24h" }).result).toBe("eye_immediate");
  });
  it("atypical, older than 24 hours → same-day care", () => {
    const ev = run("acute_angle_closure_glaucoma", none);
    expect(ev.result).toBe("same_day");
    expect(ev.result_def.care.within).toBe("Today");
  });
});

describe("appendicitis", () => {
  const base = { pain_location: "rlq", pain_migration: "no", fever: "no", vomiting: "no", pain_severity: "mild", symptom_onset: "6_to_24h", complication_flags: "" };
  it("RLQ + fever + vomiting + moderate → high suspicion, ED today", () => {
    const ev = run("appendicitis_redflags", { ...base, fever: "yes", vomiting: "yes", pain_severity: "moderate" });
    expect(ev.pattern?.id).toBe("high");
    expect(ev.result).toBe("ed_today");
    expect(ev.result_def.care.self_care?.[0]).toContain("Do not eat or drink");
  });
  it("mild periumbilical pain within 24 hours → low suspicion, primary care today", () => {
    const ev = run("appendicitis_redflags", { ...base, pain_location: "periumbilical" });
    expect(ev.pattern?.id).toBe("low");
    expect(ev.result).toBe("primary_today");
    expect(ev.result_def.care.level).toBe("primary_care");
  });
  it("moderate periumbilical pain → moderate suspicion, urgent care or ED", () => {
    const ev = run("appendicitis_redflags", { ...base, pain_location: "periumbilical", pain_severity: "moderate" });
    expect(ev.pattern?.id).toBe("moderate");
    expect(ev.result).toBe("urgent_or_ed");
  });
  it("pain migration alone → ED today", () => {
    expect(run("appendicitis_redflags", { ...base, pain_location: "periumbilical", pain_migration: "yes" }).result).toBe("ed_today");
  });
  it("signs of shock → call 911", () => {
    const ev = run("appendicitis_redflags", { ...base, complication_flags: "shock_signs" });
    expect(ev.result).toBe("call_911");
    expect(ev.result_def.care.level).toBe("emergency_911");
  });
  it("mild pain for days → primary care in 1–2 days", () => {
    expect(run("appendicitis_redflags", { ...base, pain_location: "upper", symptom_onset: "over_3d" }).result).toBe("primary_soon");
  });
});

describe("cardiac red flag", () => {
  const none = { chest_pain_now: "no", pressure_quality: "no", radiation: "no", associated_symptoms: "no" };
  it.each(Object.keys(none))("%s = yes → emergency stop", (k) => {
    const ev = run("ami_redflags", { ...none, [k]: "yes" });
    expect(ev.result).toBe("emergency_stop");
    expect(ev.result_def.care.level).toBe("emergency_911");
  });
  it("all no → same-day evaluation", () => {
    expect(run("ami_redflags", none).result).toBe("same_day");
  });
  it("any unknown answer routes cautiously to 911", () => {
    expect(run("ami_redflags", { ...none, radiation: "unsure" }).result).toBe("emergency_stop");
  });
});
