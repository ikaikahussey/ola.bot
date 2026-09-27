// Leaf screens used by App. Navigation is passed in as callbacks.

import { useMemo, useState } from "react";
import { stopMessage } from "../engine/careLevels";
import { evaluate, visibleItems } from "../engine/evaluate";
import type { RouteResult } from "../engine/router";
import type { Session } from "../engine/session";
import type { AssessmentType, RedFlagAction, Rule } from "../engine/types";
import { RULES, RULES_BY_ID } from "../rules";
import { QuestionField } from "./Questions";
import { TYPE_GROUP_LABEL, TYPE_ICON, TypeBadge } from "./Pattern";

export function StopScreen({ action, trigger, onBack }: { action: RedFlagAction; trigger: string; onBack: () => void }) {
  const m = stopMessage(action);
  return (
    <div className="stop stack" role="alert">
      <h1 tabIndex={-1} style={m.emergency ? undefined : { color: "var(--ink)" }}>
        {m.emergency ? "🚨 " : ""}
        {m.heading}
      </h1>
      <p style={{ fontSize: "1.2rem" }}>{m.body}</p>
      <div className="row actions">
        <a className={`btn ${m.emergency ? "danger" : "primary"}`} href={m.primary.href}>
          {m.primary.label}
        </a>
        <a className="btn" href={m.secondary.href} target={m.secondary.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {m.secondary.label}
        </a>
      </div>
      <div className="box">
        <p className="small">
          <strong>Why we stopped:</strong> you answered yes to: “{trigger}”
        </p>
        <p className="small sub">
          This is a fixed safety rule. When this warning sign is present, no score can make it safe to wait, so the assessment ends here.
        </p>
      </div>
      <button className="link" onClick={onBack}>
        I answered by mistake — go back
      </button>
    </div>
  );
}

export function ComplaintInput({ initial, onSubmit, onPick }: { initial: string; onSubmit: (t: string) => void; onPick: (id: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="stack">
      <h1 tabIndex={-1}>What is your main symptom?</h1>
      <p className="sub">Describe it in a few words, for example “sore throat”, “twisted ankle”, or “burning when I pee”.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSubmit(text.trim());
        }}
      >
        <label className="sr-only" htmlFor="complaint">
          Main symptom
        </label>
        <input id="complaint" type="text" className="wide" style={{ flex: "1 1 260px" }} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" />
        <button className="primary" type="submit" disabled={!text.trim()}>
          Continue
        </button>
      </form>
      <p className="small sub">Your words are matched to an assessment with a fixed keyword list. They are not stored or sent anywhere.</p>
      <details>
        <summary style={{ color: "var(--link)", cursor: "pointer" }}>Or choose from all {RULES.length} assessments</summary>
        <RuleMenu ids={RULES.map((r) => r.rule_id)} onChoose={onPick} />
      </details>
    </div>
  );
}

const TYPE_ORDER: AssessmentType[] = ["red_flag", "diagnostic_confirmation", "scoring_algorithm"];

/** Assessment picker, grouped by type so scores, patterns, and emergency screens look different. */
export function RuleMenu({ ids, onChoose }: { ids: string[]; onChoose: (id: string) => void }) {
  return (
    <div>
      {TYPE_ORDER.map((type) => {
        const group = ids.filter((id) => RULES_BY_ID[id].assessment_type === type);
        if (!group.length) return null;
        return (
          <section key={type} className="box" style={{ marginBottom: "0.75rem" }}>
            <h3 className="group-title" style={{ marginTop: 0 }}>
              <span aria-hidden>{TYPE_ICON[type]}</span> {TYPE_GROUP_LABEL[type]}
            </h3>
            <ul className="list-plain">
              {group.map((id) => {
                const r = RULES_BY_ID[id];
                return (
                  <li key={id} className="spread">
                    <span>
                      <span aria-hidden>{TYPE_ICON[type]} </span>
                      <strong>{r.assessment_title}</strong>
                      <br />
                      <span className="small sub">
                        {r.condition} · {r.short_name}
                        {r.year_validated ? ` (${r.year_validated})` : ""}
                      </span>
                    </span>
                    <button onClick={() => onChoose(id)}>Select</button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function Mapping({ route, onChoose, onBack }: { route: RouteResult; onChoose: (id: string) => void; onBack: () => void }) {
  if (route.kind === "match") {
    const r = RULES_BY_ID[route.rule_id];
    return (
      <div className="stack">
        <h1 tabIndex={-1}>
          Mapping to: {r.assessment_title.toLowerCase()} ({r.short_name})
        </h1>
        {route.keyword ? (
          <p className="sub">Matched the phrase “{route.keyword}” in our keyword list.</p>
        ) : (
          <p className="sub">Selected directly.</p>
        )}
        <div className="box">
          <p>
            <strong>{r.name}</strong>
            {r.year_validated ? `, validated ${r.year_validated}.` : ""}
          </p>
          <p>
            <TypeBadge type={r.assessment_type} />
          </p>
          <p className="small sub">Validated in: {r.validated_population}</p>
        </div>
        <div className="row">
          <button className="primary" onClick={() => onChoose(r.rule_id)}>
            Continue
          </button>
          <button onClick={onBack}>Not right — change</button>
        </div>
        <details>
          <summary style={{ color: "var(--link)", cursor: "pointer" }}>Choose a different assessment</summary>
          <RuleMenu ids={RULES.map((x) => x.rule_id).filter((id) => id !== r.rule_id)} onChoose={onChoose} />
        </details>
      </div>
    );
  }
  if (route.kind === "ambiguous") {
    return (
      <div className="stack">
        <h1 tabIndex={-1}>Which is closest?</h1>
        <p className="sub">Your words matched more than one assessment. Choose the one that fits your main concern.</p>
        <RuleMenu ids={route.candidates.map((c) => c.rule_id)} onChoose={onChoose} />
        <button className="link" onClick={onBack}>
          ← Change what I typed
        </button>
      </div>
    );
  }
  if (route.kind === "none") {
    const others = RULES.map((r) => r.rule_id).filter((id) => !route.suggestions.includes(id));
    return (
      <div className="stack">
        <h1 tabIndex={-1}>No exact match</h1>
        <p className="sub">We could not match your words to a rule. {route.suggestions.length ? "These are the closest matches:" : "Choose from the list below."}</p>
        {route.suggestions.length > 0 && <RuleMenu ids={route.suggestions} onChoose={onChoose} />}
        <details open={route.suggestions.length === 0}>
          <summary style={{ color: "var(--link)", cursor: "pointer" }}>All assessments</summary>
          <RuleMenu ids={others} onChoose={onChoose} />
        </details>
        <div className="box small">
          If none fits, OLA BOT has no assessment for your symptom. Book a primary care or telehealth visit within 1 to 3 days, or go to urgent care today
          if symptoms are getting worse.
        </div>
        <button className="link" onClick={onBack}>
          ← Change what I typed
        </button>
      </div>
    );
  }
  return null;
}

export function Intake({
  rule,
  index,
  answers,
  setAnswer,
  goto,
  onBack,
  onDone,
}: {
  rule: Rule;
  index: number;
  answers: Session["answers"];
  setAnswer: (id: string, v: string) => void;
  goto: (i: number) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const items = useMemo(() => visibleItems(rule, answers), [rule, answers]);
  const i = Math.min(index, items.length - 1);
  const item = items[i];
  const value = answers[item.id];
  return (
    <div>
      <h1 tabIndex={-1} style={{ fontSize: "1.5rem" }}>
        {rule.assessment_title}
      </h1>
      <p className="sub">
        We'll ask {items.length} questions based on the {rule.short_name}{rule.year_validated ? ` (validated ${rule.year_validated})` : ""}.
      </p>
      <p className="small" aria-live="polite">
        Question {i + 1} of {items.length}
      </p>
      <div className="progress" aria-hidden>
        <div style={{ width: `${((i + 1) / items.length) * 100}%` }} />
      </div>
      <QuestionField key={item.id} item={item} value={value} onChange={(v) => setAnswer(item.id, v)} />
      <div className="nav-buttons">
        <button onClick={() => (i === 0 ? onBack() : goto(i - 1))}>← Back</button>
        <button className="primary" onClick={() => (i + 1 < items.length ? goto(i + 1) : onDone())}>
          {value === undefined ? "Skip" : i + 1 < items.length ? "Next →" : "Review answers →"}
        </button>
      </div>
    </div>
  );
}

export function Review({ rule, session, goto, onSubmit }: { rule: Rule; session: Session; goto: (i: number) => void; onSubmit: () => void }) {
  const items = visibleItems(rule, session.answers);
  const ev = evaluate(rule, session.answers);
  const label = (id: string, v: string | undefined) => {
    if (v === undefined) return <span className="tag warn">Not answered</span>;
    if (v === "unsure") return <span className="tag">Not sure</span>;
    const it = items.find((x) => x.id === id)!;
    return it.type === "yes_no" ? (v === "yes" ? "Yes" : "No") : it.options.find((o) => o.value === v)?.label;
  };
  return (
    <div className="stack">
      <h1 tabIndex={-1}>Review your answers</h1>
      {ev.blocked ? (
        <div className="box alert" role="alert">
          <strong>{ev.missing.length} questions are unanswered.</strong> This assessment needs all but at most one answered. Go back and answer these (“Not sure” is
          an answer):
          <ul>
            {ev.missing.map((m) => (
              <li key={m.id}>
                <button className="link" onClick={() => goto(items.findIndex((x) => x.id === m.id))}>
                  {m.question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : ev.limited ? (
        <div className="box">Some answers are missing or “Not sure”. The result will show how this could change it.</div>
      ) : null}
      <table className="trace-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Your answer</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id}>
              <td>{it.question}</td>
              <td>{label(it.id, session.answers[it.id])}</td>
              <td>
                <button className="link" onClick={() => goto(i)}>
                  Change
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="nav-buttons">
        <button onClick={() => goto(items.length - 1)}>← Back</button>
        <button className="primary" disabled={ev.blocked} onClick={onSubmit}>
          See my result
        </button>
      </div>
    </div>
  );
}
