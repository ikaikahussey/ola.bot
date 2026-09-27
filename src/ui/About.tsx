import { RULES } from "../rules";

export function About() {
  return (
    <div className="stack">
      <h1 tabIndex={-1}>How OLA BOT works</h1>
      <p>OLA BOT turns a symptom into a care pathway using published clinical decision rules. It runs the same way every time for the same answers.</p>
      <ol>
        <li>
          <strong>Safety check.</strong> Emergency questions come first. Any “yes” stops the assessment and shows 911, 988, or emergency department
          instructions.
        </li>
        <li>
          <strong>Symptom routing.</strong> What you type is matched against a fixed keyword list. You see which rule was chosen and why, and you can change
          it.
        </li>
        <li>
          <strong>Questions.</strong> Only the items the rule needs. Every question has a “Not sure” option.
        </li>
        <li>
          <strong>Scoring.</strong> Points and decision steps come from the rule file. The result screen shows every item, every point, the total, and the
          threshold.
        </li>
        <li>
          <strong>Care routing.</strong> Each result in the rule file names a care level, a time frame, and when to go to the emergency department instead.
        </li>
      </ol>

      <h2>Three kinds of assessment</h2>
      <ul>
        <li>
          <strong>📊 Scoring assessments</strong> add up points (or follow decision steps) and compare the total with published thresholds.
        </li>
        <li>
          <strong>📋 Diagnostic patterns</strong> check whether your symptoms match a typical pattern, such as shingles. The result is a checklist of
          findings present and absent and a yes/no pattern match, not a score.
        </li>
        <li>
          <strong>🚨 Emergency screening</strong> stops as soon as any warning sign is present and shows only the 911 screen.
        </li>
      </ul>

      <h2>No AI in the result</h2>
      <p>
        No language model or machine-learning system is used anywhere in the assessment. Every sentence on the result screen is written in a rule file or a
        fixed template in the source code, which anyone can read.
      </p>

      <h2>Missing answers</h2>
      <p>
        You may skip questions or choose “Not sure”. If more than one question is left blank, you are asked to go back. Unknown answers count as 0 points,
        and the result shows what the score could be if they were “yes”. For items marked important (for example, whether you can bear weight after an
        ankle injury), an unknown answer routes you to the more cautious result.
      </p>

      <h2>Privacy</h2>
      <ul>
        <li>Your answers stay in your browser tab (memory and session storage, cleared when you close the tab) and are never put in page addresses. No account is needed.</li>
        <li>The provider finder sends only the specialty, distance, and ZIP code (or approximate location).</li>
        <li>Your assessment is shared with a provider only if you copy the summary yourself.</li>
        <li>Outcome logging happens only if you tick the consent box and press the button. It stores multiple-choice answers, never typed text or IP address.</li>
      </ul>

      <h2>Provider data</h2>
      <p>
        Provider search uses the public CMS NPPES NPI Registry, which lists licensed providers and practice addresses. It does not include ratings, hours,
        insurance networks, wait times, or appointment availability, so OLA BOT does not show them. Integrations with sources that do provide them can be
        added as server adapters (see the README).
      </p>

      <h2>Limits</h2>
      <ul>
        <li>Most rules were validated with clinicians collecting the answers. Self-reported answers are less accurate; each rule page notes this.</li>
        <li>OLA BOT covers {RULES.length} common complaints. It has no rule for many symptoms.</li>
        <li>Rule files are marked “clinical review: pending” until a licensed clinician signs off on the version.</li>
      </ul>
    </div>
  );
}
