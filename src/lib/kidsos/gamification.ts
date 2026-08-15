// KidsOS Studies — gamification. Point values, level thresholds, and the
// badge catalog are ported directly from the real lifeos-kids product
// (these numbers are tuned and battle-tested there). What's deliberately
// NOT ported: real-money rewards/redemption, campaign multipliers, monthly
// point caps tied to a paid plan, diagnostic-completion points — all of
// that is billing/ops infrastructure this simpler household platform
// doesn't need. See DESIGN.md.

export type PointReason =
  | "CONCEPT_MASTERY"
  | "STREAK_BONUS"
  | "CHALLENGE"
  | "IMPROVEMENT";

export const POINT_VALUES: Record<PointReason, number> = {
  CONCEPT_MASTERY: 100, // passed a practice session on a concept (>=85%)
  STREAK_BONUS: 50, // once per week, at 5+ consecutive active days
  CHALLENGE: 75, // a near-perfect session (>=90% correct, 8+ questions)
  IMPROVEMENT: 125, // a concept climbs from below-mastery to mastered after being stuck
};

export const LEVELS: [number, string][] = [
  [0, "Novice"],
  [100, "Learner"],
  [300, "Scholar"],
  [600, "Master"],
  [1200, "Legend"],
];

export function levelForPoints(points: number) {
  let current = LEVELS[0][1];
  for (const [threshold, name] of LEVELS) {
    if (points >= threshold) current = name;
  }
  return current;
}

export function pointsToNextLevel(points: number): { next: string | null; remaining: number } {
  const next = LEVELS.find(([threshold]) => threshold > points);
  if (!next) return { next: null, remaining: 0 };
  return { next: next[1], remaining: next[0] - points };
}

// A session is "rushed" if it's fast and inaccurate — no points for
// clicking through without trying. Mirrors the real product's anti-gaming
// check (attempts >=3, accuracy <70%, avg time per problem too low).
export function isRushed(total: number, correct: number, durationSeconds: number) {
  if (total < 3) return false;
  const accuracy = correct / total;
  const avgSeconds = durationSeconds / total;
  return accuracy < 0.7 && avgSeconds < 8;
}

export interface BadgeDef {
  key: string;
  name: string;
  emoji: string;
  description: string;
}

export const BADGE_CATALOG: BadgeDef[] = [
  { key: "first_steps", name: "First Steps", emoji: "👟", description: "Completed your first practice session." },
  { key: "problem_solver", name: "Problem Solver", emoji: "🧩", description: "Answered 10 problems correctly." },
  { key: "week_one", name: "Week One", emoji: "🔥", description: "Reached a 5-day streak." },
  { key: "consistency_king", name: "Consistency Champion", emoji: "👑", description: "Reached a 30-day streak." },
  { key: "subject_sweep", name: "Subject Sweep", emoji: "🌟", description: "Practiced 3 different subjects." },
  { key: "scholar", name: "Scholar", emoji: "🎓", description: "Earned 300 total points." },
  { key: "multiplication_master", name: "Multiplication Master", emoji: "✖️", description: "Mastered a multiplication concept." },
  { key: "division_master", name: "Division Master", emoji: "➗", description: "Mastered a division concept." },
  { key: "fraction_master", name: "Fraction Master", emoji: "🍕", description: "Mastered a fractions concept." },
  { key: "decimal_master", name: "Decimal Master", emoji: "💰", description: "Mastered a decimals concept." },
  { key: "geometry_master", name: "Geometry Master", emoji: "📐", description: "Mastered an area/perimeter/volume concept." },
  { key: "grammar_master", name: "Grammar Master", emoji: "✍️", description: "Mastered a grammar or writing concept." },
  { key: "science_explorer", name: "Science Explorer", emoji: "🔬", description: "Mastered a science concept." },
  { key: "map_reader", name: "Map Reader", emoji: "🧭", description: "Mastered a social studies concept." },
];

// concept base -> badge key, for the per-skill "mastered X" badges.
const CONCEPT_BADGES: Record<string, string> = {
  multiplication: "multiplication_master",
  multi_digit_multiply: "multiplication_master",
  division: "division_master",
  long_division: "division_master",
  fractions_intro: "fraction_master",
  fractions_equivalence: "fraction_master",
  fractions_operations: "fraction_master",
  fraction_multiply: "fraction_master",
  decimals_intro: "decimal_master",
  decimal_operations: "decimal_master",
  area_perimeter: "geometry_master",
  volume: "geometry_master",
  grammar_sentences: "grammar_master",
  grammar_parts_of_speech: "grammar_master",
  grammar_verb_tense: "grammar_master",
  grammar_active_passive: "grammar_master",
  writing_paragraphs: "grammar_master",
  writing_persuasive: "grammar_master",
  writing_narrative: "grammar_master",
  writing_argument: "grammar_master",
};

export function badgeForConceptBase(base: string): string | undefined {
  if (CONCEPT_BADGES[base]) return CONCEPT_BADGES[base];
  return undefined;
}

export function badgeForSubjectMastery(subject: string): string | undefined {
  if (subject === "SCIENCE") return "science_explorer";
  if (subject === "SOCIAL_STUDIES") return "map_reader";
  return undefined;
}

// -------------------------------------------------------------- Streaks ---

export function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function isYesterday(last: Date, today: Date) {
  const diffMs = new Date(today.toDateString()).getTime() - new Date(last.toDateString()).getTime();
  return diffMs === 24 * 60 * 60 * 1000;
}

export function touchStreak(
  current: { currentDays: number; longestDays: number; lastActive: Date | null },
  today: Date = new Date()
): { currentDays: number; longestDays: number; lastActive: Date } {
  if (current.lastActive && isSameDay(current.lastActive, today)) {
    return { currentDays: current.currentDays, longestDays: current.longestDays, lastActive: current.lastActive };
  }
  const nextDays =
    current.lastActive && isYesterday(current.lastActive, today) ? current.currentDays + 1 : 1;
  return {
    currentDays: nextDays,
    longestDays: Math.max(current.longestDays, nextDays),
    lastActive: today,
  };
}

export function streakBonusDue(currentDays: number, bonusPaidWeek: string | null, today: Date = new Date()) {
  return currentDays >= 5 && bonusPaidWeek !== isoWeek(today);
}
