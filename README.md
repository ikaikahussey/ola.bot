# OLA BOT

A deterministic, fully auditable symptom-to-care-pathway engine with an integrated provider finder. Open source under the Apache License 2.0.

OLA BOT asks a short set of emergency questions, maps the user's main symptom to a published clinical decision rule, asks only the items that rule needs, scores it, and tells the user which level of care to seek and how soon. Every screen shows the working: each item, each point, the threshold, the rule's citation, and the version of the rule file.

**There is no AI in the assessment.** No language model or machine-learning system runs anywhere in the pipeline. Every sentence a user sees comes from a rule file in [`rules/`](rules/) or a fixed template in [`src/engine/trace.ts`](src/engine/trace.ts).

> OLA BOT is not a medical device and does not diagnose. Rule files are marked `clinical_review: pending` until a licensed clinician reviews them. See [Status and limits](#status-and-limits).

## How it works

| Step | What happens | Code |
|---|---|---|
| 1. Red-flag screen | 8 one-question gates (chest pain, breathing, bleeding, altered mental status, stroke signs, severe allergic reaction, severe abdominal pain, self-harm). Any "yes" stops the flow and shows 911 / ED / 988. | [`rules/red_flags.json`](rules/red_flags.json) |
| 2. Complaint router | Free text is normalized and matched against an explicit keyword list. Emergency phrases ("chest pain") stop the flow. The longest keyword wins; ties show a menu; no match shows the closest rules by shared words. | [`rules/complaint_map.json`](rules/complaint_map.json), [`src/engine/router.ts`](src/engine/router.ts) |
| 3. Rule warning signs | Rule-specific red flags (for example, drooling with a sore throat). | `red_flags` in each rule |
| 4. Structured intake | One multiple-choice question per screen, each with "Not sure" and plain-language help. Questions can depend on earlier answers (`show_if`). | [`src/ui/App.tsx`](src/ui/App.tsx) |
| 5. Execution | Sum-of-points or ordered decision steps, with safety overrides. Produces an item-by-item trace. | [`src/engine/evaluate.ts`](src/engine/evaluate.ts) |
| 6. Care routing | Each result in the rule file names a care level, a time frame, where to go, and when to go to the ED instead. | `results` in each rule |
| 7. Output | Audit trail, care box, provider finder, what was asked, citation, caveats, PDF, handoff summary, session ID and timestamp. | [`src/ui/Result.tsx`](src/ui/Result.tsx), [`src/ui/pdf.ts`](src/ui/pdf.ts) |

### Missing answers

- More than one unanswered item: the user must go back before seeing a result.
- Unknown items (unanswered or "Not sure") score 0. The engine also computes the result with every unknown at its most concerning value, and shows the difference ("could raise the score to 4, which would be: High likelihood of strep").
- Items marked `critical` route to the cautious result when unknown (for example, weight bearing in the Ottawa Ankle Rules, or PHQ-9 question 9).

## Rules included (17)

| Complaint | Rule | Validated | File |
|---|---|---|---|
| Sore throat | Centor/McIsaac | 1998 | `centor_sore_throat.json` |
| Ankle / midfoot injury | Ottawa Ankle Rules | 1992 | `ottawa_ankle.json` |
| Knee injury | Ottawa Knee Rule | 1996 | `ottawa_knee.json` |
| Neck injury | Canadian C-Spine Rule | 2001 | `canadian_cspine.json` |
| Head injury | Canadian CT Head Rule | 2001 | `canadian_ct_head.json` |
| Cough with fever | CRB-65 | 2003 | `crb65_cough.json` |
| Sinus symptoms | IDSA acute bacterial rhinosinusitis criteria | 2012 | `idsa_sinusitis.json` |
| Painful urination | Bent criteria for UTI in women | 2002 | `uti_bent.json` |
| Urinary symptoms (men) | IPSS / AUA Symptom Index | 1992 | `ipss.json` |
| Leg swelling | Wells DVT score (2003) | 2003 | `wells_dvt.json` |
| Low back pain | Keele STarT Back | 2008 | `start_back.json` |
| Headache | ID Migraine | 2003 | `id_migraine.json` |
| Low mood | PHQ-9 | 2001 | `phq9.json` |
| Anxiety | GAD-7 | 2006 | `gad7.json` |
| Trauma stress | PC-PTSD-5 | 2016 | `pc_ptsd5.json` |
| Alcohol use | AUDIT-C | 1998 | `audit_c.json` |
| Snoring / sleep apnea | STOP-Bang | 2008 | `stop_bang.json` |

The Epworth Sleepiness Scale was deliberately left out: it is licensed through Mapi Research Trust, which is incompatible with unrestricted open-source distribution.

## Provider finder

The finder is shown with results that call for a provider. It searches the public [CMS NPPES NPI Registry](https://npiregistry.cms.hhs.gov/api-page) through the server (`/api/providers`), because the registry does not allow browser cross-origin requests.

- Filters: specialty (defaults to the care level from the result), ZIP code or device location, distance slider (1–100 mi). Results update as filters change.
- Distances are straight-line between ZIP centroids from the bundled `zipcodes` dataset.
- The NPI registry has **no ratings, hours, insurance networks, wait times, or availability**. The UI states this and disables those filters rather than filling them in.
- Privacy: the finder sends only specialty, distance, and ZIP code (or rounded coordinates). The triage result is never sent. An opt-in checkbox adds a "Copy summary" button to each card; the summary contains the rule, score, and result, but no individual answers.

**Adding data sources.** `server/npi.ts` defines the `ProviderSearch` response shape. A Healthgrades adapter (ratings, insurance) or an EHR scheduling adapter (Athenahealth, Epic, Cerner availability) can return the same shape and fill `unavailable_fields` accordingly. Neither is implemented, because both require commercial agreements and credentials.

## Logging (opt-in)

At the end of an assessment the user can tick a consent box and press a button to store: session ID, timestamp, rule ID and version, multiple-choice answers, score, result, and care level. Typed text, IP address, user agent, and location are never stored. Records are appended to `$LOG_DIR/outcome-log.jsonl` (default `data/`). See [`server/log.ts`](server/log.ts).

## Running it

Requires Node.js 22+.

```bash
npm install
npm run dev          # UI on http://localhost:5173, API on :8787 (proxied)
npm test             # unit tests: engine, every rule, router, server
npm run typecheck
npm run test:e2e     # Playwright end-to-end tests (builds and starts the server)
npm run build && npm start   # production: serves dist/ and the API on $PORT (default 8787)
```

## Deploying

- **Any Node host:** `npm ci && npm run build && npm start`. Serves the UI and API on `$PORT`. Set `LOG_DIR` to a persistent directory to keep consented logs.
- **Vercel:** `vercel.json` runs `npm run build:vercel`, which writes a [Build Output API](https://vercel.com/docs/build-output-api/v3) bundle: static UI plus one Node function for `/api/*`. Vercel has no persistent disk, so opt-in outcome logging is turned off there (`/api/health` reports `logging: false` and the UI hides the consent box).

## Project layout

```
rules/
  red_flags.json          global emergency questions
  complaint_map.json      keyword → rule mapping, emergency phrases
  algorithms/*.json       one file per rule
src/engine/               pure TypeScript: evaluate, router, validate, trace templates
src/ui/                   React components, PDF export
server/                   Node HTTP server: NPI proxy, consented log, static hosting
tests/                    Vitest unit tests
e2e/                      Playwright tests
```

## Status and limits

- **Clinical review pending.** Every rule file has `clinical_review.status: "pending"`. Before any real-world use, a licensed clinician should review each file's items, thresholds, care routing, and time frames, then record their name and date in the file.
- **Citations.** Each rule links to PubMed, by PMID or, where no PMID is recorded, by a title search. PMIDs were entered from the published references without live lookup (the development environment could not reach PubMed), so a reviewer should confirm each one.
- **Self-report.** Most rules were validated with a clinician collecting the findings. Each affected rule has a `self_report_note` that is shown to the user.
- **Instrument terms of use.** Some questionnaires (STOP-Bang, STarT Back, ID Migraine, IPSS) have copyright holders whose terms should be confirmed before production deployment. See each file's `license_note` and [NOTICE](NOTICE).
- **Not a medical device.** Deploying a symptom checker may be subject to regulation (for example, FDA clinical decision support guidance). Operators are responsible for compliance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rule file format and how to add a rule.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
