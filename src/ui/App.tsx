import { useEffect, useMemo, useState } from "react";
import { stopMessage } from "../engine/careLevels";
import { evaluate, visibleItems } from "../engine/evaluate";
import { routeComplaint, type RouteResult } from "../engine/router";
import { newSession, type Session } from "../engine/session";
import type { RedFlagAction, Rule } from "../engine/types";
import { COMPLAINT_MAP, GLOBAL_RED_FLAGS, RULES, RULES_BY_ID } from "../rules";
import { About } from "./About";
import { Library } from "./Library";
import { QuestionField, YesNoButtons } from "./Questions";
import { Result } from "./Result";

type Step =
  | { name: "home" }
  | { name: "redflag"; index: number }
  | { name: "stop"; action: RedFlagAction; trigger: string; back: Step }
  | { name: "complaint" }
  | { name: "mapping"; route: RouteResult }
  | { name: "rule_redflag"; index: number }
  | { name: "intake"; index: number }
  | { name: "review" }
  | { name: "result" };

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash.replace(/^#/, "");
}

export function App() {
  const route = useHashRoute();
  const [session, setSession] = useState<Session>(newSession);
  const [step, setStep] = useState<Step>({ name: "home" });

  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("main h1, main legend")?.focus?.();
  }, [step, route]);

  const rule = session.rule_id ? RULES_BY_ID[session.rule_id] : null;

  const restart = (keepRedFlags: boolean) => {
    const s = newSession();
    if (keepRedFlags) s.red_flags_cleared = session.red_flags_cleared;
    setSession(s);
    setStep(keepRedFlags ? { name: "complaint" } : { name: "home" });
    window.location.hash = "";
  };

  let body: React.ReactNode;
  if (route.startsWith("/rules")) body = <Library ruleId={route.split("/")[2]} />;
  else if (route === "/about") body = <About />;
  else
    body = (
      <Flow
        step={step}
        setStep={setStep}
        session={session}
        setSession={setSession}
        rule={rule}
        onStartOver={() => restart(false)}
        onNewSymptom={() => restart(true)}
      />
    );

  return (
    <>
      <header className="site">
        <div className="wrap">
          <a className="brand" href="#" onClick={() => restart(false)}>
            OLA BOT
          </a>
          <nav className="site">
            <a href="#/rules">Rules library</a>
            <a href="#/about">How it works</a>
          </nav>
        </div>
      </header>
      <div className="banner" role="note">
        <div className="wrap">
          <strong>Prototype.</strong> The rules have not yet been reviewed by a licensed clinician. Do not rely on this site for medical decisions. In an
          emergency, call 911.
        </div>
      </div>
      <main>
        <div className="wrap">{body}</div>
      </main>
      <footer className="site">
        <div className="wrap stack">
          <p>
            OLA BOT is open-source software that applies published clinical rules to your answers. It is not a diagnosis and does not replace a clinician.
            In an emergency, call 911.
          </p>
          <p>
            <a href="https://github.com/ikaikahussey/ola.bot">Source code</a> · Apache License 2.0 · <a href="#/rules">Rule versions and citations</a>
          </p>
        </div>
      </footer>
    </>
  );
}

interface FlowProps {
  step: Step;
  setStep: (s: Step) => void;
  session: Session;
  setSession: React.Dispatch<React.SetStateAction<Session>>;
  rule: Rule | null;
  onStartOver: () => void;
  onNewSymptom: () => void;
}

function Flow({ step, setStep, session, setSession, rule, onStartOver, onNewSymptom }: FlowProps) {
  const chooseRule = (id: string) => {
    setSession((s) => ({ ...s, rule_id: id, answers: {}, rule_red_flags_cleared: [], completed_at: null }));
    const r = RULES_BY_ID[id];
    setStep(r.red_flags.length ? { name: "rule_redflag", index: 0 } : { name: "intake", index: 0 });
  };

  switch (step.name) {
    case "home":
      return (
        <div className="stack">
          <h1 tabIndex={-1}>Find the right care, and see exactly why.</h1>
          <p>
            OLA BOT asks a few questions and applies a published, validated clinical rule — the same kind clinicians use. You see every question, every
            point, the threshold, and the study behind it. No AI generates your result.
          </p>
          <ol>
            <li>Safety check: {GLOBAL_RED_FLAGS.length} quick emergency questions.</li>
            <li>Tell us your main symptom.</li>
            <li>Answer 3 to 9 multiple-choice questions.</li>
            <li>Get the score, the care level, how soon to go, and nearby providers.</li>
          </ol>
          <div className="row">
            <button className="primary" onClick={() => setStep({ name: "redflag", index: 0 })}>
              Start assessment
            </button>
            <a className="btn" href="#/rules">
              Browse the {RULES.length} rules
            </a>
          </div>
          <p className="small sub">Nothing you enter is stored unless you choose to share it at the end.</p>
        </div>
      );

    case "redflag": {
      const flag = GLOBAL_RED_FLAGS[step.index];
      const n = GLOBAL_RED_FLAGS.length;
      return (
        <div>
          <p className="sub small">
            Safety check {step.index + 1} of {n}
          </p>
          <div className="progress" aria-hidden>
            <div style={{ width: `${((step.index + 1) / n) * 100}%` }} />
          </div>
          <h1 tabIndex={-1}>{flag.question}</h1>
          <p className="sub">{flag.help} If you are not sure, choose Yes.</p>
          <YesNoButtons
            onYes={() => setStep({ name: "stop", action: flag.action, trigger: flag.question, back: step })}
            onNo={() => {
              setSession((s) => ({ ...s, red_flags_cleared: [...new Set([...s.red_flags_cleared, flag.id])] }));
              setStep(step.index + 1 < n ? { name: "redflag", index: step.index + 1 } : { name: "complaint" });
            }}
          />
          <div className="nav-buttons">
            <button className="link" onClick={() => setStep(step.index > 0 ? { name: "redflag", index: step.index - 1 } : { name: "home" })}>
              ← Back
            </button>
          </div>
        </div>
      );
    }

    case "stop":
      return <StopScreen action={step.action} trigger={step.trigger} onBack={() => setStep(step.back)} />;

    case "complaint":
      return (
        <ComplaintInput
          initial={session.complaint_text}
          onSubmit={(text) => {
            setSession((s) => ({ ...s, complaint_text: text }));
            const r = routeComplaint(text, COMPLAINT_MAP, RULES);
            if (r.kind === "emergency") {
              const flag = GLOBAL_RED_FLAGS.find((f) => f.id === r.red_flag_id)!;
              setStep({ name: "stop", action: flag.action, trigger: `You wrote "${r.keyword}". ${flag.question}`, back: { name: "complaint" } });
            } else setStep({ name: "mapping", route: r });
          }}
          onPick={chooseRule}
        />
      );

    case "mapping":
      return <Mapping route={step.route} onChoose={chooseRule} onBack={() => setStep({ name: "complaint" })} />;

    case "rule_redflag": {
      if (!rule) return null;
      const flag = rule.red_flags[step.index];
      const n = rule.red_flags.length;
      return (
        <div>
          <p className="sub small">
            {rule.assessment_title} · Warning sign {step.index + 1} of {n}
          </p>
          <div className="progress" aria-hidden>
            <div style={{ width: `${((step.index + 1) / n) * 100}%` }} />
          </div>
          <h1 tabIndex={-1}>{flag.question}</h1>
          <p className="sub">{flag.help} If you are not sure, choose Yes.</p>
          <YesNoButtons
            onYes={() => setStep({ name: "stop", action: flag.action, trigger: flag.question, back: step })}
            onNo={() => {
              setSession((s) => ({ ...s, rule_red_flags_cleared: [...new Set([...s.rule_red_flags_cleared, flag.id])] }));
              setStep(step.index + 1 < n ? { name: "rule_redflag", index: step.index + 1 } : { name: "intake", index: 0 });
            }}
          />
          <div className="nav-buttons">
            <button className="link" onClick={() => setStep(step.index > 0 ? { name: "rule_redflag", index: step.index - 1 } : { name: "complaint" })}>
              ← Back
            </button>
          </div>
        </div>
      );
    }

    case "intake":
      if (!rule) return null;
      return (
        <Intake
          rule={rule}
          index={step.index}
          answers={session.answers}
          setAnswer={(id, v) => setSession((s) => ({ ...s, answers: { ...s.answers, [id]: v } }))}
          goto={(i) => setStep({ name: "intake", index: i })}
          onBack={() => setStep(rule.red_flags.length ? { name: "rule_redflag", index: rule.red_flags.length - 1 } : { name: "complaint" })}
          onDone={() => setStep({ name: "review" })}
        />
      );

    case "review":
      if (!rule) return null;
      return (
        <Review
          rule={rule}
          session={session}
          goto={(i) => setStep({ name: "intake", index: i })}
          onSubmit={() => {
            setSession((s) => ({ ...s, completed_at: new Date().toISOString() }));
            setStep({ name: "result" });
          }}
        />
      );

    case "result":
      if (!rule) return null;
      return (
        <Result
          rule={rule}
          session={session}
          onStartOver={onStartOver}
          onNewSymptom={onNewSymptom}
          onEdit={() => setStep({ name: "review" })}
        />
      );
  }
}

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

function ComplaintInput({ initial, onSubmit, onPick }: { initial: string; onSubmit: (t: string) => void; onPick: (id: string) => void }) {
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
      <p className="small sub">Your words are matched to a rule with a fixed keyword list. They are not stored or sent anywhere.</p>
      <details>
        <summary style={{ color: "var(--link)", cursor: "pointer" }}>Or choose from all {RULES.length} assessments</summary>
        <RuleMenu ids={RULES.map((r) => r.rule_id)} onChoose={onPick} />
      </details>
    </div>
  );
}

function RuleMenu({ ids, onChoose }: { ids: string[]; onChoose: (id: string) => void }) {
  return (
    <ul className="list-plain">
      {ids.map((id) => {
        const r = RULES_BY_ID[id];
        return (
          <li key={id} className="spread">
            <span>
              <strong>{r.assessment_title}</strong>
              <br />
              <span className="small sub">
                {r.condition} · {r.short_name} ({r.year_validated})
              </span>
            </span>
            <button onClick={() => onChoose(id)}>Select</button>
          </li>
        );
      })}
    </ul>
  );
}

function Mapping({ route, onChoose, onBack }: { route: RouteResult; onChoose: (id: string) => void; onBack: () => void }) {
  if (route.kind === "match") {
    const r = RULES_BY_ID[route.rule_id];
    return (
      <div className="stack">
        <h1 tabIndex={-1}>
          Mapping to: {r.assessment_title.toLowerCase()} ({r.short_name})
        </h1>
        <p className="sub">Matched the phrase “{route.keyword}” in our keyword list.</p>
        <div className="box">
          <p>
            <strong>{r.name}</strong>, validated {r.year_validated}.
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
          If none fits, OLA BOT has no validated rule for your symptom. Book a primary care or telehealth visit within 1 to 3 days, or go to urgent care today
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

function Intake({
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
        We'll ask {items.length} questions based on the {rule.short_name} (validated {rule.year_validated}).
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

function Review({ rule, session, goto, onSubmit }: { rule: Rule; session: Session; goto: (i: number) => void; onSubmit: () => void }) {
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
          <strong>{ev.missing.length} questions are unanswered.</strong> The rule needs all but at most one answered. Go back and answer these (“Not sure” is
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
