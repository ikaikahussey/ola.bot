// Chief complaint router. Explicit keyword matching only — no ML, no fuzzy
// embeddings. The same text always produces the same mapping.

import type { ComplaintMap, Rule } from "./types";

export type RouteResult =
  | { kind: "emergency"; red_flag_id: string; keyword: string }
  | { kind: "match"; rule_id: string; keyword: string }
  | { kind: "ambiguous"; candidates: { rule_id: string; keyword: string }[] }
  | { kind: "none"; suggestions: string[] };

const STOPWORDS = new Set([
  "a", "an", "and", "the", "my", "i", "im", "have", "has", "had", "is", "am", "are", "was",
  "of", "in", "on", "at", "to", "for", "with", "it", "its", "me", "feel", "feeling", "been",
  "got", "very", "really", "bad", "some", "since", "from", "this", "that", "days", "day",
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const FILLERS = new Set(["my", "the", "a", "an", "his", "her", "their", "our", "your"]);

/** Normalized text with filler words removed, so "rolled my ankle" matches "rolled ankle". */
export function matchForm(text: string): string {
  return normalize(text)
    .split(" ")
    .filter((w) => !FILLERS.has(w))
    .join(" ");
}

function containsPhrase(normText: string, phrase: string): boolean {
  const p = matchForm(phrase);
  return p.length > 0 && ` ${normText} `.includes(` ${p} `);
}

export function stem(word: string): string {
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

function tokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((w) => w && !STOPWORDS.has(w))
      .map(stem),
  );
}

export function routeComplaint(text: string, map: ComplaintMap, rules: Rule[]): RouteResult {
  const norm = matchForm(text);

  for (const entry of map.emergency_keywords) {
    const hit = entry.keywords.find((k) => containsPhrase(norm, k));
    if (hit) return { kind: "emergency", red_flag_id: entry.red_flag_id, keyword: hit };
  }

  // Best (longest) keyword match per rule.
  const best = new Map<string, string>();
  for (const entry of map.complaint_map) {
    for (const k of entry.keywords) {
      if (!containsPhrase(norm, k)) continue;
      const prev = best.get(entry.rule_id);
      if (!prev || normalize(k).length > normalize(prev).length) best.set(entry.rule_id, k);
    }
  }
  if (best.size > 0) {
    const ranked = [...best.entries()].sort((a, b) => normalize(b[1]).length - normalize(a[1]).length);
    const topLen = normalize(ranked[0][1]).length;
    const top = ranked.filter(([, k]) => normalize(k).length === topLen);
    if (top.length === 1) return { kind: "match", rule_id: top[0][0], keyword: top[0][1] };
    return {
      kind: "ambiguous",
      candidates: ranked.map(([rule_id, keyword]) => ({ rule_id, keyword })),
    };
  }

  // No direct match: rank rules by shared word stems with their keywords and names.
  const input = tokens(text);
  const scored = rules.map((rule) => {
    const vocab = new Set<string>();
    const keywords = map.complaint_map.filter((e) => e.rule_id === rule.rule_id).flatMap((e) => e.keywords);
    for (const t of [...keywords, rule.condition, rule.assessment_title]) {
      for (const w of tokens(t)) vocab.add(w);
    }
    let overlap = 0;
    for (const w of input) if (vocab.has(w)) overlap++;
    return { rule_id: rule.rule_id, overlap };
  });
  const suggestions = scored
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.rule_id.localeCompare(b.rule_id))
    .slice(0, 5)
    .map((s) => s.rule_id);
  return { kind: "none", suggestions };
}
