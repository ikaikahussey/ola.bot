import { describe, expect, it } from "vitest";
import { evaluate, visibleItems } from "../src/engine/evaluate";
import { routeComplaint } from "../src/engine/router";
import { handoffSummary, traceLines } from "../src/engine/trace";
import type { Rule } from "../src/engine/types";
import { validateRule } from "../src/engine/validate";
import { COMPLAINT_MAP, RULES, RULES_BY_ID } from "../src/rules";

const route = (t: string) => routeComplaint(t, COMPLAINT_MAP, RULES);

describe("complaint router", () => {
  it.each([
    ["I have a sore throat", "centor_sore_throat"],
    ["Sore throat and fever since Tuesday", "centor_sore_throat"],
    ["rolled my ankle playing basketball", "ottawa_ankle"],
    ["knee pain after a fall", "ottawa_knee"],
    ["hurt the knee", "ottawa_knee"],
    ["I feel hopeless", "phq9"],
    ["burning when I pee", "uti_bent"],
    ["bad headache", "id_migraine"],
    ["my calf is swollen, worried about a blood clot", "wells_dvt"],
  ])("%s → %s", (text, id) => {
    expect(route(text)).toMatchObject({ kind: "match", rule_id: id });
  });

  it("is case and punctuation insensitive", () => {
    expect(route("SORE-THROAT!!!")).toMatchObject({ kind: "match", rule_id: "centor_sore_throat" });
  });

  it("emergency phrases stop the flow", () => {
    expect(route("crushing chest pain")).toMatchObject({ kind: "emergency", red_flag_id: "chest_pain" });
    expect(route("I can't breathe")).toMatchObject({ kind: "emergency", red_flag_id: "breathing" });
    expect(route("I want to kill myself")).toMatchObject({ kind: "emergency", red_flag_id: "self_harm" });
  });

  it("longest keyword wins", () => {
    // "sore throat" (11) beats "worried" (7)
    expect(route("worried about my sore throat")).toMatchObject({ kind: "match", rule_id: "centor_sore_throat" });
  });

  it("ties produce a menu", () => {
    const r = route("snoring and anxiety");
    expect(r.kind).toBe("ambiguous");
  });

  it("no match returns deterministic suggestions", () => {
    const a = route("my throat feels scratchy");
    expect(a.kind).toBe("none");
    if (a.kind === "none") expect(a.suggestions).toContain("centor_sore_throat");
    expect(route("my throat feels scratchy")).toEqual(a);
  });

  it("does not match partial words", () => {
    // "sad" must not match inside "crusade"
    expect(route("crusade")).toMatchObject({ kind: "none" });
  });
});

describe("evaluation mechanics", () => {
  const centor = RULES_BY_ID.centor_sore_throat;

  it("blocks when more than one item is missing", () => {
    const ev = evaluate(centor, { age_group: "15_44", fever: "yes", no_cough: "yes" });
    expect(ev.missing.map((m) => m.id)).toEqual(["tender_nodes", "exudate"]);
    expect(ev.blocked).toBe(true);
  });

  it("one missing item is allowed but flagged as limited", () => {
    const ev = evaluate(centor, { age_group: "15_44", fever: "yes", no_cough: "yes", tender_nodes: "no" });
    expect(ev.blocked).toBe(false);
    expect(ev.limited).toBe(true);
    expect(ev.score).toBe(2);
    expect(ev.worst_score).toBe(3);
    // Both 2 and 3 are "moderate", so no range note is needed.
    expect(ev.range_note).toBeNull();
    const ev2 = evaluate(centor, { age_group: "15_44", fever: "yes", no_cough: "yes", tender_nodes: "yes" });
    expect(ev2.range_note).toContain("could raise the score to 4");
  });

  it("is deterministic", () => {
    const a = { age_group: "3_14", fever: "unsure", no_cough: "yes", tender_nodes: "yes", exudate: "no" };
    expect(evaluate(centor, a)).toEqual(evaluate(centor, a));
  });

  it("trace shows every item with points, total, threshold", () => {
    const ev = evaluate(centor, { age_group: "15_44", fever: "yes", no_cough: "yes", tender_nodes: "yes", exudate: "no" });
    const text = traceLines(centor, ev).join("\n");
    expect(text).toContain("Fever ≥38°C (100.4°F): YES (+1)");
    expect(text).toContain("Tonsil swelling or white patches: NO (0)");
    expect(text).toContain("Total: 3 points");
    expect(text).toContain("Threshold:");
    expect(text).toContain("Recommendation: Rapid strep test");
  });

  it("decision trace lists the path", () => {
    const rule = RULES_BY_ID.ottawa_ankle;
    const ev = evaluate(rule, { ankle_zone_pain: "no", midfoot_pain: "yes", fifth_metatarsal_tender: "yes", navicular_tender: "no", unable_bear_weight: "no" });
    const text = traceLines(rule, ev).join("\n");
    expect(text).toContain("1. Ankle X-ray criteria met: NO");
    expect(text).toContain("2. Foot X-ray criteria met: YES → X-ray recommended");
  });

  it("handoff summary contains the result but no item-level answers", () => {
    const ev = evaluate(centor, { age_group: "15_44", fever: "yes", no_cough: "yes", tender_nodes: "yes", exudate: "no" });
    const s = handoffSummary({ rule: centor, ev, sessionId: "abc", timestamp: "2026-09-27T00:00:00Z" });
    expect(s).toContain("Score: 3");
    expect(s).toContain("Moderate likelihood of strep");
    expect(s).not.toMatch(/fever|cough|tonsil/i);
  });

  it("visible items follow show_if and ask dependents when parent is unsure", () => {
    const rule = RULES_BY_ID.ottawa_ankle;
    expect(visibleItems(rule, { ankle_zone_pain: "no", midfoot_pain: "no" }).map((i) => i.id)).toEqual(["ankle_zone_pain", "midfoot_pain", "unable_bear_weight"]);
    expect(visibleItems(rule, { ankle_zone_pain: "unsure" }).map((i) => i.id)).toContain("lateral_malleolus_tender");
  });
});

describe("validator catches defects", () => {
  const clone = (): Rule => JSON.parse(JSON.stringify(RULES_BY_ID.centor_sore_throat));
  it("undefined result", () => {
    const r = clone();
    r.scoring = { ...r.scoring, bands: [{ min: -1, max: 5, result: "nope" }] } as Rule["scoring"];
    expect(validateRule(r).join()).toContain('result "nope" is referenced but not defined');
  });
  it("score gap", () => {
    const r = clone();
    if (r.scoring.method === "sum") r.scoring.bands = r.scoring.bands.filter((b) => b.result !== "moderate");
    expect(validateRule(r).join()).toContain("score 2 has no unconditional band");
  });
  it("vague routing text", () => {
    const r = clone();
    r.results.low.recommendation = "Call your doctor.";
    expect(validateRule(r).join()).toContain("call your doctor");
  });
  it("all shipped rules pass", () => {
    expect(RULES.flatMap(validateRule)).toEqual([]);
  });
});
