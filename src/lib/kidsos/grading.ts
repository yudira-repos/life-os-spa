// KidsOS Studies — tiered grading. Cheapest, most deterministic check first,
// same order the real product uses: exact match, then numeric/fraction
// equivalence, then keyword credit for open-ended answers. No LLM calls —
// grading a kid's math answer has to be trustworthy, not "probably right."

import type { Problem } from "./problem-bank";

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[.,!?$\s]+$/g, "").replace(/\s+/g, " ");
}

const WORD_NUMBERS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  twenty: "20", thirty: "30", forty: "40", fifty: "50",
};

function wordToNumber(s: string) {
  return WORD_NUMBERS[normalize(s)] ?? s;
}

function parseFraction(s: string): number | null {
  const cleaned = s.trim();
  const fractionMatch = cleaned.match(/^-?\d+\s*\/\s*\d+$/);
  if (fractionMatch) {
    const [num, denom] = cleaned.split("/").map((p) => Number(p.trim()));
    if (denom === 0) return null;
    return num / denom;
  }
  const ratioMatch = cleaned.match(/^-?\d+\s*:\s*\d+$/);
  if (ratioMatch) {
    const [num, denom] = cleaned.split(":").map((p) => Number(p.trim()));
    if (denom === 0) return null;
    return num / denom;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function numericEquivalent(a: string, b: string) {
  // Ratios like "2:3" need literal-form comparison too (2:3 !== 4:6 as text,
  // but should both be accepted) — try direct string match on normalized
  // ratio form first, then fall back to numeric value.
  if (a.includes(":") || b.includes(":")) {
    const na = parseFraction(a);
    const nb = parseFraction(b);
    return na != null && nb != null && Math.abs(na - nb) < 1e-9;
  }
  const na = parseFraction(a);
  const nb = parseFraction(b);
  if (na == null || nb == null) return false;
  return Math.abs(na - nb) < 1e-6;
}

export interface GradeResult {
  correct: boolean;
  reason: string;
}

export function gradeProblem(problem: Problem, response: string): GradeResult {
  if (problem.type === "mc") {
    const idx = Number(response);
    return { correct: idx === problem.correctIndex, reason: "multiple-choice" };
  }

  if (problem.type === "numeric") {
    const norm = normalize(response);
    const expected = normalize(problem.answer);
    if (norm === expected) return { correct: true, reason: "exact-match" };

    const wordNormalized = wordToNumber(norm);
    if (wordNormalized === expected) return { correct: true, reason: "word-number" };

    if (numericEquivalent(norm, expected)) return { correct: true, reason: "numeric-equivalence" };

    return { correct: false, reason: "no-match" };
  }

  // Open-ended ("short"): keyword-substring credit. No keywords defined
  // (rare, only the graceful-fallback prompt) means we can't grade it —
  // treat any non-empty answer as effort-credited.
  const norm = normalize(response);
  if (problem.keywords.length === 0) {
    return { correct: norm.length > 0, reason: "effort-credit" };
  }
  const hit = problem.keywords.some((k) => norm.includes(k.toLowerCase()));
  return { correct: hit, reason: hit ? "keyword-match" : "no-keyword-match" };
}
