import { useEffect, useRef, useState } from "react";
import { ED_MAP_URL, SPECIALTIES } from "../engine/careLevels";
import type { SpecialtyId } from "../engine/types";
import { copyText, mapsUrl, telHref } from "./util";

interface Provider {
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

interface SearchResponse {
  source: { name: string; url: string };
  queried_at: string;
  center: { zip: string; city: string; state: string } | null;
  radius_miles: number;
  results: Provider[];
  notices: string[];
  unavailable_fields: string[];
  error?: string;
}

type Where = { zip: string } | { lat: number; lon: number };

export function Finder({ defaultSpecialty, summary = "" }: { defaultSpecialty: SpecialtyId; summary?: string }) {
  const [open, setOpen] = useState(true);
  const [specialty, setSpecialty] = useState<SpecialtyId>(defaultSpecialty);
  const [zip, setZip] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [share, setShare] = useState(false);
  const [state, setState] = useState<{ loading: boolean; data: SearchResponse | null; error: string | null }>({ loading: false, data: null, error: null });
  const [geoError, setGeoError] = useState<string | null>(null);
  const reqId = useRef(0);

  const where: Where | null = /^\d{5}$/.test(zip) ? { zip } : coords;

  const search = async (w: Where) => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    const q = new URLSearchParams({ specialty, radius: String(radius) });
    if ("zip" in w) q.set("zip", w.zip);
    else {
      q.set("lat", w.lat.toFixed(3));
      q.set("lon", w.lon.toFixed(3));
    }
    try {
      const res = await fetch(`/api/providers?${q}`);
      const body = (await res.json()) as SearchResponse;
      if (id !== reqId.current) return;
      if (!res.ok) setState({ loading: false, data: null, error: body.error ?? "Search failed." });
      else setState({ loading: false, data: body, error: null });
    } catch {
      if (id === reqId.current) setState({ loading: false, data: null, error: "Search failed. Check your connection and try again." });
    }
  };

  // Live update when filters change (debounced).
  useEffect(() => {
    if (!where) return;
    const t = setTimeout(() => search(where), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialty, radius, zip, coords?.lat, coords?.lon]);

  const locate = () => {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError("Location is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setZip("");
        setCoords({ lat: p.coords.latitude, lon: p.coords.longitude });
      },
      () => setGeoError("Location permission was denied. Enter a ZIP code instead."),
      { maximumAge: 600000, timeout: 10000 },
    );
  };

  return (
    <div className="box">
      <div className="spread">
        <strong>Search filters</strong>
        <button className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Minimize" : "Expand"}
        </button>
      </div>
      {open && (
        <div className="stack" style={{ marginTop: "0.75rem" }}>
          {specialty === "emergency_department" && (
            <p>
              <a className="btn danger" href={ED_MAP_URL} target="_blank" rel="noreferrer">
                Find nearest emergency department
              </a>
            </p>
          )}
          <form
            className="finder-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (where) search(where);
            }}
          >
            <div>
              <label htmlFor="specialty">Specialty</label>
              <select id="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value as SpecialtyId)}>
                {SPECIALTIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="zip">Near ZIP code</label>
              <div className="row">
                <input
                  id="zip"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{5}"
                  maxLength={5}
                  placeholder={coords ? "Using your location" : "96813"}
                  value={zip}
                  onChange={(e) => {
                    setZip(e.target.value.replace(/\D/g, ""));
                    if (e.target.value) setCoords(null);
                  }}
                  style={{ width: "10ch" }}
                />
                <button type="button" onClick={locate}>
                  Use my location
                </button>
              </div>
              {geoError && <p className="small" style={{ color: "var(--alert)" }}>{geoError}</p>}
            </div>
            <div>
              <label htmlFor="radius">Distance: {radius} mi</label>
              <input id="radius" type="range" min={1} max={100} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
            </div>
            <div className="disabled-field">
              <label htmlFor="insurance">Insurance</label>
              <select id="insurance" disabled>
                <option>Not available from the NPI registry</option>
              </select>
            </div>
            <div className="disabled-field">
              <span style={{ fontWeight: 700 }}>Availability</span>
              <div className="row small">
                <label className="row" style={{ fontWeight: 400 }}>
                  <input type="radio" disabled /> Today
                </label>
                <label className="row" style={{ fontWeight: 400 }}>
                  <input type="radio" disabled /> This week
                </label>
                <span>Requires a scheduling (EHR) integration, which is not configured.</span>
              </div>
            </div>
            {summary && <label className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", fontWeight: 400 }}>
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} style={{ marginTop: 4 }} />
              <span>Share my symptom assessment with the provider I call? (Adds a “Copy summary” button to each result. Nothing is sent automatically.)</span>
            </label>}
            <div>
              <button className="primary" type="submit" disabled={!where}>
                Search
              </button>
            </div>
          </form>
          <p className="small sub">
            Privacy: only the specialty, distance, and ZIP code (or approximate location) are sent to search. Your answers and result are not sent.
          </p>

          {share && (
            <div>
              <strong className="small">Summary you can read or send to the provider:</strong>
              <pre className="trace">{summary}</pre>
            </div>
          )}

          {state.loading && <p aria-live="polite">Searching…</p>}
          {state.error && (
            <p role="alert" style={{ color: "var(--alert)" }}>
              {state.error}
            </p>
          )}
          {state.data && !state.loading && <Results data={state.data} share={share} summary={summary} />}
        </div>
      )}
    </div>
  );
}

function Results({ data, share, summary }: { data: SearchResponse; share: boolean; summary: string }) {
  return (
    <div className="stack">
      <p className="small">
        {data.results.length} result{data.results.length === 1 ? "" : "s"}
        {data.center && ` within ${data.radius_miles} mi of ${data.center.city}, ${data.center.state} ${data.center.zip}`}. Source:{" "}
        <a href={data.source.url} target="_blank" rel="noreferrer">
          {data.source.name}
        </a>
        .
      </p>
      {data.notices.map((n) => (
        <p key={n} className="small sub">
          {n}
        </p>
      ))}
      <p className="small sub">
        Not provided by this source: {data.unavailable_fields.join(", ")}. Call to confirm hours, insurance, and whether the service you need (for example
        X-ray or strep test) is on site.
      </p>
      <div className="cards">
        {data.results.map((p) => (
          <ProviderCard key={p.npi} p={p} share={share} summary={summary} />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({ p, share, summary }: { p: Provider; share: boolean; summary: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${p.address}, ${p.city}, ${p.state} ${p.zip}`;
  return (
    <article className="card">
      <h3>
        {p.name}
        {p.distance_miles !== null && <span className="sub"> ({p.distance_miles} mi)</span>}
      </h3>
      <div className="small sub">{p.specialty}</div>
      <div className="small">{full}</div>
      <div className="small">{p.phone ?? "No phone listed"}</div>
      <div className="small sub">Ratings, hours, insurance, wait time: not listed</div>
      <div className="actions">
        {p.phone && (
          <a className="btn primary" href={telHref(p.phone)}>
            Call
          </a>
        )}
        <a className="btn" href={mapsUrl(`${p.name}, ${full}`)} target="_blank" rel="noreferrer">
          Directions
        </a>
        <a className="btn" href={p.registry_url} target="_blank" rel="noreferrer">
          More info
        </a>
        {share && <button onClick={async () => setCopied(await copyText(summary))}>{copied ? "Copied" : "Copy summary"}</button>}
      </div>
    </article>
  );
}
