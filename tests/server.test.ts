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
    expect(JSON.parse(text.trim())).toEqual(entry);
  });
  it("rejects entries without consent or with free text", async () => {
    expect((await fetch(`${base}/api/log`, { method: "POST", body: JSON.stringify({ ...entry, consent: false }) })).status).toBe(400);
    expect((await fetch(`${base}/api/log`, { method: "POST", body: JSON.stringify({ ...entry, answers: { note: "my name is Bob" } }) })).status).toBe(400);
  });
});
