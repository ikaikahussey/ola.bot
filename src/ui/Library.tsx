import { CARE_LEVEL_LABEL } from "../engine/careLevels";
import { describeCondition } from "../engine/describe";
import { fmtPoints } from "../engine/trace";
import type { Rule } from "../engine/types";
import { GLOBAL_RED_FLAGS, RED_FLAGS_VERSION, RULES, RULES_BY_ID } from "../rules";
import { RuleInfo } from "./Result";

const REPO = "https://github.com/ikaikahussey/ola.bot/blob/main";

export function Library({ ruleId }: { ruleId?: string }) {
  const rule = ruleId ? RULES_BY_ID[ruleId] : undefined;
  if (rule) return <RuleDetail rule={rule} />;
  return (
    <div className="stack">
      <h1 tabIndex={-1}>Rules library</h1>
      <p>
        Every assessment in OLA BOT is a static, human-readable JSON file. This page lists each rule, its version, and its source. Each rule links to its
        full definition: questions, points, thresholds, and care routing.
      </p>
      <table className="trace-table">
        <thead>
          <tr>
            <th>Assessment</th>
            <th>Rule</th>
            <th>Validated</th>
            <th>Version</th>
          </tr>
        </thead>
        <tbody>
          {RULES.map((r) => (
            <tr key={r.rule_id}>
              <td>
                <a href={`/rules/${r.rule_id}`}>{r.assessment_title}</a>
                <div className="small sub">{r.condition}</div>
              </td>
              <td>{r.short_name}</td>
              <td>{r.year_validated}</td>
              <td>
                {r.version}
                <div className="small sub">{r.last_updated}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Emergency safety questions</h2>
      <p className="small sub">
        Version {RED_FLAGS_VERSION.version}, updated {RED_FLAGS_VERSION.last_updated}. Asked before every assessment. Any “yes” stops the assessment.
      </p>
      <ol>
        {GLOBAL_RED_FLAGS.map((f) => (
          <li key={f.id}>
            {f.question} <span className="tag">{f.action.replace(/_/g, " ")}</span>
          </li>
        ))}
      </ol>
      <p className="small">
        Source files: <a href={`${REPO}/rules/red_flags.json`}>red_flags.json</a> · <a href={`${REPO}/rules/complaint_map.json`}>complaint_map.json</a>
      </p>
    </div>
  );
}

function RuleDetail({ rule }: { rule: Rule }) {
  return (
    <div className="stack">
      <p className="small">
        <a href="/rules">← All rules</a>
      </p>
      <h1 tabIndex={-1}>{rule.name}</h1>
      <p className="sub">{rule.condition}</p>
      <RuleInfo rule={rule} />
      {rule.self_report_note && <p className="small">{rule.self_report_note}</p>}

      {rule.red_flags.length > 0 && (
        <>
          <h2>Warning-sign questions (asked first)</h2>
          <ol>
            {rule.red_flags.map((f) => (
              <li key={f.id}>
                {f.question} <span className="tag">{f.action.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <h2>Items</h2>
      <table className="trace-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Scoring</th>
          </tr>
        </thead>
        <tbody>
          {rule.items.map((i) => (
            <tr key={i.id}>
              <td>
                <strong>{i.trace_label}</strong>
                {i.type !== "clinician_only" ? (
                  <>
                    <div>{i.question}</div>
                    {i.show_if && <div className="small sub">Asked only if: {describeCondition(i.show_if, rule)}</div>}
                    {i.critical && <div className="small sub">Important item: if unanswered, care routing uses the cautious result.</div>}
                  </>
                ) : (
                  <div className="small sub">Not asked: {i.note}</div>
                )}
              </td>
              <td className="small">
                {i.type === "yes_no" &&
                  (i.points_if_yes !== undefined || i.points_if_no !== undefined
                    ? `Yes ${fmtPoints(i.points_if_yes ?? 0)} · No ${fmtPoints(i.points_if_no ?? 0)}`
                    : "Yes / No (decision input)")}
                {i.type === "choice" &&
                  i.options.map((o) => (
                    <div key={o.value}>
                      {o.label}
                      {o.points !== undefined ? ` (${fmtPoints(o.points)})` : ""}
                    </div>
                  ))}
                {i.type === "clinician_only" && `Fixed ${fmtPoints(i.fixed_points)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Scoring</h2>
      <p>{rule.scoring.threshold_text}</p>
      {rule.overrides && rule.overrides.length > 0 && (
        <>
          <h3>Safety checks (applied before scoring)</h3>
          <ul>
            {rule.overrides.map((o) => (
              <li key={o.label}>
                If {describeCondition(o.when, rule)} → {rule.results[o.result].label}
              </li>
            ))}
          </ul>
        </>
      )}
      {rule.scoring.method === "sum" ? (
        <ul>
          {rule.scoring.bands.map((b, i) => (
            <li key={i}>
              Score {b.min} to {b.max}
              {b.when ? ` when ${describeCondition(b.when, rule)}` : ""} → {rule.results[b.result].label}
            </li>
          ))}
        </ul>
      ) : (
        <ol>
          {rule.scoring.steps.map((s, i) => (
            <li key={i}>
              {s.label} ({describeCondition(s.when, rule)}) → {rule.results[s.result].label}
            </li>
          ))}
          <li>Otherwise → {rule.results[rule.scoring.default_result].label}</li>
        </ol>
      )}

      <h2>Results and care routing</h2>
      {Object.entries(rule.results).map(([k, r]) => (
        <div className="box" key={k}>
          <strong>{r.label}</strong>
          <p className="small">{r.interpretation}</p>
          <p className="small">
            <strong>{CARE_LEVEL_LABEL[r.care.level]}</strong> · {r.care.within} · {r.care.where_detail}
          </p>
        </div>
      ))}

      <h2>Version history</h2>
      <table className="trace-table">
        <thead>
          <tr>
            <th>Version</th>
            <th>Date</th>
            <th>Changes</th>
          </tr>
        </thead>
        <tbody>
          {rule.changelog.map((c) => (
            <tr key={c.version}>
              <td>{c.version}</td>
              <td>{c.date}</td>
              <td>{c.changes}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details>
        <summary style={{ color: "var(--link)", cursor: "pointer" }}>Raw rule file (JSON)</summary>
        <p className="small">
          <a href={`${REPO}/rules/algorithms/${rule.rule_id}.json`}>View on GitHub</a>
        </p>
        <pre className="trace">{JSON.stringify(rule, null, 2)}</pre>
      </details>
    </div>
  );
}
