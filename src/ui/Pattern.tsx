// Screens for diagnostic confirmation (pattern check) and red flag assessments.

import { useMemo, useState } from "react";
import { ED_MAP_URL } from "../engine/careLevels";
import { evaluate, visibleItems, type Evaluation, type Finding } from "../engine/evaluate";
import { windowStatus } from "../engine/trace";
import type { Answers, AssessmentType, Rule } from "../engine/types";
import { QuestionField } from "./Questions";

export const TYPE_ICON: Record<AssessmentType, string> = {
  scoring_algorithm: "📊",
  diagnostic_confirmation: "📋",
  red_flag: "🚨",
};

export const TYPE_GROUP_LABEL: Record<AssessmentType, string> = {
  scoring_algorithm: "Scoring assessments",
  diagnostic_confirmation: "Diagnostic patterns",
  red_flag: "Emergency screening",
};

const TYPE_BADGE: Record<AssessmentType, string> = {
  scoring_algorithm: "Scored assessment",
  diagnostic_confirmation: "Pattern matching — not a scored assessment",
  red_flag: "EMERGENCY",
};

export function TypeBadge({ type }: { type: AssessmentType }) {
  return (
    <span className={`badge${type === "red_flag" ? " emergency" : ""}`}>
      <span aria-hidden>{TYPE_ICON[type]}</span> {TYPE_BADGE[type]}
    </span>
  );
}

export function PatternCheck({
  rule,
  answers,
  setAnswer,
  onSubmit,
  onRedFlag,
  onBack,
}: {
  rule: Rule;
  answers: Answers;
  setAnswer: (id: string, v: string) => void;
  onSubmit: () => void;
  onRedFlag: () => void;
  onBack: () => void;
}) {
  const items = useMemo(() => visibleItems(rule, answers), [rule, answers]);
  const [showErrors, setShowErrors] = useState(false);
  const isRedFlag = rule.assessment_type === "red_flag";
  const ev = evaluate(rule, answers);
  const missingRequired = new Set(ev.missing.filter((m) => m.required && m.id).map((m) => m.id));
  // Checkbox items left untouched count as "none selected" at submit time.
  for (const i of items) if (i.type === "checkbox") missingRequired.delete(i.id);

  return (
    <div className="stack">
      <div>
        <h1 tabIndex={-1} style={{ fontSize: "1.6rem" }}>
          {isRedFlag ? "🚨 Emergency Screening" : `${rule.assessment_title}`}
        </h1>
        <p className="sub" style={{ margin: 0 }}>
          {rule.name}
        </p>
      </div>
      <div>
        <TypeBadge type={rule.assessment_type} />
      </div>
      {rule.description && <p style={isRedFlag ? { fontSize: "1.15rem", fontWeight: 700 } : undefined}>{rule.description}</p>}
      {rule.time_criticality && (
        <p className="small">
          <strong>Time matters:</strong> {rule.time_criticality}.
        </p>
      )}
      {isRedFlag && <p className="small sub">If you are not sure, choose Yes.</p>}

      {showErrors && missingRequired.size > 1 && (
        <div className="box alert" role="alert">
          {missingRequired.size} required questions are unanswered. Answer them to see your result (“Not sure” is an answer).
        </div>
      )}

      <div>
        {items.map((item) => (
          <div className="q-block" key={item.id}>
            <QuestionField
              item={item}
              value={answers[item.id]}
              compact
              allowUnsure={!isRedFlag}
              invalid={showErrors && missingRequired.size > 1 && missingRequired.has(item.id)}
              onChange={(v) => {
                setAnswer(item.id, v);
                if (isRedFlag && v === "yes") onRedFlag();
              }}
            />
          </div>
        ))}
      </div>

      <div className="nav-buttons">
        <button onClick={onBack}>← Back</button>
        <button
          className="primary"
          onClick={() => {
            if (missingRequired.size > 1) {
              setShowErrors(true);
              window.scrollTo(0, 0);
            } else onSubmit();
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}

const MARK: Record<Finding["state"], string> = { present: "✓", absent: "○", unknown: "?", info: "•" };

export function Checklist({ findings }: { findings: Finding[] }) {
  return (
    <ul className="checklist">
      {findings.map((f, i) => (
        <li key={i} className={f.state}>
          <span className="mark" aria-hidden>
            {MARK[f.state]}
          </span>
          <span>
            <span className="sr-only">{f.state === "present" ? "Present: " : f.state === "absent" ? "Absent: " : f.state === "unknown" ? "Unknown: " : ""}</span>
            {f.label}
            {f.state === "unknown" && <span className="sub"> (not answered or not sure)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PatternFindings({ rule, ev, answers }: { rule: Rule; ev: Evaluation; answers: Answers }) {
  const w = windowStatus(rule, answers);
  const scoring = rule.scoring.method === "pattern" ? rule.scoring : null;
  const typeOf = (id: string) => rule.items.find((i) => i.id === id)?.type;
  const fromCheckbox = (f: Finding) => typeOf(f.item_id) === "checkbox";
  // Red flag check: every "select all that apply" option plus critical yes/no items.
  const critical = ev.findings.filter((f) => fromCheckbox(f) || (f.weight === "critical" && typeOf(f.item_id) === "yes_no"));
  const here = w?.status ? { open: 0, closing: 1, closed: 2 }[w.status.state] : -1;
  return (
    <div className="stack">
      {ev.pattern && (
        <div className={`box ${ev.pattern.matched ? "strong" : ""}`}>
          <p style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
            <span aria-hidden>{ev.pattern.matched ? "✓ " : "○ "}</span>
            {ev.pattern.label}
          </p>
          <p style={{ margin: "0.5rem 0 1rem" }}>{ev.pattern.interpretation}</p>
          <strong>Pattern findings</strong>
          <Checklist findings={ev.findings.filter((f) => !fromCheckbox(f))} />
        </div>
      )}
      {scoring && (
        <p className="small">
          <strong>Pattern rule:</strong> {scoring.pattern_text}
        </p>
      )}

      {w && (
        <div className="box">
          <strong>{w.window.label}</strong>
          <p>{w.status ? w.status.text : "Rash onset was not answered, so the window cannot be determined. Care routing assumes the window is still open."}</p>
          <div className="timeline" aria-label="Treatment effectiveness by day">
            {w.window.timeline.map((t, i) => (
              <div key={t.label} className={`bar${i === here ? " here" : ""}`}>
                <span style={{ display: "block", width: `${t.strength * 33}%` }} className="fill" aria-hidden />
                <span>
                  {t.label}
                  {i === here ? ` ← you are here (${w.status!.timeline_day})` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {critical.length > 0 && (
        <div>
          <strong>Red flag check</strong>
          <ul className="checklist">
            {critical.map((f, i) => (
              <li key={i} className={f.state === "present" ? "" : "absent"}>
                <span className="mark" aria-hidden style={f.state === "present" ? { color: "var(--alert)" } : undefined}>
                  {f.state === "present" ? "!" : f.state === "absent" ? "✓" : "?"}
                </span>
                <span>
                  {f.state === "present" ? `Present: ${f.label}` : f.state === "absent" ? `None: ${f.label}` : `Unknown: ${f.label}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <strong>Routing path</strong>
        <ol>
          {ev.path.map((p, i) => (
            <li key={i}>
              {p.label}: <strong>{p.met ? "YES" : "NO"}</strong>
              {p.met ? ` → ${ev.result_def.label}` : ""}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Replaces the whole app for chest pain: nothing but the call to action. */
export function CardiacEmergency({ onBack }: { onBack: () => void }) {
  return (
    <div className="fullscreen-emergency" role="alertdialog" aria-labelledby="cardiac-title">
      <div className="inner">
        <h1 id="cardiac-title" tabIndex={-1}>
          🚨 CALL 911 NOW 🚨
        </h1>
        <p style={{ fontSize: "1.3rem", fontWeight: 700 }}>
          Chest pain is an emergency.
          <br />
          Do not wait. Do not drive.
        </p>
        <a className="btn danger call" href="tel:911">
          CALL 911
        </a>
        <p className="small sub">(Or your local emergency number)</p>
        <p>
          <a className="btn" href={ED_MAP_URL} target="_blank" rel="noreferrer">
            Nearest emergency room: map and directions
          </a>
        </p>
        <div className="box">
          <p>
            <strong>Aspirin:</strong> if you have aspirin and are not allergic to it, chew one regular 325 mg aspirin while waiting for the ambulance. Do
            not take it if you have a bleeding disorder or a doctor has told you not to take aspirin.
          </p>
          <p>
            <strong>Tell the 911 operator:</strong> “I have chest pain.”
          </p>
          <p style={{ margin: 0 }}>
            <strong>Do not hang up</strong> until the operator tells you to. Unlock your door if you can.
          </p>
        </div>
        <p style={{ marginTop: "2rem" }}>
          <button className="link small" onClick={onBack}>
            I answered by mistake — go back
          </button>
        </p>
      </div>
    </div>
  );
}
