import { db } from "@/lib/db";
import { stableHash } from "@/lib/financialos/crypto";
import {
  buildFinancialContext,
  contextFingerprint,
  type HouseholdFinancialContext,
} from "@/lib/financialos/profile";
import type { VisibilityScope } from "@/lib/financialos/authz";
import {
  emergencyFundRule,
  highInterestDebtRule,
  estateBasicsRule,
} from "@/lib/financialos/advice/foundation";
import {
  employerMatchRule,
  hsaRule,
  max401kRule,
  rothIraRule,
  megaBackdoorRule,
  spousalIraRule,
  selfEmployedRule,
  retirementTargetRule,
} from "@/lib/financialos/advice/retirement";
import {
  lifeInsuranceRule,
  disabilityInsuranceRule,
  umbrellaInsuranceRule,
} from "@/lib/financialos/advice/insurance";
import { collegeSavingsRule } from "@/lib/financialos/advice/education";
import {
  indexFundRule,
  taxableInvestingRule,
  savingsRateRule,
} from "@/lib/financialos/advice/investing";
import {
  sortRecommendations,
  type Recommendation,
  type RecommendationCategory,
} from "@/lib/financialos/advice/types";

// The engine. It runs every rule against one context object and returns an
// ordered plan.
//
// Deterministic, top to bottom: same inputs, same output, every time. No
// randomness, no model call, no hidden state. That's what makes it possible
// to say "here is exactly why we told you this" — and to test it.
//
// ENGINE_VERSION is bumped whenever a rule's logic or the constants change,
// which invalidates cached snapshots and cached explanations.

export const ENGINE_VERSION = "1.0.0";

export interface FinancialPlan {
  engineVersion: string;
  generatedAt: string;
  inputHash: string;
  recommendations: Recommendation[];
  /** The ordered waterfall — the answer to "what do I do with the next dollar?" */
  waterfall: WaterfallStep[];
  summary: {
    actionCount: number;
    onTrackCount: number;
    criticalCount: number;
    totalAnnualOpportunity: number;
    totalEstimatedTaxSaving: number;
    profileComplete: boolean;
  };
}

export interface WaterfallStep {
  order: number;
  label: string;
  detail: string;
  recommendationIds: string[];
  complete: boolean;
}

export function runRules(context: HouseholdFinancialContext): Recommendation[] {
  const items: (Recommendation | null)[] = [];

  // Foundation
  items.push(emergencyFundRule(context));
  items.push(highInterestDebtRule(context));
  items.push(savingsRateRule(context));

  // Per-earner retirement rules. Order within an earner mirrors the waterfall.
  for (const earner of context.earners) {
    items.push(employerMatchRule(context, earner));
    items.push(hsaRule(context, earner));
    items.push(max401kRule(context, earner));
    items.push(rothIraRule(context, earner));
    items.push(megaBackdoorRule(context, earner));
    items.push(selfEmployedRule(context, earner));
  }

  // Household-level
  items.push(spousalIraRule(context));
  items.push(retirementTargetRule(context));

  // Protection
  items.push(lifeInsuranceRule(context));
  items.push(disabilityInsuranceRule(context));
  items.push(umbrellaInsuranceRule(context));
  items.push(estateBasicsRule(context));

  // Education
  items.push(collegeSavingsRule(context));

  // Investing
  items.push(indexFundRule(context));
  items.push(taxableInvestingRule(context));

  return items.filter((item): item is Recommendation => item !== null);
}

/**
 * The waterfall view: the same recommendations, arranged as an ordered
 * sequence of steps. This is the part someone with no financial background
 * actually needs — not a list of options, but an order.
 */
export function buildWaterfall(
  context: HouseholdFinancialContext,
  recommendations: Recommendation[]
): WaterfallStep[] {
  const byId = new Map(recommendations.map((r) => [r.id, r]));
  const idsMatching = (predicate: (id: string) => boolean) =>
    recommendations.filter((r) => predicate(r.id)).map((r) => r.id);

  const complete = (ids: string[]) =>
    ids.length > 0 && ids.every((id) => byId.get(id)?.status !== "ACTION_NEEDED");

  const steps: Omit<WaterfallStep, "order">[] = [];

  const starterIds = ["emergency_fund"].filter((id) => byId.has(id));
  steps.push({
    label: "Starter emergency fund",
    detail: "One month of essential spending in cash, so a surprise doesn't become debt.",
    recommendationIds: starterIds,
    complete:
      context.netWorth.liquidCents >= context.monthlyEssentialCents &&
      context.monthlyEssentialCents > 0,
  });

  const matchIds = idsMatching((id) => id.startsWith("employer_match_"));
  steps.push({
    label: "Employer 401(k) match",
    detail: "Free money — an instant 50-100% return. Nothing outranks this.",
    recommendationIds: matchIds,
    complete: matchIds.length === 0 ? true : complete(matchIds),
  });

  const debtIds = byId.has("debt_payoff") ? ["debt_payoff"] : [];
  steps.push({
    label: "High-interest debt",
    detail: "Anything above ~7% APR. Paying it off is a guaranteed return you can't get elsewhere.",
    recommendationIds: debtIds,
    complete: debtIds.length === 0 ? true : complete(debtIds),
  });

  const hsaIds = idsMatching((id) => id.startsWith("hsa_"));
  steps.push({
    label: "Max the HSA",
    detail: "The only triple-tax-free account: deductible in, untaxed growth, untaxed out.",
    recommendationIds: hsaIds,
    complete: hsaIds.length === 0 ? true : complete(hsaIds),
  });

  steps.push({
    label: "Full emergency fund",
    detail: `${context.emergencyFundMonthsTarget} months of essential spending, in high-yield savings.`,
    recommendationIds: starterIds,
    complete: complete(starterIds),
  });

  const maxIds = idsMatching((id) => id.startsWith("max_401k_"));
  steps.push({
    label: "Max the 401(k)",
    detail: "Up to the annual employee limit, per person.",
    recommendationIds: maxIds,
    complete: maxIds.length === 0 ? true : complete(maxIds),
  });

  const iraIds = idsMatching(
    (id) => id.startsWith("roth_ira_") || id.startsWith("backdoor_roth_") || id.startsWith("spousal_ira_")
  );
  steps.push({
    label: "Roth IRA (or Backdoor Roth)",
    detail: "Per person, including a non-working spouse. Backdoor route if you're over the income limit.",
    recommendationIds: iraIds,
    complete: iraIds.length === 0 ? true : complete(iraIds),
  });

  const megaIds = idsMatching((id) => id.startsWith("mega_backdoor_"));
  steps.push({
    label: "Mega Backdoor Roth",
    detail: "Only if your plan allows after-tax contributions plus conversion. Huge when available.",
    recommendationIds: megaIds,
    complete:
      megaIds.length === 0
        ? true
        : megaIds.every((id) => {
            const status = byId.get(id)?.status;
            return status === "ON_TRACK" || status === "NOT_APPLICABLE";
          }),
  });

  const eduIds = byId.has("college_savings") ? ["college_savings"] : [];
  steps.push({
    label: "Kids' education (529)",
    detail: "After retirement is on track — there are loans for college, none for retirement.",
    recommendationIds: eduIds,
    complete: eduIds.length === 0 ? true : complete(eduIds),
  });

  const taxableIds = byId.has("taxable_investing") ? ["taxable_investing"] : [];
  steps.push({
    label: "Taxable index funds",
    detail: "No limits, no penalties, favorable capital gains rates. Funds anything before 59½.",
    recommendationIds: taxableIds,
    complete: taxableIds.length === 0 ? false : complete(taxableIds),
  });

  return steps.map((step, index) => ({ ...step, order: index + 1 }));
}

export async function generatePlan(
  householdId: string,
  scope: VisibilityScope,
  options: { persist?: boolean } = {}
): Promise<FinancialPlan> {
  const context = await buildFinancialContext(householdId, scope);
  return generatePlanFromContext(context, options);
}

/** The pure path — no database. This is what the tests exercise. */
export function generatePlanFromContext(
  context: HouseholdFinancialContext,
  options: { persist?: boolean } = {}
): FinancialPlan {
  const recommendations = sortRecommendations(runRules(context));
  const waterfall = buildWaterfall(context, recommendations);
  const inputHash = stableHash({
    engine: ENGINE_VERSION,
    context: contextFingerprint(context),
  });

  const actionable = recommendations.filter((r) => r.status === "ACTION_NEEDED");

  const plan: FinancialPlan = {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    inputHash,
    recommendations,
    waterfall,
    summary: {
      actionCount: actionable.length,
      onTrackCount: recommendations.filter((r) => r.status === "ON_TRACK").length,
      criticalCount: actionable.filter((r) => r.priority === "CRITICAL").length,
      totalAnnualOpportunity: actionable.reduce((sum, r) => sum + (r.annualAmount ?? 0), 0),
      totalEstimatedTaxSaving: actionable.reduce(
        (sum, r) => sum + (r.estimatedTaxSaving ?? 0),
        0
      ),
      profileComplete: context.profileComplete,
    },
  };

  void options;
  return plan;
}

/** Generate and cache. The snapshot is a cache, not a source of truth. */
export async function generateAndPersistPlan(
  householdId: string,
  scope: VisibilityScope
): Promise<FinancialPlan> {
  const plan = await generatePlan(householdId, scope);

  await db.recommendationSnapshot.create({
    data: {
      householdId,
      engineVersion: plan.engineVersion,
      inputHash: plan.inputHash,
      payload: plan as unknown as object,
    },
  });

  // Keep the last 20 snapshots — enough to see how a plan changed over a year,
  // not enough to become a data retention question.
  const stale = await db.recommendationSnapshot.findMany({
    where: { householdId },
    orderBy: { generatedAt: "desc" },
    skip: 20,
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.recommendationSnapshot.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
  }

  return plan;
}

export function groupByCategory(
  recommendations: Recommendation[]
): { category: RecommendationCategory; items: Recommendation[] }[] {
  const order: RecommendationCategory[] = [
    "SAFETY_NET",
    "DEBT",
    "RETIREMENT",
    "TAX",
    "INSURANCE",
    "EDUCATION",
    "INVESTING",
    "GOALS",
    "ESTATE",
  ];

  return order
    .map((category) => ({
      category,
      items: recommendations.filter((r) => r.category === category),
    }))
    .filter((group) => group.items.length > 0);
}
