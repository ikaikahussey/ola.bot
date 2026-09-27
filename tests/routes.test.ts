import { describe, expect, it } from "vitest";
import { newSession, type Session } from "../src/engine/session";
import { GLOBAL_RED_FLAGS, RULES, RULES_BY_ID } from "../src/rules";
import { guard, parsePath, pathFor, titleFor, type Route } from "../src/ui/routes";

const cleared = (extra: Partial<Session> = {}): Session => ({
  ...newSession(),
  red_flags_cleared: GLOBAL_RED_FLAGS.map((f) => f.id),
  ...extra,
});

describe("parsePath / pathFor", () => {
  const samples: Route[] = [
    { page: "home" },
    { page: "safety", n: 3 },
    { page: "stop", flag: "chest_pain" },
    { page: "stop", rule: "centor_sore_throat", flag: "trismus" },
    { page: "symptom" },
    { page: "choose" },
    { page: "confirm", rule: "ottawa_ankle" },
    { page: "warning", rule: "ottawa_ankle", n: 2 },
    { page: "question", rule: "phq9", n: 9 },
    { page: "review", rule: "phq9" },
    { page: "result", rule: "phq9" },
    { page: "rules" },
    { page: "rule_detail", rule: "gad7" },
    { page: "about" },
  ];
  it.each(samples.map((r) => [pathFor(r), r] as const))("%s round-trips", (path, r) => {
    expect(parsePath(path)).toEqual(r);
  });

  it("every rule has a detail page and an assessment page", () => {
    for (const r of RULES) {
      expect(parsePath(`/assessments/${r.rule_id}`)).toEqual({ page: "rule_detail", rule: r.rule_id });
      expect(parsePath(`/assess/${r.rule_id}`)).toEqual({ page: "confirm", rule: r.rule_id });
    }
  });

  it("ignores a trailing slash", () => {
    expect(parsePath("/assessments/")).toEqual({ page: "rules" });
  });

  it("old /rules addresses still parse and canonicalize to /assessments", () => {
    expect(pathFor(parsePath("/rules"))).toBe("/assessments");
    expect(pathFor(parsePath("/rules/phq9"))).toBe("/assessments/phq9");
  });

  it.each(["/nope", "/assess/not_a_rule", "/rules/../etc", "/safety/0", "/stop/not_a_flag", "/assess/phq9/q/0"])("%s is not found", (p) => {
    expect(parsePath(p)).toEqual({ page: "not_found" });
  });
});

describe("guard", () => {
  it("safety check cannot be skipped ahead", () => {
    expect(guard({ page: "safety", n: 5 }, newSession())).toEqual({ to: "/safety/1" });
    expect(guard({ page: "safety", n: 1 }, newSession())).toBeNull();
  });

  it("symptom entry requires the safety check; direct assessment links do not", () => {
    expect(guard({ page: "symptom" }, newSession())).toEqual({ to: "/safety/1", remember: "/symptom" });
    expect(guard({ page: "symptom" }, { ...newSession(), red_flags_cleared: ["chest_pain"] })).toEqual({ to: "/safety/2", remember: "/symptom" });
    expect(guard({ page: "confirm", rule: "phq9" }, newSession())).toBeNull();
    expect(guard({ page: "question", rule: "phq9", n: 1 }, { ...newSession(), rule_id: "phq9" })).toBeNull();
    // Rule-specific warning signs still come first.
    expect(guard({ page: "question", rule: "ottawa_ankle", n: 1 }, { ...newSession(), rule_id: "ottawa_ankle" })).toEqual({ to: "/assess/ottawa_ankle/warning/1" });
  });

  it("questions require the rule to be selected and its warning signs cleared", () => {
    expect(guard({ page: "question", rule: "ottawa_ankle", n: 1 }, cleared())).toEqual({ to: "/assess/ottawa_ankle" });
    expect(guard({ page: "question", rule: "ottawa_ankle", n: 1 }, cleared({ rule_id: "ottawa_ankle" }))).toEqual({
      to: "/assess/ottawa_ankle/warning/1",
    });
    const flags = RULES_BY_ID.ottawa_ankle.red_flags.map((f) => f.id);
    expect(guard({ page: "question", rule: "ottawa_ankle", n: 1 }, cleared({ rule_id: "ottawa_ankle", rule_red_flags_cleared: flags }))).toBeNull();
  });

  it("result requires a completed, unblocked review", () => {
    const s = cleared({ rule_id: "phq9" }); // phq9 has no warning signs
    expect(guard({ page: "result", rule: "phq9" }, s)).toEqual({ to: "/assess/phq9/review" });
    const answers = Object.fromEntries(["interest", "down", "sleep", "tired", "appetite", "failure", "concentration", "psychomotor", "self_harm"].map((k) => [k, "0"]));
    expect(guard({ page: "result", rule: "phq9" }, { ...s, answers, completed_at: "2026-09-27T00:00:00Z" })).toBeNull();
    expect(guard({ page: "result", rule: "phq9" }, { ...s, answers: {}, completed_at: "2026-09-27T00:00:00Z" })).toEqual({ to: "/assess/phq9/review" });
  });

  it("library, about, and home need no session", () => {
    for (const r of [{ page: "rules" }, { page: "about" }, { page: "home" }, { page: "rule_detail", rule: "phq9" }] as Route[]) {
      expect(guard(r, newSession())).toBeNull();
    }
  });

  it("choose page requires typed text", () => {
    expect(guard({ page: "choose" }, cleared())).toEqual({ to: "/symptom" });
  });
});

describe("titles", () => {
  it("are page-specific", () => {
    expect(titleFor({ page: "question", rule: "centor_sore_throat", n: 2 }, 5)).toBe("Sore throat assessment: question 2 of 5 · OLA BOT");
    expect(titleFor({ page: "rule_detail", rule: "ottawa_ankle" })).toBe("Ankle and foot injury assessment · OLA BOT");
    expect(titleFor({ page: "rules" })).toBe("Assessments · OLA BOT");
  });
});
