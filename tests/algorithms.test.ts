// One block per algorithm: known inputs → expected result. These are the
// executable specification of each rule file.

import { describe, expect, it } from "vitest";
import { evaluate } from "../src/engine/evaluate";
import type { Answers } from "../src/engine/types";
import { RULES_BY_ID } from "../src/rules";

const run = (id: string, answers: Answers) => evaluate(RULES_BY_ID[id], answers);

describe("centor_sore_throat (McIsaac)", () => {
  const base = { age_group: "15_44", fever: "yes", no_cough: "yes", tender_nodes: "yes", exudate: "no" };
  it("score 3 maps to moderate", () => {
    const ev = run("centor_sore_throat", base);
    expect(ev.score).toBe(3);
    expect(ev.result).toBe("moderate");
    expect(ev.result_def.care.level).toBe("urgent_care");
  });
  it("score 0 maps to low / self-care", () => {
    const ev = run("centor_sore_throat", { age_group: "15_44", fever: "no", no_cough: "no", tender_nodes: "no", exudate: "no" });
    expect(ev.score).toBe(0);
    expect(ev.result).toBe("low");
    expect(ev.result_def.care.level).toBe("self_care");
  });
  it("age 45+ subtracts a point", () => {
    expect(run("centor_sore_throat", { ...base, age_group: "45_plus" }).score).toBe(2);
  });
  it("child 3-14 with all criteria scores 5 (high)", () => {
    const ev = run("centor_sore_throat", { ...base, age_group: "3_14", exudate: "yes" });
    expect(ev.score).toBe(5);
    expect(ev.result).toBe("high");
  });
  it("under 3 is outside the validated range", () => {
    expect(run("centor_sore_throat", { ...base, age_group: "under_3" }).result).toBe("not_applicable");
  });
  it("score -1 is low", () => {
    const ev = run("centor_sore_throat", { age_group: "45_plus", fever: "no", no_cough: "no", tender_nodes: "no", exudate: "no" });
    expect(ev.score).toBe(-1);
    expect(ev.result).toBe("low");
  });
});

describe("ottawa_ankle", () => {
  const none = { ankle_zone_pain: "no", midfoot_pain: "no", unable_bear_weight: "no" };
  it("no criteria → no X-ray", () => expect(run("ottawa_ankle", none).result).toBe("no_xray"));
  it("ankle-zone pain + lateral malleolus tenderness → X-ray", () => {
    const ev = run("ottawa_ankle", { ...none, ankle_zone_pain: "yes", lateral_malleolus_tender: "yes", medial_malleolus_tender: "no" });
    expect(ev.result).toBe("xray");
    expect(ev.result_reason).toBe("Ankle X-ray criteria met");
  });
  it("ankle-zone pain without tenderness and able to walk → no X-ray", () => {
    expect(run("ottawa_ankle", { ...none, ankle_zone_pain: "yes", lateral_malleolus_tender: "no", medial_malleolus_tender: "no" }).result).toBe("no_xray");
  });
  it("midfoot pain + navicular tenderness → X-ray", () => {
    const ev = run("ottawa_ankle", { ...none, midfoot_pain: "yes", fifth_metatarsal_tender: "no", navicular_tender: "yes" });
    expect(ev.result).toBe("xray");
    expect(ev.result_reason).toBe("Foot X-ray criteria met");
  });
  it("inability to bear weight alone without zone pain → no X-ray", () => {
    expect(run("ottawa_ankle", { ...none, unable_bear_weight: "yes" }).result).toBe("no_xray");
  });
  it("unsure on a critical tenderness item routes cautiously to X-ray", () => {
    const ev = run("ottawa_ankle", { ...none, ankle_zone_pain: "yes", lateral_malleolus_tender: "unsure", medial_malleolus_tender: "no" });
    expect(ev.base_result).toBe("no_xray");
    expect(ev.result).toBe("xray");
    expect(ev.routed_cautiously).toBe(true);
  });
});

describe("ottawa_knee", () => {
  const none = { age_55: "no", patella_only_tender: "no", fibula_head_tender: "no", cannot_flex_90: "no", unable_bear_weight: "no" };
  it("no criteria → no X-ray", () => expect(run("ottawa_knee", none).result).toBe("no_xray"));
  it.each(Object.keys(none))("%s alone → X-ray", (k) => expect(run("ottawa_knee", { ...none, [k]: "yes" }).result).toBe("xray"));
});

describe("canadian_cspine", () => {
  const lowRisk = { age_65: "no", dangerous_mechanism: "no", paresthesias: "no", simple_rear_end: "yes", sitting_up: "yes", ambulatory: "yes", delayed_onset: "no", midline_tender: "no" };
  it("high-risk factor → imaging", () => expect(run("canadian_cspine", { ...lowRisk, age_65: "yes" }).result).toBe("imaging"));
  it("low-risk factor and can rotate → no imaging", () => expect(run("canadian_cspine", { ...lowRisk, can_rotate: "yes" }).result).toBe("no_imaging"));
  it("low-risk factor but cannot rotate → imaging", () => {
    const ev = run("canadian_cspine", { ...lowRisk, can_rotate: "no" });
    expect(ev.result).toBe("imaging");
    expect(ev.result_reason).toContain("Unable to turn neck");
  });
  it("no low-risk factor → imaging", () => {
    const ev = run("canadian_cspine", { ...lowRisk, simple_rear_end: "no", sitting_up: "no", ambulatory: "no", delayed_onset: "no", midline_tender: "yes" });
    expect(ev.result).toBe("imaging");
    expect(ev.result_reason).toBe("No low-risk factor present");
  });
  it("rotation question is not shown when a high-risk factor is present", () => {
    const ev = run("canadian_cspine", { ...lowRisk, dangerous_mechanism: "yes" });
    expect(ev.items.find((i) => i.id === "can_rotate")?.status).toBe("not_applicable");
  });
});

describe("canadian_ct_head", () => {
  const minor = { age_group: "16_64", anticoagulant: "no", loc_amnesia_confusion: "yes", not_alert_2h: "no", skull_fracture: "no", basal_skull_signs: "no", vomiting_2: "no", amnesia_before_30: "no", dangerous_mechanism: "no" };
  it("no risk factors → low", () => expect(run("canadian_ct_head", minor).result).toBe("low"));
  it("vomiting twice → high", () => expect(run("canadian_ct_head", { ...minor, vomiting_2: "yes" }).result).toBe("high"));
  it("age 65+ → high", () => expect(run("canadian_ct_head", { ...minor, age_group: "65_plus" }).result).toBe("high"));
  it("dangerous mechanism → medium", () => expect(run("canadian_ct_head", { ...minor, dangerous_mechanism: "yes" }).result).toBe("medium"));
  it("no LOC/amnesia/confusion → rule does not apply", () => expect(run("canadian_ct_head", { age_group: "16_64", anticoagulant: "no", loc_amnesia_confusion: "no" }).result).toBe("no_criteria"));
  it("blood thinner overrides to ED", () => expect(run("canadian_ct_head", { ...minor, anticoagulant: "yes" }).result).toBe("anticoagulated"));
  it("child → not applicable", () => expect(run("canadian_ct_head", { ...minor, age_group: "under_16" }).result).toBe("child"));
});

const phqAll = (v: string) => Object.fromEntries(["interest", "down", "sleep", "tired", "appetite", "failure", "concentration", "psychomotor", "self_harm"].map((k) => [k, v]));

describe("phq9", () => {
  it("all 'not at all' → 0 minimal", () => {
    const ev = run("phq9", phqAll("0"));
    expect(ev.score).toBe(0);
    expect(ev.result).toBe("minimal");
  });
  it("score 10 → moderate", () => {
    const ev = run("phq9", { ...phqAll("1"), interest: "2", down: "1", self_harm: "0" });
    expect(ev.score).toBe(9);
    expect(ev.result).toBe("mild");
    const ev2 = run("phq9", { ...phqAll("1"), interest: "2", down: "2", self_harm: "0" });
    expect(ev2.score).toBe(10);
    expect(ev2.result).toBe("moderate");
  });
  it("score 27 → crisis because item 9 is positive", () => {
    const ev = run("phq9", phqAll("3"));
    expect(ev.score).toBe(27);
    expect(ev.result).toBe("crisis");
  });
  it("any positive item 9 → crisis regardless of total", () => {
    expect(run("phq9", { ...phqAll("0"), self_harm: "1" }).result).toBe("crisis");
  });
  it("band edges", () => {
    const at = (n: number) => {
      const a = phqAll("0");
      const keys = Object.keys(a).filter((k) => k !== "self_harm");
      let left = n;
      for (const k of keys) {
        const v = Math.min(3, left);
        a[k] = String(v);
        left -= v;
      }
      return run("phq9", a).result;
    };
    expect([4, 5, 9, 10, 14, 15, 19, 20, 24].map(at)).toEqual(["minimal", "mild", "mild", "moderate", "moderate", "mod_severe", "mod_severe", "severe", "severe"]);
  });
  it("unanswered item 9 routes cautiously to crisis", () => {
    const a = phqAll("0");
    delete a.self_harm;
    const ev = run("phq9", a);
    expect(ev.result).toBe("crisis");
    expect(ev.routed_cautiously).toBe(true);
  });
});

describe("gad7", () => {
  const all = (v: string) => Object.fromEntries(["nervous", "control", "worry_much", "relax", "restless", "irritable", "afraid"].map((k) => [k, v]));
  it("0 → minimal", () => expect(run("gad7", all("0")).result).toBe("minimal"));
  it("7 → mild", () => expect(run("gad7", all("1")).result).toBe("mild"));
  it("14 → moderate", () => expect(run("gad7", all("2")).result).toBe("moderate"));
  it("21 → severe", () => expect(run("gad7", all("3")).result).toBe("severe"));
});

describe("pc_ptsd5", () => {
  it("no trauma exposure → negative, symptom items not asked", () => {
    const ev = run("pc_ptsd5", { trauma_exposure: "no" });
    expect(ev.result).toBe("negative");
    expect(ev.missing).toHaveLength(0);
  });
  it("3 yes → positive", () => {
    expect(run("pc_ptsd5", { trauma_exposure: "yes", nightmares: "yes", avoid: "yes", on_guard: "yes", numb: "no", guilt: "no" }).result).toBe("positive");
  });
  it("2 yes → negative", () => {
    expect(run("pc_ptsd5", { trauma_exposure: "yes", nightmares: "yes", avoid: "yes", on_guard: "no", numb: "no", guilt: "no" }).result).toBe("negative");
  });
});

describe("audit_c", () => {
  it("men: 4 is positive, 3 is negative", () => {
    expect(run("audit_c", { sex: "male", frequency: "2_3_week", typical: "3_4", six_plus: "never" }).result).toBe("positive");
    expect(run("audit_c", { sex: "male", frequency: "2_3_week", typical: "1_2", six_plus: "never" }).result).toBe("negative");
  });
  it("women: 3 is positive", () => {
    expect(run("audit_c", { sex: "female", frequency: "2_3_week", typical: "1_2", six_plus: "never" }).result).toBe("positive");
  });
  it("8+ is high for anyone", () => {
    const ev = run("audit_c", { sex: "male", frequency: "4_week", typical: "5_6", six_plus: "weekly" });
    expect(ev.score).toBe(9);
    expect(ev.result).toBe("high");
  });
  it("never drinks → follow-up questions skipped, score 0", () => {
    const ev = run("audit_c", { sex: "female", frequency: "never" });
    expect(ev.score).toBe(0);
    expect(ev.missing).toHaveLength(0);
  });
});

describe("stop_bang", () => {
  const all = (v: string) => Object.fromEntries(["snoring", "tired", "observed", "pressure", "bmi", "age", "neck", "male"].map((k) => [k, v]));
  it("0 → low", () => expect(run("stop_bang", all("no")).result).toBe("low"));
  it("3 → intermediate", () => expect(run("stop_bang", { ...all("no"), snoring: "yes", tired: "yes", male: "yes" }).result).toBe("intermediate"));
  it("8 → high", () => expect(run("stop_bang", all("yes")).result).toBe("high"));
});

describe("ipss", () => {
  const all = (v: string) => Object.fromEntries(["emptying", "frequency", "intermittency", "urgency", "weak_stream", "straining", "nocturia"].map((k) => [k, v]));
  it("7 → mild", () => expect(run("ipss", all("1")).result).toBe("mild"));
  it("14 → moderate", () => expect(run("ipss", all("2")).result).toBe("moderate"));
  it("35 → severe", () => expect(run("ipss", all("5")).result).toBe("severe"));
});

describe("uti_bent", () => {
  const f = { sex: "female", pregnant: "no", fever_flank: "no", dysuria: "no", frequency: "no", hematuria: "no", discharge: "no", irritation: "no" };
  it("dysuria + frequency without discharge → high", () => expect(run("uti_bent", { ...f, dysuria: "yes", frequency: "yes" }).result).toBe("high"));
  it("with discharge → other cause", () => expect(run("uti_bent", { ...f, dysuria: "yes", frequency: "yes", discharge: "yes" }).result).toBe("other_cause"));
  it("one symptom → intermediate", () => expect(run("uti_bent", { ...f, dysuria: "yes" }).result).toBe("intermediate"));
  it("no symptoms → unlikely", () => expect(run("uti_bent", f).result).toBe("unlikely"));
  it("fever/flank → kidney", () => expect(run("uti_bent", { ...f, dysuria: "yes", fever_flank: "yes" }).result).toBe("kidney"));
  it("pregnant → pregnant", () => expect(run("uti_bent", { ...f, dysuria: "yes", pregnant: "yes" }).result).toBe("pregnant"));
  it("male → not applicable", () => expect(run("uti_bent", { sex: "male", fever_flank: "no", dysuria: "yes", frequency: "yes", hematuria: "no" }).result).toBe("male"));
});

describe("start_back", () => {
  const ids = ["leg", "shoulder_neck", "walk", "dressed", "unsafe", "worry", "terrible", "enjoy"];
  const mk = (agree: string[], bother = "slightly") => ({ ...Object.fromEntries(ids.map((k) => [k, agree.includes(k) ? "agree" : "disagree"])), bothersome: bother });
  it("total 3 → low", () => expect(run("start_back", mk(["leg", "walk", "dressed"])).result).toBe("low"));
  it("total 4 with psychosocial 1 → medium", () => {
    const ev = run("start_back", mk(["leg", "shoulder_neck", "walk", "worry"]));
    expect(ev.score).toBe(4);
    expect(ev.subscales.psychosocial).toBe(1);
    expect(ev.result).toBe("medium");
  });
  it("psychosocial 4 → high", () => {
    const ev = run("start_back", mk(["unsafe", "worry", "terrible"], "extremely"));
    expect(ev.subscales.psychosocial).toBe(4);
    expect(ev.result).toBe("high");
  });
});

describe("id_migraine", () => {
  it("2 of 3 → positive", () => expect(run("id_migraine", { disability: "yes", nausea: "yes", photophobia: "no" }).result).toBe("positive"));
  it("1 of 3 → negative", () => expect(run("id_migraine", { disability: "yes", nausea: "no", photophobia: "no" }).result).toBe("negative"));
});

describe("idsa_sinusitis", () => {
  const none = { persistent_10: "no", high_fever: "no", purulent_early: "no", double_sickening: "no" };
  it("no criteria → viral", () => expect(run("idsa_sinusitis", none).result).toBe("viral"));
  it("10+ days → bacterial", () => expect(run("idsa_sinusitis", { ...none, persistent_10: "yes" }).result).toBe("bacterial"));
  it("fever alone is not severe onset", () => expect(run("idsa_sinusitis", { ...none, high_fever: "yes" }).result).toBe("viral"));
  it("fever + purulent discharge → bacterial", () => expect(run("idsa_sinusitis", { ...none, high_fever: "yes", purulent_early: "yes" }).result).toBe("bacterial"));
  it("double sickening → bacterial", () => expect(run("idsa_sinusitis", { ...none, double_sickening: "yes" }).result).toBe("bacterial"));
});

describe("crb65_cough", () => {
  const none = { confusion: "no", resp_rate: "no", low_bp: "no", age_65: "no" };
  it("0 → low", () => expect(run("crb65_cough", none).result).toBe("low"));
  it("2 → intermediate", () => expect(run("crb65_cough", { ...none, age_65: "yes", low_bp: "yes" }).result).toBe("intermediate"));
  it("3 → high / ED", () => {
    const ev = run("crb65_cough", { ...none, age_65: "yes", low_bp: "yes", resp_rate: "yes" });
    expect(ev.result).toBe("high");
    expect(ev.result_def.care.level).toBe("emergency_department");
  });
  it("unknown blood pressure is shown as a range but not routed cautiously", () => {
    const ev = run("crb65_cough", { ...none, low_bp: "unsure" });
    expect(ev.result).toBe("low");
    expect(ev.worst_result).toBe("intermediate");
    expect(ev.range_note).toContain("intermediate".replace("intermediate", "Intermediate"));
  });
});

describe("wells_dvt", () => {
  const none = Object.fromEntries(["cancer", "paralysis_cast", "bedridden_surgery", "vein_tenderness", "entire_leg", "calf_3cm", "pitting", "collateral_veins", "previous_dvt"].map((k) => [k, "no"]));
  it("1 → unlikely", () => expect(run("wells_dvt", { ...none, pitting: "yes" }).result).toBe("unlikely"));
  it("2 → likely", () => expect(run("wells_dvt", { ...none, pitting: "yes", cancer: "yes" }).result).toBe("likely"));
  it("clinician-only item is shown and scored 0", () => {
    const item = run("wells_dvt", none).items.find((i) => i.id === "alternative_dx")!;
    expect(item.status).toBe("clinician_only");
    expect(item.points).toBe(0);
  });
});
