import { useEffect, useMemo, useState } from "react";
import { CARE_LEVEL_LABEL, ED_MAP_URL, needsProvider, specialtyForLevel } from "../engine/careLevels";
import { evaluate, type Evaluation } from "../engine/evaluate";
import { formatTimestamp, logPayload, type Session } from "../engine/session";
import { fmtPoints, handoffSummary, tellProvider, traceLines } from "../engine/trace";
import type { Rule } from "../engine/types";
import { GLOBAL_RED_FLAGS } from "../rules";
import { Finder } from "./Finder";
import { PatternFindings, TypeBadge } from "./Pattern";
import { copyText } from "./util";

export const CAVEAT =
  "This assessment assumes you answered accurately. If any answer is unclear, repeat with a clinician. It applies a published rule to your answers; it is not a diagnosis. If symptoms get worse or new warning signs appear, get care sooner.";

export function Result({
  rule,
  session,
  onStartOver,
  onNewSymptom,
  onEdit,
}: {
  rule: Rule;
  session: Session;
  onStartOver: () => void;
  onNewSymptom: () => void;
  onEdit: () => void;
}) {
  const ev = useMemo(() => evaluate(rule, session.answers), [rule, session.answers]);
  const def = ev.result_def;
  const care = def.care;
  const timestamp = session.completed_at ?? new Date().toISOString();
  const summary = handoffSummary({ rule, ev, sessionId: session.id, timestamp });
  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const { buildPdf } = await import("./pdf");
      const doc = await buildPdf({ rule, ev, session });
      doc.save(`ola-bot-${rule.rule_id}-${session.id.slice(0, 8)}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  const urgent = care.level === "emergency_911" || care.level === "crisis" || care.level === "emergency_department";

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="sub small" style={{ margin: 0 }}>
            {rule.assessment_title}
          </p>
          <h1 tabIndex={-1} style={{ margin: 0 }}>
            {def.label}
          </h1>
        </div>
        <div className="row no-print">
          <button className="primary" onClick={downloadPdf} disabled={pdfBusy}>
            {pdfBusy ? "Preparing…" : "Download as PDF"}
          </button>
        </div>
      </div>
      <p style={{ fontSize: "1.1rem" }}>{def.interpretation}</p>

      {urgent && (
        <div className="box alert" role="alert">
          <strong>{def.recommendation}</strong>
          <div className="row" style={{ marginTop: "0.5rem" }}>
            {care.level === "crisis" ? (
              <>
                <a className="btn danger" href="tel:988">
                  Call 988
                </a>
                <a className="btn" href="sms:988">
                  Text 988
                </a>
                <a className="btn" href="tel:911">
                  Call 911
                </a>
              </>
            ) : (
              <>
                <a className="btn danger" href="tel:911">
                  Call 911
                </a>
                <a className="btn" href={ED_MAP_URL} target="_blank" rel="noreferrer">
                  Find nearest ED
                </a>
              </>
            )}
          </div>
        </div>
      )}

      <section aria-labelledby="how">
        <h2 id="how">{ev.method === "pattern" ? "How we checked the pattern" : "How we scored it"}</h2>
        {ev.method === "pattern" ? (
          <>
            <PatternFindings rule={rule} ev={ev} answers={session.answers} />
            <PlainTrace rule={rule} ev={ev} answers={session.answers} />
          </>
        ) : (
          <AuditTrail rule={rule} ev={ev} />
        )}
      </section>

      <section aria-labelledby="care">
        <h2 id="care">Where to go and when</h2>
        <CareBox rule={rule} ev={ev} />
      </section>

      {needsProvider(care.level) && (
        <section aria-labelledby="finder" className="no-print">
          <h2 id="finder">Find a provider</h2>
          <Finder defaultSpecialty={care.finder_specialty ?? specialtyForLevel(care.level)} summary={summary} />
        </section>
      )}

      {care.level !== "emergency_911" && care.level !== "crisis" && care.level !== "emergency_department" && (
        <section aria-labelledby="tele">
          <h2 id="tele">Telehealth option</h2>
          <p>
            A phone or video visit is an alternative when you cannot get to a clinic in the recommended time and none of the emergency signs apply. Most
            health plans offer a 24-hour nurse line and telehealth visits; the member services number is on the back of your insurance card. Telehealth
            cannot perform exams or tests such as X-rays or strep swabs.
          </p>
        </section>
      )}

      <section aria-labelledby="asked">
        <h2 id="asked">What we asked</h2>
        <WhatWeAsked rule={rule} session={session} ev={ev} />
        <button className="link no-print" onClick={onEdit}>
          Change an answer
        </button>
      </section>

      <section aria-labelledby="rule">
        <h2 id="rule">Which rule we used</h2>
        <RuleInfo rule={rule} />
      </section>

      <section aria-labelledby="caveats">
        <h2 id="caveats">Confidence caveats</h2>
        <p>{CAVEAT}</p>
        {ev.limited && (
          <p>
            <strong>Assessment limited by missing data:</strong>{" "}
            {[...ev.missing, ...ev.unsure].map((i) => `${i.label} (${i.status === "missing" ? "not answered" : "not sure"})`).join("; ")}.
          </p>
        )}
        {ev.range_note && <p>{ev.range_note}</p>}
        {ev.caution_note && <p>{ev.caution_note}</p>}
        {rule.self_report_note && <p>{rule.self_report_note}</p>}
      </section>

      <section aria-labelledby="share" className="no-print">
        <h2 id="share">Share or save</h2>
        <ShareAndLog rule={rule} ev={ev} session={session} summary={summary} />
      </section>

      <div className="row no-print" style={{ marginTop: "2rem" }}>
        <button onClick={onNewSymptom}>New symptom</button>
        <button onClick={onStartOver}>Start over</button>
      </div>

      <p className="small sub">
        Session ID: <span className="mono">{session.id}</span>
        <br />
        Completed: {formatTimestamp(timestamp)}
      </p>
    </div>
  );
}

export function AuditTrail({ rule, ev }: { rule: Rule; ev: Evaluation }) {
  const [showText, setShowText] = useState(false);
  return (
    <div className="stack">
      <table className="trace-table">
        <caption className="sr-only">Item-by-item scoring</caption>
        <thead>
          <tr>
            <th>{rule.short_name} item</th>
            <th>Answer</th>
            {ev.method === "sum" && <th style={{ textAlign: "right" }}>Points</th>}
          </tr>
        </thead>
        <tbody>
          {ev.items.map((i) => (
            <tr key={i.id} className={i.status === "not_applicable" ? "muted" : undefined}>
              <td>
                {i.label}
                {i.status === "clinician_only" && <div className="small sub">{i.note}</div>}
              </td>
              <td>
                {i.answer_text}
                {(i.status === "missing" || i.status === "unsure") && ev.method === "sum" && i.worst_points !== i.points && (
                  <div className="small sub">could be {fmtPoints(i.worst_points)}</div>
                )}
              </td>
              {ev.method === "sum" && <td className="pts">{i.status === "not_applicable" ? "—" : fmtPoints(i.points)}</td>}
            </tr>
          ))}
        </tbody>
        {ev.method === "sum" && (
          <tfoot>
            <tr>
              <td colSpan={2}>
                Total (possible {ev.score_min} to {ev.score_max})
              </td>
              <td className="pts">{ev.score}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {Object.entries(ev.subscales).map(([k, v]) => (
        <p key={k} className="small">
          Subscale “{k}”: {v}
        </p>
      ))}
      {ev.method === "decision" && (
        <div>
          <strong>Decision path</strong>
          <ol>
            {ev.path.map((p, i) => (
              <li key={i}>
                {p.label}: <strong>{p.met ? "YES" : "NO"}</strong>
                {p.met ? ` → ${ev.result_def.label}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
      <dl className="kv">
        <dt>Result</dt>
        <dd>
          {ev.result_def.label} <span className="sub">({ev.result_reason})</span>
        </dd>
        <dt>Threshold</dt>
        <dd>{rule.scoring.threshold_text}</dd>
        <dt>Recommendation</dt>
        <dd>{ev.result_def.recommendation}</dd>
      </dl>
      <button className="link no-print" onClick={() => setShowText((s) => !s)}>
        {showText ? "Hide" : "Show"} plain-text audit trace
      </button>
      {showText && <pre className="trace">{traceLines(rule, ev).join("\n")}</pre>}
    </div>
  );
}

export function CareBox({ rule, ev }: { rule: Rule; ev: Evaluation }) {
  const care = ev.result_def.care;
  const tell = tellProvider(rule, ev);
  const [copied, setCopied] = useState(false);
  return (
    <div className={`box ${care.level === "crisis" || care.level.startsWith("emergency") ? "alert" : "strong"}`}>
      <div className="care-level">Care level: {CARE_LEVEL_LABEL[care.level]}</div>
      <dl className="kv" style={{ marginTop: "0.75rem" }}>
        <dt>Seek care within</dt>
        <dd>{care.within}</dd>
        <dt>Where</dt>
        <dd>{care.where_detail}</dd>
        <dt>Tell the provider</dt>
        <dd>
          “{tell}”{" "}
          <button
            className="link no-print"
            onClick={async () => {
              setCopied(await copyText(tell));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </dd>
      </dl>
      {care.self_care && care.self_care.length > 0 && (
        <>
          <h3 style={{ marginTop: "1rem" }}>What to do now</h3>
          <ul>
            {care.self_care.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}
      <h3 style={{ marginTop: "1rem" }}>Go to the emergency department instead if:</h3>
      <ul>
        {care.ed_redirect.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

export function WhatWeAsked({ rule, session, ev }: { rule: Rule; session: Session; ev: Evaluation }) {
  return (
    <div className="stack">
      <p className="small">
        Safety check: answered “No” to all {GLOBAL_RED_FLAGS.length} emergency questions
        {rule.red_flags.length > 0 && ` and all ${rule.red_flags.length} ${rule.assessment_title.toLowerCase()} warning signs`}.
        {session.complaint_text && <> Symptom entered: “{session.complaint_text}”.</>}
      </p>
      <table className="trace-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Answer</th>
          </tr>
        </thead>
        <tbody>
          {ev.items
            .filter((i) => i.question && i.status !== "not_applicable")
            .map((i) => (
              <tr key={i.id}>
                <td>{i.question}</td>
                <td>{i.answer_text}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function RuleInfo({ rule }: { rule: Rule }) {
  return (
    <dl className="kv">
      <dt>Assessment type</dt>
      <dd>
        <TypeBadge type={rule.assessment_type} />
      </dd>
      <dt>Rule</dt>
      <dd>
        <a href={`/assessments/${rule.rule_id}`}>{rule.name}</a>
      </dd>
      <dt>Year validated</dt>
      <dd>{rule.year_validated ?? "Not a validated score (pattern based on published guidance)"}</dd>
      <dt>Citation</dt>
      <dd>
        {rule.citations.map((c) => (
          <div key={c.url}>
            {c.text}{" "}
            <a href={c.url} target="_blank" rel="noreferrer">
              {c.pmid ? `PubMed ${c.pmid}` : "Find on PubMed"}
            </a>
          </div>
        ))}
      </dd>
      <dt>Validated in</dt>
      <dd>{rule.validated_population}</dd>
      <dt>Rule file version</dt>
      <dd>
        {rule.version}, updated {rule.last_updated} · clinical review: {rule.clinical_review.status}
      </dd>
      <dt>Terms of use</dt>
      <dd className="small">{rule.license_note}</dd>
    </dl>
  );
}

function ShareAndLog({ rule, ev, session, summary }: { rule: Rule; ev: Evaluation; session: Session; summary: string }) {
  const [logState, setLogState] = useState<"idle" | "sending" | "sent" | "error" | "declined">("idle");
  const [copied, setCopied] = useState(false);
  const [loggingEnabled, setLoggingEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((b: { logging?: boolean }) => setLoggingEnabled(b.logging !== false))
      .catch(() => setLoggingEnabled(false));
  }, []);
  const send = async () => {
    setLogState("sending");
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logPayload(session, rule, ev)),
      });
      setLogState(res.ok ? "sent" : "error");
    } catch {
      setLogState("error");
    }
  };
  return (
    <div className="stack">
      <div className="box">
        <h3>Summary for a provider</h3>
        <p className="small sub">Shows the rule, score, and result. Does not include your individual answers.</p>
        <pre className="trace">{summary}</pre>
        <button className="link" style={{ marginTop: "0.5rem" }} onClick={async () => setCopied(await copyText(summary))}>
          {copied ? "Copied" : "Copy summary"}
        </button>
      </div>
      {loggingEnabled === false && <p className="small sub">Outcome logging is turned off on this deployment. Nothing from this session is stored.</p>}
      {loggingEnabled && (
      <div className="box">
        <h3>Would you like us to log this assessment?</h3>
        <p className="small">
          Logging helps us improve and validate our assessments. We would store the session ID, the assessment used, your multiple-choice answers, the
          result, and the care level. Your typed symptom, location, IP address, and device details are never stored. Your session data will not be shared
          without consent.
        </p>
        {logState === "sent" ? (
          <p className="small">
            <strong>Logged — thank you.</strong>
          </p>
        ) : logState === "declined" ? (
          <p className="small">Not logged. Nothing from this session was stored.</p>
        ) : (
          <div className="row">
            <button className="primary" onClick={send} disabled={logState === "sending"}>
              {logState === "sending" ? "Sending…" : "Allow logging"}
            </button>
            <button onClick={() => setLogState("declined")} disabled={logState === "sending"}>
              No thanks
            </button>
          </div>
        )}
        {logState === "error" && <p className="small" style={{ color: "var(--alert)" }}>Could not store the record. Nothing was saved.</p>}
      </div>
      )}
    </div>
  );
}

function PlainTrace({ rule, ev, answers }: { rule: Rule; ev: Evaluation; answers: Session["answers"] }) {
  const [show, setShow] = useState(false);
  return (
    <div className="stack">
      <button className="link no-print" onClick={() => setShow((x) => !x)}>
        {show ? "Hide" : "Show"} plain-text audit trace
      </button>
      {show && <pre className="trace">{traceLines(rule, ev, answers).join("\n")}</pre>}
    </div>
  );
}
