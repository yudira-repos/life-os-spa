// The shape every rule produces. Two things are non-negotiable:
//
//   `why`  — the reasoning, in the rule's own words, never omitted. A
//            recommendation you can't interrogate is astrology.
//   `math` — the actual numbers used to reach it, so the user (or a real
//            advisor, or a future maintainer) can check the arithmetic.
//
// This is what separates the module from "financial advisors of corporate":
// nothing is recommended because it's profitable to recommend it, and
// everything shows its work.

export type RecommendationPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type RecommendationCategory =
  | "SAFETY_NET"
  | "DEBT"
  | "RETIREMENT"
  | "TAX"
  | "EDUCATION"
  | "INSURANCE"
  | "INVESTING"
  | "ESTATE"
  | "GOALS";

export type RecommendationStatus =
  | "ACTION_NEEDED"
  | "ON_TRACK"
  | "NOT_APPLICABLE"
  | "NEEDS_INFO";

export interface MathLine {
  label: string;
  value: string;
  /** True for the bottom-line number the recommendation turns on. */
  emphasis?: boolean;
}

export interface Recommendation {
  /** Stable id — used for explanation caching and for user dismissal later. */
  id: string;
  title: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  status: RecommendationStatus;

  /** One sentence a beginner can act on. */
  headline: string;
  /** The reasoning, deterministic and rule-authored. */
  why: string[];
  /** The arithmetic behind the headline. */
  math: MathLine[];
  /** Concrete next steps, in order. */
  actions: string[];

  /** Which member this applies to, when it's person-specific. */
  memberId?: string;
  memberName?: string;

  /** Annual dollars this recommendation is about, when it has an amount. */
  annualAmount?: number;
  /** Estimated first-year tax saving, when the rule can compute one. */
  estimatedTaxSaving?: number;

  /** Terms in this recommendation that the Learn library explains. */
  learnKeys?: string[];
  /** Authoritative source links, for the "don't just trust us" case. */
  sources?: { label: string; url: string }[];
  /** Things that would change the answer — stated, not hidden. */
  caveats?: string[];
}

export const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  CRITICAL: "Do this first",
  HIGH: "High impact",
  MEDIUM: "Worth doing",
  LOW: "When you get to it",
  INFO: "Good to know",
};

export const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  SAFETY_NET: "Safety net",
  DEBT: "Debt",
  RETIREMENT: "Retirement",
  TAX: "Taxes",
  EDUCATION: "Kids' education",
  INSURANCE: "Insurance",
  INVESTING: "Investing",
  ESTATE: "Estate",
  GOALS: "Goals",
};

export function sortRecommendations(items: Recommendation[]): Recommendation[] {
  return [...items].sort((a, b) => {
    // On-track items sink below action items of the same priority — the list
    // should open on what to do, not on what's already fine.
    const statusRank = (r: Recommendation) => (r.status === "ACTION_NEEDED" ? 0 : 1);
    const byStatus = statusRank(a) - statusRank(b);
    if (byStatus !== 0) return byStatus;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

export function money(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function pct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}
