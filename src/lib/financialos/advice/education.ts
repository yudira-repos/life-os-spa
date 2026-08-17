import {
  ASSUMPTIONS,
  GIFT_AND_ESTATE,
  STATE_529_BENEFIT,
  stateMarginalRate,
} from "@/lib/financialos/constants";
import type { HouseholdFinancialContext } from "@/lib/financialos/profile";
import { money, pct, type Recommendation } from "@/lib/financialos/advice/types";

// Kids' education, with one rule stated up front and applied without apology:
//
//   Retirement comes before college.
//
// There are loans, grants, scholarships, work-study, community college, and
// in-state tuition for education. There is nothing for retirement. A parent
// who underfunds retirement to fully fund college frequently ends up
// financially dependent on that same child twenty years later — which is a
// far worse outcome for the child than a student loan.
//
// So the 529 rule is deliberately positioned AFTER the retirement waterfall,
// and says so.

const COLLEGE_COST_TODAY = {
  inStatePublic: 28_000, // tuition, fees, room and board, per year
  outOfStatePublic: 46_000,
  private: 62_000,
};

export function collegeSavingsRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  if (context.children.length === 0) return null;

  const stateBenefit = STATE_529_BENEFIT[context.stateCode.toUpperCase()];
  const stateRate = stateMarginalRate(context.stateCode);

  // Retirement gate: is the household actually far enough along to prioritize
  // college? "Contributing something to a retirement account" is the bar.
  const retirementFunded = context.earners.some(
    (e) => e.currentDeferralPercent >= 10 || e.currentDeferralDollars > 15_000
  );

  const perChild = context.children.map((child) => {
    const years = child.yearsToCollege ?? 10;
    const futureAnnualCost =
      COLLEGE_COST_TODAY.inStatePublic * Math.pow(1 + ASSUMPTIONS.collegeInflation, years);
    const fourYearCost = futureAnnualCost * 4 * 1.05; // costs rise across the 4 years too

    // Fund half. Explicitly half — see below.
    const target = fourYearCost * 0.5;
    const r = ASSUMPTIONS.equityNominalReturn;
    const monthly =
      years > 0
        ? target / (((Math.pow(1 + r / 12, years * 12) - 1) / (r / 12)))
        : target;

    return {
      name: child.name,
      age: child.age,
      years,
      futureAnnualCost,
      fourYearCost,
      target,
      monthly,
    };
  });

  const totalMonthly = perChild.reduce((sum, c) => sum + c.monthly, 0);
  const existingEducationGoals = context.goals.filter((g) => g.kind === "EDUCATION");
  const existingMonthly =
    existingEducationGoals.reduce((sum, g) => sum + g.monthlyContributionCents, 0) / 100;
  const onTrack = existingMonthly >= totalMonthly * 0.9;

  const twoParentGift = context.hasSpouse
    ? GIFT_AND_ESTATE.annualExclusion * 2
    : GIFT_AND_ESTATE.annualExclusion;

  return {
    id: "college_savings",
    title: "Kids' education savings (529)",
    category: "EDUCATION",
    priority: !retirementFunded ? "LOW" : onTrack ? "LOW" : "MEDIUM",
    status: onTrack ? "ON_TRACK" : "ACTION_NEEDED",
    annualAmount: totalMonthly * 12,
    headline: !retirementFunded
      ? `Fund retirement first. Once that's on track, about ${money(totalMonthly)}/month across ${context.children.length} ${context.children.length === 1 ? "child" : "children"} covers half of in-state public college.`
      : onTrack
        ? `You're contributing ${money(existingMonthly)}/month to education goals — on pace for the half-cost target.`
        : `About ${money(totalMonthly)}/month into 529s puts you on pace to cover half of in-state public college.`,
    why: [
      ...(!retirementFunded
        ? [
            "First, the uncomfortable part: your retirement contributions look light. Retirement comes before college, always. Your child can borrow for school; you cannot borrow for retirement, and a retirement you underfunded becomes their problem in thirty years.",
          ]
        : []),
      "The target here is HALF of in-state public cost, on purpose. Aiming to fully fund private college for multiple children is how families wreck their own retirement. Half, plus current income during the college years, plus the student contributing something, is a realistic and common plan.",
      `College costs rise around ${pct(ASSUMPTIONS.collegeInflation)} a year — faster than general inflation, persistently, for decades. Today's ${money(COLLEGE_COST_TODAY.inStatePublic)} in-state year is projected at ${money(perChild[0].futureAnnualCost)} when ${perChild[0].name} starts.`,
      "A 529 grows tax-free and comes out tax-free for qualified education expenses. That's the whole pitch, and it's a good one.",
      stateBenefit
        ? stateBenefit.type === "NONE"
          ? `${context.stateCode}: ${stateBenefit.note} So pick a 529 on cost and fund quality alone — you're free to use any state's plan.`
          : `${context.stateCode}: ${stateBenefit.note} That's a real, immediate return — worth up to ${money((stateBenefit.maxPerYear ?? 0) * stateRate)} a year at your state rate. Use your own state's plan to capture it.`
        : `Check whether ${context.stateCode} offers a state tax deduction for 529 contributions — about 30 states do, and it's free money if yours is one of them.`,
      `Contributions are gifts for tax purposes. Each parent can give ${money(GIFT_AND_ESTATE.annualExclusion)} per child per year without filing a gift tax return — ${money(twoParentGift)} per child for the two of you.`,
      `Grandparents can superfund: ${GIFT_AND_ESTATE.superfundingMultiplier} years of gifts at once, up to ${money(GIFT_AND_ESTATE.annualExclusion * GIFT_AND_ESTATE.superfundingMultiplier)} per grandparent per child, front-loading the compounding.`,
      "Leftover money isn't stranded: it can move to a sibling, to yourself, or (since SECURE 2.0) up to $35,000 lifetime into the beneficiary's Roth IRA after the account has been open 15 years.",
    ],
    math: perChild.flatMap((child) => [
      {
        label: `${child.name}${child.age != null ? ` (age ${child.age})` : ""} — years to college`,
        value: `${child.years}`,
      },
      { label: `  Projected 4-year cost`, value: money(child.fourYearCost) },
      { label: `  Half-cost target`, value: money(child.target), emphasis: true },
      { label: `  Monthly to get there`, value: money(child.monthly) },
    ]).concat([
      { label: "Total monthly across all children", value: money(totalMonthly), emphasis: true },
      { label: "Currently contributing", value: money(existingMonthly) },
    ]),
    actions: !retirementFunded
      ? [
          "Get retirement contributions to at least 10-15% of income first.",
          "Then start a 529 with whatever you can — even $100/month for 15 years is meaningful.",
        ]
      : [
          stateBenefit && stateBenefit.type !== "NONE"
            ? `Open a ${context.stateCode} 529 to capture the state tax benefit.`
            : "Open a 529 with any state's plan — Utah's my529, Nevada's Vanguard plan, and New York's are consistently low-cost. You're not restricted to your own state.",
          `Set up automatic monthly contributions of about ${money(totalMonthly)} total.`,
          "Choose the age-based / target-enrollment portfolio unless you have a reason not to. It shifts from stocks to bonds automatically as college approaches, which is exactly what you want and exactly what people forget to do manually.",
          "Create an education goal in Goals for each child so progress is visible.",
          "Tell the grandparents the account exists. Contributions beat toys, and a grandparent-owned 529 no longer hurts financial aid the way it used to.",
        ],
    learnKeys: ["529_plan", "college_costs", "financial_aid"],
    caveats: [
      `Cost projections assume ${pct(ASSUMPTIONS.collegeInflation)} college inflation and ${pct(ASSUMPTIONS.equityNominalReturn)} investment returns. Both are long-run assumptions, not forecasts.`,
      "Non-qualified withdrawals owe income tax plus a 10% penalty on the earnings portion (not the contributions).",
      "Assets in a parent-owned 529 count toward financial aid at up to 5.64% — much better than money in the student's own name.",
    ],
  };
}
