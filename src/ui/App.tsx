import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { visibleItems } from "../engine/evaluate";
import { routeComplaint, type RouteResult } from "../engine/router";
import { newSession, type Session } from "../engine/session";
import { COMPLAINT_MAP, GLOBAL_RED_FLAGS, RULES, RULES_BY_ID } from "../rules";
import { About } from "./About";
import { Library } from "./Library";
import { YesNoButtons } from "./Questions";
import { Result } from "./Result";
import { guard, parsePath, pathFor, titleFor, findFlag, type Route } from "./routes";
import { ComplaintInput, Intake, Mapping, Review, RuleMenu, StopScreen } from "./Screens";
import { CardiacEmergency, PatternCheck, TYPE_GROUP_LABEL, TYPE_ICON } from "./Pattern";
import type { AssessmentType } from "../engine/types";
import { ED_MAP_URL } from "../engine/careLevels";
import { Finder } from "./Finder";

const STORAGE_KEY = "olabot.session.v1";

function loadSession(): Session {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...newSession(), ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    // Storage unavailable (private mode, blocked): fall back to memory only.
  }
  return newSession();
}

function saveSession(s: Session) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function initialPath(): string {
  // Links from before page-level URLs used "#/rules" and "#/about".
  if (window.location.hash.startsWith("#/")) {
    const p = window.location.hash.slice(1);
    window.history.replaceState(null, "", p);
    return p;
  }
  return window.location.pathname;
}

export function App() {
  const [path, setPath] = useState(initialPath);
  const [session, setSession] = useState<Session>(loadSession);

  const navigate = useCallback((to: string, opts: { replace?: boolean } = {}) => {
    if (opts.replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setPath(to);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Same-origin links navigate without a full page load.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href || !href.startsWith("/") || href.startsWith("//") || a.target) return;
      e.preventDefault();
      navigate(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);

  useEffect(() => saveSession(session), [session]);

  const route = parsePath(path);
  // Old /rules addresses move to /assessments.
  const legacy = path.startsWith("/rules") && route.page !== "not_found" ? pathFor(route) : null;
  useLayoutEffect(() => {
    if (legacy) navigate(legacy, { replace: true });
  }, [legacy, navigate]);
  const redirect = guard(route, session);

  useLayoutEffect(() => {
    if (!redirect) return;
    if (redirect.remember) setSession((s) => ({ ...s, pending_path: redirect.remember! }));
    navigate(redirect.to, { replace: true });
  }, [redirect?.to, redirect?.remember, navigate]);

  const questionCount = route.page === "question" ? visibleItems(RULES_BY_ID[route.rule], session.answers).length : undefined;
  useEffect(() => {
    if (redirect) return;
    document.title = titleFor(route, questionCount);
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("main h1, main legend")?.focus?.();
  }, [path, redirect === null]);

  // Chest pain replaces the entire app with a single call-to-action screen.
  if (!redirect && route.page === "stop" && route.flag === "chest_pain" && !route.rule) {
    return <CardiacEmergency onBack={() => window.history.back()} />;
  }

  const restart = (keepSafety: boolean) => {
    const s = newSession();
    if (keepSafety) s.red_flags_cleared = session.red_flags_cleared;
    setSession(s);
    navigate(keepSafety ? "/symptom" : "/");
  };

  return (
    <>
      <header className="site">
        <div className="wrap">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              restart(false);
            }}
          >
            OLA BOT
          </a>
          <nav className="site">
            <a href="/find">Find care</a>
            <a href="/assessments">Assessments</a>
            <a href="/about">How it works</a>
          </nav>
        </div>
      </header>
      <div className="banner" role="note">
        <div className="wrap">
          <strong>Prototype.</strong> The assessments have not yet been reviewed by a licensed clinician. Do not rely on this site for medical decisions. In an
          emergency, call 911.
        </div>
      </div>
      <main>
        <div className="wrap">
          {redirect ? null : (
            <Page route={route} session={session} setSession={setSession} navigate={navigate} restart={restart} />
          )}
        </div>
      </main>
      <footer className="site">
        <div className="wrap stack">
          <p>
            OLA BOT is open-source software that applies published clinical rules to your answers. It is not a diagnosis and does not replace a clinician.
            In an emergency, call 911.
          </p>
          <p>
            <a href="https://github.com/ikaikahussey/ola.bot">Source code</a> · Apache License 2.0 · <a href="/assessments">Assessment versions and citations</a>
          </p>
        </div>
      </footer>
    </>
  );
}

interface PageProps {
  route: Route;
  session: Session;
  setSession: React.Dispatch<React.SetStateAction<Session>>;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  restart: (keepSafety: boolean) => void;
}

function Page({ route, session, setSession, navigate, restart }: PageProps) {
  const go = (r: Route, replace = false) => navigate(pathFor(r), { replace });

  const firstStep = (id: string): Route =>
    RULES_BY_ID[id].assessment_type === "scoring_algorithm" ? { page: "question", rule: id, n: 1 } : { page: "check", rule: id };

  const startRule = (id: string) => {
    const rule = RULES_BY_ID[id];
    setSession((s) =>
      s.rule_id === id ? s : { ...s, rule_id: id, answers: {}, rule_red_flags_cleared: [], completed_at: null },
    );
    go(rule.red_flags.length ? { page: "warning", rule: id, n: 1 } : firstStep(id));
  };

  switch (route.page) {
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
            <a className="btn primary" href="/safety/1">
              Start assessment
            </a>
            <a className="btn" href="/find">
              Find a provider
            </a>
          </div>
          <p className="small sub">Nothing you enter is stored on a server unless you choose to share it at the end.</p>

          <EmergencySigns />

          <h2 id="all-assessments">All {RULES.length} assessments</h2>
          <p className="small sub">
            Choose one to start it directly. “Details” shows the questions, scoring, and source rule. “Start assessment” above asks the emergency questions
            first and then matches your symptom to an assessment.
          </p>
          <AssessmentIndex />
        </div>
      );

    case "safety": {
      const n = GLOBAL_RED_FLAGS.length;
      const flag = GLOBAL_RED_FLAGS[route.n - 1];
      return (
        <div>
          <p className="sub small">
            Safety check {route.n} of {n}
          </p>
          <div className="progress" aria-hidden>
            <div style={{ width: `${(route.n / n) * 100}%` }} />
          </div>
          <h1 tabIndex={-1}>{flag.question}</h1>
          <p className="sub">{flag.help} If you are not sure, choose Yes.</p>
          <YesNoButtons
            onYes={() => {
              setSession((s) => ({ ...s, stop_keyword: null }));
              go({ page: "stop", flag: flag.id });
            }}
            onNo={() => {
              setSession((s) => ({
                ...s,
                red_flags_cleared: [...new Set([...s.red_flags_cleared, flag.id])],
                pending_path: route.n < n ? s.pending_path : null,
              }));
              if (route.n < n) go({ page: "safety", n: route.n + 1 });
              else navigate(session.pending_path ?? "/symptom");
            }}
          />
          <div className="nav-buttons">
            <a href={route.n > 1 ? `/safety/${route.n - 1}` : "/"}>← Back</a>
          </div>
        </div>
      );
    }

    case "stop": {
      const flag = findFlag(route.flag, route.rule)!;
      const ruleFlags = route.rule ? RULES_BY_ID[route.rule].red_flags : GLOBAL_RED_FLAGS;
      const index = ruleFlags.findIndex((f) => f.id === route.flag) + 1;
      const fromKeyword = !route.rule && session.stop_keyword;
      const trigger = fromKeyword ? `You wrote "${session.stop_keyword}". ${flag.question}` : flag.question;
      const back = fromKeyword ? "/symptom" : route.rule ? `/assess/${route.rule}/warning/${index}` : `/safety/${index}`;
      return <StopScreen action={flag.action} trigger={trigger} onBack={() => navigate(back)} />;
    }

    case "symptom":
      return (
        <ComplaintInput
          initial={session.complaint_text}
          onSubmit={(text) => {
            const r = routeComplaint(text, COMPLAINT_MAP, RULES);
            setSession((s) => ({ ...s, complaint_text: text, stop_keyword: r.kind === "emergency" ? r.keyword : null }));
            if (r.kind === "emergency") go({ page: "stop", flag: r.red_flag_id });
            else if (r.kind === "match") go({ page: "confirm", rule: r.rule_id });
            else go({ page: "choose" });
          }}
          onPick={startRule}
        />
      );

    case "choose": {
      const r = routeComplaint(session.complaint_text, COMPLAINT_MAP, RULES);
      return <Mapping route={r} onChoose={(id) => go({ page: "confirm", rule: id })} onBack={() => navigate("/symptom")} />;
    }

    case "confirm": {
      const fromText = session.complaint_text ? routeComplaint(session.complaint_text, COMPLAINT_MAP, RULES) : null;
      const r: RouteResult =
        fromText?.kind === "match" && fromText.rule_id === route.rule ? fromText : { kind: "match", rule_id: route.rule, keyword: "" };
      return <Mapping route={r} onChoose={startRule} onBack={() => navigate("/symptom")} />;
    }

    case "warning": {
      const rule = RULES_BY_ID[route.rule];
      const flag = rule.red_flags[route.n - 1];
      const n = rule.red_flags.length;
      return (
        <div>
          <p className="sub small">
            {rule.assessment_title} · Warning sign {route.n} of {n}
          </p>
          <div className="progress" aria-hidden>
            <div style={{ width: `${(route.n / n) * 100}%` }} />
          </div>
          <h1 tabIndex={-1}>{flag.question}</h1>
          <p className="sub">{flag.help} If you are not sure, choose Yes.</p>
          <YesNoButtons
            onYes={() => go({ page: "stop", rule: rule.rule_id, flag: flag.id })}
            onNo={() => {
              setSession((s) => ({ ...s, rule_red_flags_cleared: [...new Set([...s.rule_red_flags_cleared, flag.id])] }));
              go(route.n < n ? { page: "warning", rule: rule.rule_id, n: route.n + 1 } : firstStep(rule.rule_id));
            }}
          />
          <div className="nav-buttons">
            <a href={route.n > 1 ? `/assess/${rule.rule_id}/warning/${route.n - 1}` : `/assess/${rule.rule_id}`}>← Back</a>
          </div>
        </div>
      );
    }

    case "question": {
      const rule = RULES_BY_ID[route.rule];
      const count = visibleItems(rule, session.answers).length;
      if (route.n > count) {
        queueMicrotask(() => go({ page: "question", rule: rule.rule_id, n: count }, true));
        return null;
      }
      return (
        <Intake
          rule={rule}
          index={route.n - 1}
          answers={session.answers}
          setAnswer={(id, v) => setSession((s) => ({ ...s, answers: { ...s.answers, [id]: v }, completed_at: null }))}
          goto={(i) => go({ page: "question", rule: rule.rule_id, n: i + 1 })}
          onBack={() =>
            go(rule.red_flags.length ? { page: "warning", rule: rule.rule_id, n: rule.red_flags.length } : { page: "confirm", rule: rule.rule_id })
          }
          onDone={() => go({ page: "review", rule: rule.rule_id })}
        />
      );
    }

    case "check": {
      const rule = RULES_BY_ID[route.rule];
      return (
        <PatternCheck
          rule={rule}
          answers={session.answers}
          setAnswer={(id, v) => setSession((s) => ({ ...s, answers: { ...s.answers, [id]: v }, completed_at: null }))}
          onRedFlag={() => {
            setSession((s) => ({ ...s, stop_keyword: null }));
            go({ page: "stop", flag: "chest_pain" });
          }}
          onBack={() =>
            go(rule.red_flags.length ? { page: "warning", rule: rule.rule_id, n: rule.red_flags.length } : { page: "confirm", rule: rule.rule_id })
          }
          onSubmit={() => {
            setSession((s) => {
              const answers = { ...s.answers };
              // An untouched "select all that apply" list means none selected.
              for (const i of visibleItems(rule, answers)) if (i.type === "checkbox" && answers[i.id] === undefined) answers[i.id] = "";
              return { ...s, answers, completed_at: new Date().toISOString() };
            });
            go({ page: "result", rule: rule.rule_id });
          }}
        />
      );
    }

    case "review": {
      const rule = RULES_BY_ID[route.rule];
      return (
        <Review
          rule={rule}
          session={session}
          goto={(i) => go({ page: "question", rule: rule.rule_id, n: i + 1 })}
          onSubmit={() => {
            setSession((s) => ({ ...s, completed_at: new Date().toISOString() }));
            go({ page: "result", rule: rule.rule_id });
          }}
        />
      );
    }

    case "result":
      return (
        <Result
          rule={RULES_BY_ID[route.rule]}
          session={session}
          onStartOver={() => restart(false)}
          onNewSymptom={() => restart(true)}
          onEdit={() => go({ page: "review", rule: route.rule })}
        />
      );

    case "rules":
      return <Library />;
    case "rule_detail":
      return <Library ruleId={route.rule} />;
    case "about":
      return <About />;
    case "find":
      return (
        <div className="stack">
          <h1 tabIndex={-1}>Find a provider</h1>
          <p className="sub">Search licensed providers near you. No assessment is needed. In an emergency, call 911.</p>
          <Finder defaultSpecialty="urgent_care" />
        </div>
      );
    case "not_found":
      return (
        <div className="stack">
          <h1 tabIndex={-1}>Page not found</h1>
          <p>
            <a href="/">Start an assessment</a> or browse <a href="/assessments">all assessments</a>.
          </p>
          <details>
            <summary style={{ color: "var(--link)", cursor: "pointer" }}>All assessments</summary>
            <RuleMenu ids={RULES.map((r) => r.rule_id)} onChoose={(id) => go({ page: "confirm", rule: id })} />
          </details>
        </div>
      );
  }
}

const INDEX_ORDER: AssessmentType[] = ["red_flag", "diagnostic_confirmation", "scoring_algorithm"];

/** Links to every assessment, grouped by type (front page). */
function AssessmentIndex() {
  return (
    <div>
      {INDEX_ORDER.map((type) => {
        const group = RULES.filter((r) => r.assessment_type === type);
        if (!group.length) return null;
        return (
          <section key={type} aria-labelledby={`group-${type}`}>
            <h3 id={`group-${type}`} className="group-title">
              <span aria-hidden>{TYPE_ICON[type]}</span> {TYPE_GROUP_LABEL[type]}
            </h3>
            <ul className="list-plain">
              {group.map((r) => (
                <li key={r.rule_id} className="spread" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                  <span style={{ flex: 1 }}>
                    <a href={`/assess/${r.rule_id}`}>
                      <strong>{r.assessment_title}</strong>
                    </a>
                    <br />
                    <span className="small sub">{r.condition}</span>
                  </span>
                  <a className="small" href={`/assessments/${r.rule_id}`} aria-label={`Details: ${r.assessment_title}`}>
                    Details
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const SIGNS_KEY = "olabot.emergencySigns.hidden";

/** Front-page list of emergency warning signs. Open by default; the viewer can hide it. */
function EmergencySigns() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(SIGNS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try {
      localStorage.setItem(SIGNS_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable: the choice lasts for this page view only.
    }
  };
  return (
    <section className="box alert" aria-labelledby="emergency-signs">
      <div className="spread">
        <h2 id="emergency-signs" style={{ margin: 0, fontSize: "1.1rem" }}>
          🚨 Emergency warning signs
        </h2>
        <button className="link" onClick={toggle} aria-expanded={!hidden} aria-controls="emergency-signs-body">
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
      {!hidden && (
        <div id="emergency-signs-body" style={{ marginTop: "0.75rem" }}>
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>Do not use an assessment if you have any of these right now.</strong> Get emergency care instead:
          </p>
          <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.25rem" }}>
            {GLOBAL_RED_FLAGS.map((f) => (
              <li key={f.id}>
                {f.summary}{" "}
                <span className="small sub">
                  ({f.action === "crisis_988" ? "call or text 988" : f.action === "go_to_ed" ? "go to the emergency room" : "call 911"})
                </span>
              </li>
            ))}
          </ul>
          <div className="row">
            <a className="btn danger" href="tel:911">
              Call 911
            </a>
            <a className="btn" href="tel:988">
              Call or text 988
            </a>
            <a className="btn" href={ED_MAP_URL} target="_blank" rel="noreferrer">
              Find nearest ER
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
