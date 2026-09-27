// Type definitions for rule files in rules/. Every field here is rendered to the
// user somewhere; nothing is hidden.

export type CareLevel =
  | "emergency_911"
  | "crisis"
  | "emergency_department"
  | "urgent_care"
  | "telehealth"
  | "mental_health"
  | "primary_care"
  | "self_care";

export type SpecialtyId =
  | "urgent_care"
  | "primary_care"
  | "pediatrics"
  | "mental_health"
  | "orthopedics"
  | "physical_therapy"
  | "ent"
  | "sleep_medicine"
  | "urology"
  | "ob_gyn"
  | "emergency_department"
  | "telehealth";

export type AssessmentType = "scoring_algorithm" | "diagnostic_confirmation" | "red_flag";

export type YesNoAnswer = "yes" | "no" | "unsure";
/**
 * Answer value: "yes" | "no" | "unsure" for yes/no items; option value or "unsure" for
 * choice items; comma-separated option values for checkbox items ("" = none selected).
 */
export type AnswerValue = string;
export type Answers = Record<string, AnswerValue | undefined>;

export type Condition =
  | { var: string; equals: string }
  | { var: string; in: string[] }
  /** Checkbox item has this option selected. */
  | { var: string; includes: string }
  /** Pattern-match rules: the pattern level (see Scoring "pattern"). */
  | { pattern: string }
  | { pattern_in: string[] }
  | { any_yes: string[] }
  | { all_yes: string[] }
  | { all_no: string[] }
  | { score_gte: number }
  | { score_lte: number }
  | { subscale: string; gte?: number; lte?: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface Citation {
  text: string;
  pmid?: string;
  url: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
  points?: number;
  /** Assumed when the item is unanswered, for the cautious (worst-case) result. */
  concerning?: boolean;
  /** Assumed when the item is unanswered, for the scored (base) result. Exactly one option per item. */
  benign?: boolean;
}

interface BaseItem {
  id: string;
  question: string;
  /** Plain-language help shown under "Not sure?". */
  help: string;
  /** Short label used in the audit trace, e.g. "Fever ≥38°C". */
  trace_label: string;
  /** If unanswered, route using the cautious result. */
  critical?: boolean;
  /** Defaults to true. More than one unanswered required item blocks the result. */
  required?: boolean;
  /** Pattern-match rules: role of the finding in the pattern (shown in the checklist). */
  finding_weight?: "essential" | "supporting" | "critical";
  show_if?: Condition;
}

export interface YesNoItem extends BaseItem {
  type: "yes_no";
  points_if_yes?: number;
  points_if_no?: number;
  /** Answer that raises concern. Defaults to "yes". */
  concerning_answer?: "yes" | "no";
}

export interface ChoiceItem extends BaseItem {
  type: "choice";
  options: ChoiceOption[];
}

/** Select all that apply. Unknown answers assume none (base) or all concerning options (worst). */
export interface CheckboxItem extends BaseItem {
  type: "checkbox";
  options: ChoiceOption[];
}

/** An item the rule requires but only a clinician can assess. Never asked; always scored with fixed points. */
export interface ClinicianOnlyItem {
  id: string;
  type: "clinician_only";
  trace_label: string;
  fixed_points: number;
  note: string;
}

export type Item = YesNoItem | ChoiceItem | CheckboxItem | ClinicianOnlyItem;
export type AskedItem = YesNoItem | ChoiceItem | CheckboxItem;

export interface Band {
  min: number;
  max: number;
  result: string;
  when?: Condition;
}

export interface DecisionStep {
  label: string;
  when: Condition;
  result: string;
}

export interface Override {
  label: string;
  when: Condition;
  result: string;
}

export interface PatternLevel {
  id: string;
  label: string;
  /** True when this level means the pattern matches (shown as "CONSISTENT"). */
  matched: boolean;
  interpretation: string;
  when?: Condition;
}

export type Scoring =
  | { method: "sum"; subscales?: Record<string, string[]>; bands: Band[]; threshold_text: string }
  | { method: "decision"; steps: DecisionStep[]; default_result: string; threshold_text: string }
  | {
      /**
       * Diagnostic confirmation or red flag: first decide the pattern level (first
       * level whose condition holds; the last level has no condition), then route
       * through ordered steps that may reference the level with { pattern }.
       */
      method: "pattern";
      pattern_text: string;
      levels: PatternLevel[];
      steps: DecisionStep[];
      default_result: string;
      threshold_text: string;
    };

/** A treatment window keyed on a choice item, e.g. antivirals within 72 hours of rash onset. */
export interface TimeWindow {
  label: string;
  item: string;
  hours: number;
  /** Per option value of `item`. */
  status: Record<string, { state: "open" | "closing" | "closed"; text: string; timeline_day: string }>;
  timeline: { label: string; strength: 1 | 2 | 3 }[];
}

export interface Care {
  level: CareLevel;
  within: string;
  where_detail: string;
  ed_redirect: string[];
  self_care?: string[];
  finder_specialty?: SpecialtyId;
}

export interface ResultDef {
  label: string;
  risk: "low" | "moderate" | "high" | "not_applicable";
  interpretation: string;
  recommendation: string;
  care: Care;
}

export interface RuleRedFlag {
  id: string;
  question: string;
  help: string;
  action: RedFlagAction;
  message?: string;
}

export type RedFlagAction = "call_911" | "go_to_ed" | "crisis_988" | "urgent_care_today";

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string;
}

export interface Rule {
  rule_id: string;
  name: string;
  short_name: string;
  assessment_title: string;
  condition: string;
  version: string;
  last_updated: string;
  changelog: ChangelogEntry[];
  /** Null for guidance-based patterns that are not a validated score. */
  year_validated: number | null;
  assessment_type: AssessmentType;
  /** Shown at the top of pattern checks and red flag screens. */
  description?: string;
  time_criticality?: string;
  time_window?: TimeWindow;
  citations: Citation[];
  validated_population: string;
  self_report_note?: string;
  /** Terms of use for the underlying instrument. */
  license_note: string;
  clinical_review: { status: "pending" | "reviewed"; reviewer?: string; date?: string };
  red_flags: RuleRedFlag[];
  items: Item[];
  scoring: Scoring;
  overrides?: Override[];
  results: Record<string, ResultDef>;
}

export interface GlobalRedFlag {
  id: string;
  question: string;
  help: string;
  action: RedFlagAction;
}

export interface ComplaintMapEntry {
  keywords: string[];
  rule_id: string;
}

export interface EmergencyKeywordEntry {
  keywords: string[];
  red_flag_id: string;
}

export interface ComplaintMap {
  complaint_map: ComplaintMapEntry[];
  emergency_keywords: EmergencyKeywordEntry[];
}
