import { createServer, type Server } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHandler } from "../server/app";
import { buildQueryUrls, parseNpiResult, type Fetcher } from "../server/npi";

// Shape follows the NPPES API v2.1 response.
const fixture = {
  result_count: 3,
  results: [
    {
      number: 1234567893,
      enumeration_type: "NPI-2",
      basic: { organization_name: "KAIMUKI URGENT CARE LLC" },
      addresses: [
        { address_purpose: "MAILING", address_1: "PO BOX 1", city: "HONOLULU", state: "HI", postal_code: "96801" },
        { address_purpose: "LOCATION", address_1: "1000 WAIALAE AVE", city: "HONOLULU", state: "HI", postal_code: "968161234", telephone_number: "808-555-0100" },
      ],
      taxonomies: [{ desc: "Clinic/Center, Urgent Care", primary: true }],
    },
    {
      number: "1987654321",
      enumeration_type: "NPI-1",
      basic: { first_name: "JANE", last_name: "DOE", credential: "MD" },
      addresses: [{ address_purpose: "LOCATION", address_1: "50 MAIN ST", city: "HILO", state: "HI", postal_code: "96720", telephone_number: "8085550101" }],
      taxonomies: [{ desc: "Family Medicine", primary: true }],
    },
    { number: "bad" },
  ],
};

const calls: string[] = [];
const fakeFetch: Fetcher = async (url) => {
  calls.push(url);
  return { ok: true, status: 200, json: async () => fixture };
};

let server: Server;
let base: string;
let logDir: string;

beforeAll(async () => {
  logDir = await mkdtemp(path.join(os.tmpdir(), "olabot-"));
  server = createServer(createHandler({ fetcher: fakeFetch, logDir }));
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => server.close());

describe("NPI parsing", () => {
  it("uses the practice location, formats names and phones", () => {
    const p = parseNpiResult(fixture.results[0], { latitude: 21.3, longitude: -157.85 })!;
    expect(p.name).toBe("Kaimuki Urgent Care LLC");
    expect(p.address).toBe("1000 Waialae Ave");
    expect(p.zip).toBe("96816");
    expect(p.phone).toBe("(808) 555-0100");
    expect(p.distance_miles).toBeLessThan(5);
    const d = parseNpiResult(fixture.results[1], null)!;
    expect(d.name).toBe("Jane Doe, MD");
    expect(parseNpiResult(fixture.results[2], null)).toBeNull();
  });

  it("builds wildcard ZIP-prefix queries", () => {
    const [u] = buildQueryUrls(["Urgent Care"], ["968"]);
    const q = new URL(u).searchParams;
    expect(q.get("postal_code")).toBe("968*");
    expect(q.get("taxonomy_description")).toBe("Urgent Care");
    expect(q.get("version")).toBe("2.1");
  });
});

describe("GET /api/providers", () => {
  it("returns providers within radius sorted by distance, and declares missing fields", async () => {
    const res = await fetch(`${base}/api/providers?specialty=urgent_care&zip=96813&radius=10`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.map((r: { name: string }) => r.name)).toEqual(["Kaimuki Urgent Care LLC"]); // Hilo is >10 mi away
    expect(body.unavailable_fields).toContain("insurance networks");
    expect(body.source.name).toContain("NPI");
    expect(calls.length).toBeGreaterThan(0);
  });

  it("rejects bad ZIP and unknown specialty", async () => {
    expect((await fetch(`${base}/api/providers?specialty=urgent_care&zip=abc`)).status).toBe(400);
    expect((await fetch(`${base}/api/providers?specialty=wizard&zip=96813`)).status).toBe(400);
  });

  it("telehealth returns a notice instead of fabricated results", async () => {
    const body = await (await fetch(`${base}/api/providers?specialty=telehealth&zip=96813`)).json();
    expect(body.results).toEqual([]);
    expect(body.notices[0]).toContain("telehealth");
  });

  it("resolves coordinates to the nearest ZIP", async () => {
    const body = await (await fetch(`${base}/api/providers?specialty=primary_care&lat=21.31&lon=-157.85&radius=5`)).json();
    expect(body.center.state).toBe("HI");
  });
});

describe("POST /api/log", () => {
  const entry = {
    consent: true,
    session_id: "123e4567-e89b-42d3-a456-426614174000",
    timestamp: "2026-09-27T10:00:00.000Z",
    rule_id: "centor_sore_throat",
    rule_version: "1.0.0",
    answers: { fever: "yes", age_group: "15_44" },
    score: 3,
    result: "moderate",
    care_level: "urgent_care",
  };
  it("stores consented entries", async () => {
    const res = await fetch(`${base}/api/log`, { method: "POST", body: JSON.stringify(entry) });
    expect(res.status).toBe(201);
    const text = await readFile(path.join(logDir, "outcome-log.jsonl"), "utf8");
    expect(JSON.parse(text.trim().split("\n")[0])).toEqual({ ...entry, assessment_type: "scoring_algorithm" });
  });
  it("rejects entries without consent or with free text", async () => {
    expect((await fetch(`${base}/api/log`, { method: "POST", body: JSON.stringify({ ...entry, consent: false }) })).status).toBe(400);
    expect((await fetch(`${base}/api/log`, { method: "POST", body: JSON.stringify({ ...entry, answers: { note: "my name is Bob" } }) })).status).toBe(400);
  });
});

describe("POST /api/assessments/:id/submit", () => {
  const post = (id: string, body: unknown) =>
    fetch(`${base}/api/assessments/${id}/submit`, { method: "POST", body: JSON.stringify(body) });

  it("diagnostic confirmation returns pattern, routing, and full audit trail", async () => {
    const res = await post("herpes_zoster_confirmation", {
      assessment_type: "diagnostic_confirmation",
      answers: {
        rash_present: true,
        dermatomal_distribution: true,
        prodromal_pain: true,
        rash_onset_days: "1_to_3d",
        ophthalmic_involvement: false,
        red_flag_symptoms: [],
      },
    });
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.result).toBe("antiviral_today");
    expect(b.pattern).toEqual({ id: "consistent", label: "Pattern CONSISTENT with herpes zoster (shingles)", matched: true });
    expect(b.routing.care_level).toBe("urgent_care");
    expect(b.audit_trail.findings_present).toContain("Painful rash or blisters");
    expect(b.audit_trail.findings_absent).toContain("Eye pain or vision changes");
    expect(b.audit_trail.pattern_match).toBe(true);
    expect(b.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.logged).toBe(false);
  });

  it("red flag returns the emergency-only UI action", async () => {
    const b = await (await post("ami_redflags", { assessment_type: "red_flag", answers: { chest_pain_now: true } })).json();
    expect(b.result).toBe("emergency_stop");
    expect(b.message).toBe("CALL 911 IMMEDIATELY");
    expect(b.ui_action).toBe("show_emergency_screen_only");
  });

  it("scoring rules work through the same endpoint", async () => {
    const b = await (
      await post("centor_sore_throat", { answers: { age_group: "15_44", fever: true, no_cough: true, tender_nodes: true, exudate: false } })
    ).json();
    expect(b.score).toBe(3);
    expect(b.result).toBe("moderate");
  });

  it("logs only with consent, including the assessment type", async () => {
    const b = await (
      await post("acute_angle_closure_glaucoma", {
        answers: { acute_eye_pain: true, vision_blur: true, symptom_onset: "1_to_6h" },
        user_consent_logged: true,
      })
    ).json();
    expect(b.logged).toBe(true);
    const lines = (await readFile(path.join(logDir, "outcome-log.jsonl"), "utf8")).trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last).toMatchObject({ rule_id: "acute_angle_closure_glaucoma", assessment_type: "diagnostic_confirmation", result: "ed_now", care_level: "emergency_department" });
    expect(last).not.toHaveProperty("ip_address");
  });

  it("rejects wrong type, unknown items, bad values, and too many missing answers", async () => {
    expect((await post("ami_redflags", { assessment_type: "diagnostic_confirmation", answers: {} })).status).toBe(400);
    expect((await post("ami_redflags", { answers: { nope: true } })).status).toBe(400);
    expect((await post("appendicitis_redflags", { answers: { pain_location: "elbow" } })).status).toBe(400);
    expect((await post("appendicitis_redflags", { answers: { pain_location: "rlq" } })).status).toBe(422);
    expect((await post("not_a_rule", { answers: {} })).status).toBe(404);
  });
});
