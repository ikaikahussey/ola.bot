// PDF report built from the same fixed templates as the screen.

import { jsPDF } from "jspdf";
import { CARE_LEVEL_LABEL } from "../engine/careLevels";
import type { Evaluation } from "../engine/evaluate";
import { formatTimestamp, type Session } from "../engine/session";
import { handoffSummary, tellProvider, traceLines } from "../engine/trace";
import type { Rule } from "../engine/types";
import { GLOBAL_RED_FLAGS } from "../rules";
import { CAVEAT } from "./Result";

// jsPDF's built-in Helvetica covers Latin-1 only; map other symbols.
export function pdfSafe(s: string): string {
  return s
    .replace(/[─━]/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/−/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "");
}

export async function buildPdf({ rule, ev, session }: { rule: Rule; ev: Evaluation; session: Session }): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 54;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;
  const timestamp = session.completed_at ?? new Date().toISOString();

  const write = (text: string, opts: { size?: number; bold?: boolean; mono?: boolean; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFont(opts.mono ? "courier" : "helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(pdfSafe(text), width) as string[];
    for (const line of lines) {
      if (y + size > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += size * 1.35;
    }
    y += opts.gap ?? 4;
  };
  const heading = (t: string) => {
    y += 8;
    write(t, { size: 13, bold: true, gap: 2 });
  };

  write("OLA BOT assessment report", { size: 18, bold: true });
  write(`Session ID: ${session.id}`, { size: 9 });
  write(`Completed: ${formatTimestamp(timestamp)}`, { size: 9, gap: 10 });

  write(rule.assessment_title, { size: 11 });
  write(ev.result_def.label, { size: 16, bold: true });
  write(ev.result_def.interpretation, { size: 11 });

  heading("How we scored it");
  for (const line of traceLines(rule, ev)) write(line, { mono: true, size: 9, gap: 0 });

  heading("Where to go and when");
  const care = ev.result_def.care;
  write(`Care level: ${CARE_LEVEL_LABEL[care.level]}`, { bold: true });
  write(`Seek care within: ${care.within}`);
  write(`Where: ${care.where_detail}`);
  write(`Tell the provider: "${tellProvider(rule, ev)}"`);
  if (care.self_care?.length) {
    write("What to do now:", { bold: true });
    for (const s of care.self_care) write(`- ${s}`, { gap: 0 });
  }
  write("Go to the emergency department instead if:", { bold: true });
  for (const s of care.ed_redirect) write(`- ${s}`, { gap: 0 });

  heading("What we asked");
  write(`Safety check: answered "No" to all ${GLOBAL_RED_FLAGS.length} emergency questions${rule.red_flags.length ? ` and all ${rule.red_flags.length} warning signs for this symptom` : ""}.`);
  for (const i of ev.items) {
    if (!i.question || i.status === "not_applicable") continue;
    write(`Q: ${i.question}`, { gap: 0 });
    write(`A: ${i.answer_text}`, { bold: true });
  }

  heading("Which rule we used");
  write(`${rule.name} (validated ${rule.year_validated}); rule file version ${rule.version}, updated ${rule.last_updated}; clinical review: ${rule.clinical_review.status}.`);
  for (const c of rule.citations) write(`${c.text} ${c.url}`, { size: 9 });
  write(`Validated in: ${rule.validated_population}`, { size: 9 });

  heading("Confidence caveats");
  write(CAVEAT);
  if (ev.limited) write("Assessment limited by missing data.");
  if (ev.range_note) write(ev.range_note);
  if (ev.caution_note) write(ev.caution_note);
  if (rule.self_report_note) write(rule.self_report_note);

  heading("Summary for a provider (no individual answers)");
  write(handoffSummary({ rule, ev, sessionId: session.id, timestamp }), { mono: true, size: 9 });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(pdfSafe(`OLA BOT · session ${session.id} · page ${p} of ${pages}`), margin, doc.internal.pageSize.getHeight() - 30);
  }
  return doc;
}
