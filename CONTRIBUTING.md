# Contributing to OLA BOT

Changes to rule files are clinical changes. Every rule change needs a citation, a version bump, a changelog entry, and tests.

## Principles

1. **Deterministic.** Same answers, same result. No randomness, network calls, or generated text in `src/engine/`.
2. **Nothing hidden.** Every field in a rule file is shown to users somewhere (result screen, rules library, or PDF).
3. **Specific routing.** Every result names a care level, a time frame, and where to go. "Call your doctor" is rejected by the validator.
4. **Validated instruments keep their wording.** Questionnaires such as PHQ-9 must use the published item wording. Plain-language explanations go in `help`.

## Adding a rule

1. Create `rules/algorithms/<rule_id>.json` (format below).
2. Import it in `src/rules.ts` and add it to `RULES`.
3. Add keywords in `rules/complaint_map.json`.
4. Add a `describe` block in `tests/algorithms.test.ts` covering every result and each band edge.
5. Run `npm test`. `tests/rules.test.ts` runs `validateRule` on every file. It checks that every score maps to a band, every result is reachable, every `show_if` refers to an earlier item, and each choice item has exactly one `benign` option.

## Changing a rule

Bump `version` (semver: patch for wording, minor for routing or time frames, major for scoring or thresholds), update `last_updated`, and add a `changelog` entry. The rules library publishes the history.

## Rule file format

```jsonc
{
  "rule_id": "centor_sore_throat",          // file name without .json
  "name": "Centor/McIsaac Criteria",
  "short_name": "McIsaac score",
  "assessment_title": "Sore throat assessment",
  "condition": "Sore throat (possible strep throat)",
  "version": "1.0.0",
  "last_updated": "2026-09-27",
  "changelog": [{ "version": "1.0.0", "date": "2026-09-27", "changes": "Initial release." }],
  "year_validated": 1998,
  "citations": [{ "text": "Full reference", "pmid": "9475915", "url": "https://pubmed.ncbi.nlm.nih.gov/9475915/" }],
  "validated_population": "Who the rule was validated in",
  "self_report_note": "Optional: how self-report differs from the validation setting",
  "license_note": "Terms of use for the instrument",
  "clinical_review": { "status": "pending" },   // or { "status": "reviewed", "reviewer": "Name, MD", "date": "..." }
  "red_flags": [
    { "id": "...", "question": "...", "help": "...", "action": "call_911 | go_to_ed | crisis_988 | urgent_care_today" }
  ],
  "items": [
    // yes/no item; points optional (decision rules use none)
    { "id": "fever", "type": "yes_no", "question": "...", "help": "...", "trace_label": "Fever ≥38°C", "points_if_yes": 1,
      "critical": false, "concerning_answer": "yes", "show_if": { "var": "other_item", "equals": "yes" } },
    // multiple-choice item; exactly one option is "benign" (assumed when unanswered)
    { "id": "age_group", "type": "choice", "question": "...", "help": "...", "trace_label": "Age group",
      "options": [{ "value": "15_44", "label": "15 to 44", "points": 0, "benign": true }, { "value": "3_14", "label": "3 to 14", "points": 1, "concerning": true }] },
    // required by the rule but only a clinician can assess it: never asked, fixed points, shown in the trace
    { "id": "alt_dx", "type": "clinician_only", "trace_label": "...", "fixed_points": 0, "note": "requires a clinician" }
  ],
  "scoring": {
    "method": "sum",
    "threshold_text": "Shown to the user verbatim",
    "subscales": { "psychosocial": ["q5", "q6"] },          // optional
    "bands": [{ "min": 0, "max": 1, "result": "low", "when": { "var": "sex", "equals": "male" } }]
  },
  // or: "scoring": { "method": "decision", "threshold_text": "...", "steps": [{ "label": "...", "when": {...}, "result": "..." }], "default_result": "..." }
  "overrides": [{ "label": "Shown in the trace", "when": {...}, "result": "..." }],   // checked before scoring
  "results": {
    "low": {
      "label": "Low likelihood of strep",
      "risk": "low | moderate | high | not_applicable",
      "interpretation": "Plain-English meaning",
      "recommendation": "What to do",
      "care": {
        "level": "emergency_911 | crisis | emergency_department | urgent_care | telehealth | mental_health | primary_care | self_care",
        "within": "Today (within 12 hours)",
        "where_detail": "Urgent care clinic with on-site rapid strep test",
        "ed_redirect": ["When to go to the ED instead"],
        "self_care": ["Optional home-care steps"],
        "finder_specialty": "urgent_care"
      }
    }
  }
}
```

### Pattern rules (diagnostic confirmation and red flag)

```jsonc
"assessment_type": "diagnostic_confirmation",   // or "red_flag"
"description": "Shown at the top of the check",
"time_criticality": "72 hours — ...",
"time_window": {                                 // optional, keyed on a choice item
  "label": "Antiviral treatment window", "item": "rash_onset_days", "hours": 72,
  "status": { "<option value>": { "state": "open | closing | closed", "text": "...", "timeline_day": "Day 1–3" } },
  "timeline": [{ "label": "Day 0–2: maximum effectiveness", "strength": 3 }]
},
"items": [
  // "required": false marks optional items; "finding_weight": "essential | supporting | critical" labels the checklist
  { "id": "red_flag_symptoms", "type": "checkbox", "question": "...", "help": "...", "trace_label": "...",
    "options": [{ "value": "eye_pain", "label": "Eye pain or vision changes", "concerning": true }] }
],
"scoring": {
  "method": "pattern",
  "pattern_text": "Plain statement of the pattern",
  "threshold_text": "Plain statement of the routing",
  "levels": [
    { "id": "consistent", "label": "Pattern CONSISTENT with ...", "matched": true, "interpretation": "...", "when": { "all_yes": ["rash_present", "dermatomal_distribution"] } },
    { "id": "inconsistent", "label": "Pattern NOT CONSISTENT ...", "matched": false, "interpretation": "..." }   // last level: no "when"
  ],
  "steps": [{ "label": "...", "when": { "all": [{ "pattern": "consistent" }, { "var": "rash_onset_days", "in": ["0_to_24h"] }] }, "result": "antiviral_today" }],
  "default_result": "evaluate"
}
```

Checkbox answers are stored as comma-separated option values; `""` means none selected. Unknown checkbox answers assume none (base) or every `concerning` option (cautious).

### Conditions

`{ "var": id, "equals": value }`, `{ "var": id, "in": [values] }`, `{ "var": id, "includes": option }` (checkbox), `{ "pattern": level }`, `{ "pattern_in": [levels] }`, `{ "any_yes": [ids] }`, `{ "all_yes": [ids] }`, `{ "all_no": [ids] }`, `{ "score_gte": n }`, `{ "score_lte": n }`, `{ "subscale": name, "gte": n, "lte": n }`, `{ "all": [conditions] }`, `{ "any": [conditions] }`, `{ "not": condition }`.

### Unknown answers

For each run the engine fills unknown items twice: once with the benign value (yes/no: the answer worth fewer points, or the opposite of `concerning_answer`; choice: the `benign` option) and once with the concerning value. If the two results differ, the user sees both. If any unknown item is `critical`, care routing uses the concerning result.

## Code style

TypeScript strict mode. Run `npm run typecheck` and `npm test` before opening a pull request.
