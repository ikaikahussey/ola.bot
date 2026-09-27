// Provider search backed by the CMS NPPES NPI Registry public API
// (https://npiregistry.cms.hhs.gov/api-page). The registry lists licensed
// providers and their practice addresses. It does NOT provide ratings, hours,
// insurance networks, wait times, or appointment availability; the response
// says so explicitly rather than filling those fields.

import { haversineMiles, lookupZip, zipPrefixesWithin } from "./geo";

export const NPI_API = "https://npiregistry.cms.hhs.gov/api/";

/** Registry taxonomy descriptions searched for each specialty. */
export const SPECIALTY_TAXONOMIES: Record<string, string[]> = {
  urgent_care: ["Urgent Care"],
  primary_care: ["Family Medicine", "Internal Medicine"],
  pediatrics: ["Pediatrics"],
  mental_health: ["Psychiatry", "Psychologist", "Counselor"],
  orthopedics: ["Orthopaedic Surgery"],
  physical_therapy: ["Physical Therapist"],
  ent: ["Otolaryngology"],
  sleep_medicine: ["Sleep Medicine"],
  urology: ["Urology"],
  ob_gyn: ["Obstetrics & Gynecology"],
  emergency_department: ["General Acute Care Hospital"],
  telehealth: [],
};

export const UNAVAILABLE_FIELDS = ["ratings", "hours", "insurance networks", "wait times", "appointment availability"];

export interface Provider {
  npi: string;
  name: string;
  kind: "organization" | "individual";
  specialty: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  distance_miles: number | null;
  registry_url: string;
}

export interface ProviderSearch {
  source: { name: string; url: string };
  queried_at: string;
  center: { zip: string; city: string; state: string } | null;
  radius_miles: number;
  specialty: string;
  results: Provider[];
  notices: string[];
  unavailable_fields: string[];
}

interface NpiAddress {
  address_purpose?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
}
interface NpiResult {
  number?: string | number;
  enumeration_type?: string;
  basic?: {
    organization_name?: string;
    first_name?: string;
    last_name?: string;
    credential?: string;
    name_prefix?: string;
  };
  addresses?: NpiAddress[];
  taxonomies?: { desc?: string; primary?: boolean }[];
}

export function parseNpiResult(r: NpiResult, center: { latitude: number; longitude: number } | null): Provider | null {
  const npi = String(r.number ?? "");
  if (!/^\d{10}$/.test(npi)) return null;
  const loc = r.addresses?.find((a) => a.address_purpose === "LOCATION") ?? r.addresses?.[0];
  if (!loc) return null;
  const isOrg = r.enumeration_type === "NPI-2";
  const b = r.basic ?? {};
  const person = [b.first_name, b.last_name].filter((x): x is string => !!x).map(titleCase).join(" ");
  const name = isOrg ? titleCase(b.organization_name ?? "") : b.credential ? `${person}, ${b.credential}` : person;
  if (!name) return null;
  const zip = (loc.postal_code ?? "").slice(0, 5);
  let distance: number | null = null;
  const z = lookupZip(zip);
  if (center && z) distance = Math.round(haversineMiles(center.latitude, center.longitude, z.latitude, z.longitude) * 10) / 10;
  const taxonomy = r.taxonomies?.find((t) => t.primary) ?? r.taxonomies?.[0];
  return {
    npi,
    name,
    kind: isOrg ? "organization" : "individual",
    specialty: taxonomy?.desc ?? "",
    address: [loc.address_1, loc.address_2].filter((x): x is string => !!x).map(titleCase).join(", "),
    city: titleCase(loc.city ?? ""),
    state: loc.state ?? "",
    zip,
    phone: formatPhone(loc.telephone_number),
    distance_miles: distance,
    registry_url: `https://npiregistry.cms.hhs.gov/provider-view/${npi}`,
  };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Pc|Pa|Md|Do|Np|Pllc|Inc)\b/g, (m) => m.toUpperCase());
}

function formatPhone(p?: string): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length !== 10) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const cache = new Map<string, { at: number; value: ProviderSearch }>();
const CACHE_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 10;

export function buildQueryUrls(taxonomies: string[], prefixes: string[]): string[] {
  const urls: string[] = [];
  for (const prefix of prefixes) {
    for (const t of taxonomies) {
      const q = new URLSearchParams({
        version: "2.1",
        taxonomy_description: t,
        postal_code: `${prefix}*`,
        address_purpose: "LOCATION",
        limit: "200",
      });
      urls.push(`${NPI_API}?${q}`);
      if (urls.length >= MAX_REQUESTS) return urls;
    }
  }
  return urls;
}

export async function searchProviders(
  params: { specialty: string; zip: string; radius: number },
  fetcher: Fetcher = fetch as unknown as Fetcher,
): Promise<ProviderSearch> {
  const radius = Math.min(Math.max(Math.round(params.radius) || 25, 1), 100);
  const taxonomies = SPECIALTY_TAXONOMIES[params.specialty];
  if (!taxonomies) throw new HttpError(400, `Unknown specialty: ${params.specialty}`);
  const center = lookupZip(params.zip);
  if (!center) throw new HttpError(400, "Enter a valid 5-digit U.S. ZIP code.");

  const base: ProviderSearch = {
    source: { name: "CMS NPPES NPI Registry", url: "https://npiregistry.cms.hhs.gov/" },
    queried_at: new Date().toISOString(),
    center: { zip: center.zip, city: center.city, state: center.state },
    radius_miles: radius,
    specialty: params.specialty,
    results: [],
    notices: [],
    unavailable_fields: UNAVAILABLE_FIELDS,
  };

  if (taxonomies.length === 0) {
    base.notices.push(
      "The NPI registry does not identify telehealth services. Check your health plan's telehealth benefit (the member services number is on your insurance card), or choose Urgent Care or Primary Care and ask the clinic whether it offers video visits.",
    );
    return base;
  }

  const key = `${params.specialty}|${center.zip}|${radius}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const prefixes = zipPrefixesWithin(center, radius, 4);
  const urls = buildQueryUrls(taxonomies, prefixes);
  const seen = new Map<string, Provider>();
  let failures = 0;
  await Promise.all(
    urls.map(async (url) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetcher(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { results?: NpiResult[]; Errors?: unknown };
        for (const r of body.results ?? []) {
          const p = parseNpiResult(r, center);
          if (p && !seen.has(p.npi)) seen.set(p.npi, p);
        }
      } catch {
        failures++;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  if (failures === urls.length) throw new HttpError(502, "The NPI registry could not be reached. Try again in a few minutes.");
  if (failures > 0) base.notices.push(`Some registry searches failed (${failures} of ${urls.length}); results may be incomplete.`);

  base.results = [...seen.values()]
    .filter((p) => p.distance_miles === null || p.distance_miles <= radius)
    .sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999) || a.name.localeCompare(b.name))
    .slice(0, 50);
  base.notices.push("Distances are straight-line from ZIP code centers, not driving distance.");
  cache.set(key, { at: Date.now(), value: base });
  return base;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
