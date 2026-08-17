import { ASSUMPTIONS } from "@/lib/financialos/constants";
import { dollarsToCents } from "@/lib/financialos/money";

// Goal templates — the "I don't know where to start" answer.
//
// Somebody who has never planned a savings goal doesn't need a blank form
// with a dollar field. They need a starting point with a defensible number
// already in it, an explanation of where that number came from, and the
// ability to change it. That's what a template is here.
//
// Every template's suggested amount is derived from something real (average
// funeral cost, typical down payment percentage, months of expenses) and says
// what it's derived from, so the number can be argued with rather than
// obeyed.

export type GoalKind =
  | "EMERGENCY"
  | "VACATION"
  | "PROPERTY"
  | "EDUCATION"
  | "VEHICLE"
  | "WEDDING"
  | "FUNERAL"
  | "DEBT_PAYOFF"
  | "HOME_REPAIR"
  | "NEW_BABY"
  | "CUSTOM";

export interface GoalTemplate {
  key: string;
  kind: GoalKind;
  name: string;
  emoji: string;
  tagline: string;
  /** Why this goal exists at all — often the part people haven't considered. */
  rationale: string[];
  /** How the suggested target is computed. */
  basis: string;
  /** Suggested target in dollars, or a function of household context. */
  suggestedTarget: number | ((input: TemplateInput) => number);
  suggestedMonths: number;
  priority: number;
  tips: string[];
  whereToKeepIt: string;
}

export interface TemplateInput {
  monthlyEssential: number;
  monthlyIncome: number;
  annualIncome: number;
  emergencyMonths: number;
  childCount: number;
  stateCode: string;
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    key: "emergency_fund",
    kind: "EMERGENCY",
    name: "Emergency fund",
    emoji: "🧯",
    tagline: "The one that makes every other goal survivable.",
    rationale: [
      "Without this, one bad month turns into credit card debt at 22%, and every other plan on this list stalls for years while you dig out.",
      "It's not an investment. Its return is that it's there on the worst day of the year — which is often exactly when markets are down and you'd hate to sell.",
    ],
    basis: "Your average monthly essential spending × your target number of months.",
    suggestedTarget: (input) => input.monthlyEssential * input.emergencyMonths,
    suggestedMonths: 18,
    priority: 10,
    tips: [
      "Keep it at a different bank from your checking account. The extra two days it takes to move money is a feature.",
      "High-yield savings, not investments, and not a CD that locks it up.",
      "Refill it immediately after using it. Using it is not failure — that's the whole point of it.",
    ],
    whereToKeepIt: "High-yield savings account (currently ~4% APY)",
  },
  {
    key: "vacation",
    kind: "VACATION",
    name: "Family vacation",
    emoji: "🏖️",
    tagline: "Pay for the trip before you take it, not for 18 months after.",
    rationale: [
      "Vacations are one of the most common sources of credit card debt, and the most avoidable — the date is known months ahead.",
      "Saving for it in advance also makes the trip better. Money that's already set aside gets spent without the low-level guilt that ruins a good week.",
    ],
    basis: "A typical domestic family trip of about a week, including flights and lodging.",
    suggestedTarget: (input) => 2_500 + input.childCount * 900,
    suggestedMonths: 12,
    priority: 60,
    tips: [
      "Set the target date to about a month before you'd book, not the departure date — flights and hotels get paid early.",
      "Book flights 2-3 months ahead domestically, 4-6 internationally.",
      "A separate account for this keeps it from quietly funding groceries.",
    ],
    whereToKeepIt: "High-yield savings — the horizon is too short to invest",
  },
  {
    key: "home_down_payment",
    kind: "PROPERTY",
    name: "Home down payment",
    emoji: "🏡",
    tagline: "The largest savings goal most households ever have.",
    rationale: [
      "20% down avoids private mortgage insurance (PMI), which typically costs 0.5-1.5% of the loan a year and buys you nothing.",
      "You can buy with less — 3-5% is common for first-time buyers — but the monthly cost is higher and it stays higher until you reach 20% equity.",
      "Budget 2-5% of the purchase price for closing costs on top of the down payment. This is the number that surprises first-time buyers.",
    ],
    basis: "20% of roughly 4× household income, a common affordability ceiling.",
    suggestedTarget: (input) => Math.round(input.annualIncome * 4 * 0.2),
    suggestedMonths: 48,
    priority: 40,
    tips: [
      "Money you'll need within 3 years does not belong in the stock market. High-yield savings, T-bills, or a short-term treasury fund.",
      "Get pre-approved before you shop seriously — it tells you the real number instead of a guess.",
      "Don't forget the ongoing costs: property tax, insurance, maintenance at roughly 1% of home value a year.",
      "First-time buyer programs exist in most states and are widely unclaimed. Check yours.",
    ],
    whereToKeepIt: "High-yield savings or short-term Treasuries — not stocks",
  },
  {
    key: "college_fund",
    kind: "EDUCATION",
    name: "College fund",
    emoji: "🎓",
    tagline: "Half of in-state public, per child. Not all of private.",
    rationale: [
      "Aiming to fully fund private college for multiple children is how families sabotage their own retirement.",
      "Half the cost, plus income during the college years, plus the student contributing something, is a realistic plan that most families can actually hit.",
      "Retirement comes first. There are loans, grants, and scholarships for college. There is nothing for retirement.",
    ],
    basis: "Half of four years of in-state public college, inflated at 5% a year to when the child starts.",
    suggestedTarget: 90_000,
    suggestedMonths: 180,
    priority: 50,
    tips: [
      "Use a 529 — tax-free growth, tax-free withdrawals for education, and about 30 states give a state tax deduction.",
      "Pick the age-based portfolio so it de-risks automatically as college approaches.",
      "Leftover funds can move to a sibling, to you, or up to $35,000 into the child's Roth IRA after 15 years.",
      "Tell the grandparents. Contributions beat toys.",
    ],
    whereToKeepIt: "529 plan, age-based portfolio",
  },
  {
    key: "funeral_fund",
    kind: "FUNERAL",
    name: "Funeral & final expenses",
    emoji: "🕊️",
    tagline: "The goal nobody wants to set, and the one families are most grateful for.",
    rationale: [
      "A funeral in the US typically runs $8,000-$12,000, and the bill arrives within days — during the week a family is least able to think about money.",
      "Without a plan, this lands on a credit card or a hastily organized fundraiser, on top of grief.",
      "This is deliberately NOT a reason to buy 'final expense' or 'burial' life insurance. Those policies are sold hard to older people and are among the worst value in the industry: premiums often exceed the payout if you live a normal lifespan, and coverage is tiny. A savings account does the same job without the sales call.",
      "If you already have adequate term life insurance, this is covered — you don't need a separate fund. This goal is for households that don't.",
    ],
    basis: "Median US funeral and burial cost, plus a margin for travel and related expenses.",
    suggestedTarget: 15_000,
    suggestedMonths: 60,
    priority: 70,
    tips: [
      "Write down your wishes — burial vs cremation, service or not — and tell someone where it's written. Families overspend enormously when they're guessing what you'd have wanted.",
      "A regular savings or brokerage account is fine. Avoid prepaid funeral plans: they're often non-transferable and non-refundable if you move or the home changes hands.",
      "Make sure a joint owner or a payable-on-death beneficiary is on the account so it's accessible immediately, without probate.",
      "Estimate for both adults, not just one.",
    ],
    whereToKeepIt: "High-yield savings with a payable-on-death beneficiary",
  },
  {
    key: "new_vehicle",
    kind: "VEHICLE",
    name: "Next car",
    emoji: "🚗",
    tagline: "Save for the next one while driving this one.",
    rationale: [
      "Cars are a guaranteed future expense that people treat as a surprise, then finance at 8-12% under time pressure at a dealership.",
      "Saving the equivalent of a car payment while you have no car payment means the next purchase is negotiated from a position of not needing anything.",
    ],
    basis: "A reliable used vehicle, which is where the value is.",
    suggestedTarget: 22_000,
    suggestedMonths: 48,
    priority: 65,
    tips: [
      "A 2-4 year old car has taken the steepest depreciation and usually has warranty left.",
      "Arrange financing through your own bank or credit union before you walk in, even if you plan to pay cash.",
      "Negotiate the total price, never the monthly payment. Monthly payment negotiation is how a longer loan gets sold as a discount.",
    ],
    whereToKeepIt: "High-yield savings",
  },
  {
    key: "wedding",
    kind: "WEDDING",
    name: "Wedding",
    emoji: "💍",
    tagline: "A number set in advance, before anyone says 'it's a once in a lifetime day'.",
    rationale: [
      "Wedding budgets expand to fill whatever is available, and then some. Deciding the number early, together, is most of the work.",
      "Starting a marriage with debt from the wedding is a poor trade for a better dinner.",
    ],
    basis: "Roughly the US median wedding cost.",
    suggestedTarget: 30_000,
    suggestedMonths: 24,
    priority: 68,
    tips: [
      "Decide the total first, then allocate. Not the other way around.",
      "Guest count is the single biggest lever — nearly every cost scales with it.",
      "Never tell a vendor it's for a wedding before getting a price.",
    ],
    whereToKeepIt: "High-yield savings",
  },
  {
    key: "home_repair",
    kind: "HOME_REPAIR",
    name: "Home maintenance fund",
    emoji: "🔧",
    tagline: "The roof is not a surprise. It's a schedule.",
    rationale: [
      "Homeowners should expect roughly 1% of the home's value in maintenance per year, averaged over time — lumpy in practice, with a $12,000 roof or a $9,000 HVAC arriving all at once.",
      "This is separate from the emergency fund. If a water heater drains the emergency fund, a job loss the following month has nowhere to go.",
    ],
    basis: "About 1% of home value per year, held as a rolling balance.",
    suggestedTarget: 15_000,
    suggestedMonths: 36,
    priority: 55,
    tips: [
      "Know the age of the roof, HVAC, and water heater. That tells you which expense is coming and roughly when.",
      "Service the HVAC annually. It's the cheapest way to delay the expensive replacement.",
    ],
    whereToKeepIt: "High-yield savings",
  },
  {
    key: "new_baby",
    kind: "NEW_BABY",
    name: "New baby",
    emoji: "👶",
    tagline: "The first year costs more than the birth does.",
    rationale: [
      "Delivery with insurance commonly runs $3,000-$5,000 out of pocket after deductible and coinsurance.",
      "The larger number is what follows: childcare in most metros runs $1,200-$2,500 a month, and it starts before any leave ends.",
      "Unpaid or partially paid parental leave is a second hit at exactly the same moment.",
    ],
    basis: "Out-of-pocket delivery costs plus three months of expenses to cover reduced income.",
    suggestedTarget: (input) => 5_000 + input.monthlyEssential * 3,
    suggestedMonths: 12,
    priority: 45,
    tips: [
      "Check your health plan's out-of-pocket maximum — that's the real worst case, and it resets on January 1, which matters for a December due date.",
      "Add the baby to insurance within 30 days of birth. This deadline is real and unforgiving.",
      "Open the 529 early. Years of compounding matter more than the amount.",
      "Update life insurance and beneficiaries. This is the most common moment for coverage to become inadequate.",
    ],
    whereToKeepIt: "High-yield savings",
  },
];

export const TEMPLATE_BY_KEY: Record<string, GoalTemplate> = Object.fromEntries(
  GOAL_TEMPLATES.map((t) => [t.key, t])
);

export function resolveTemplateTarget(
  template: GoalTemplate,
  input: TemplateInput
): number {
  const raw =
    typeof template.suggestedTarget === "function"
      ? template.suggestedTarget(input)
      : template.suggestedTarget;
  return Math.max(Math.round(raw), 0);
}

export function templateToGoalData(
  template: GoalTemplate,
  input: TemplateInput,
  householdId: string
) {
  const targetDollars = resolveTemplateTarget(template, input);
  const targetCents = dollarsToCents(targetDollars);
  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() + template.suggestedMonths);

  return {
    householdId,
    templateKey: template.key,
    name: template.name,
    kind: template.kind,
    targetCents,
    targetDate,
    monthlyContributionCents: Math.round(targetCents / Math.max(template.suggestedMonths, 1)),
    priority: template.priority,
  };
}

// --- Funding math -----------------------------------------------------------

export interface GoalProgress {
  progressFraction: number;
  remainingCents: number;
  monthsRemaining: number | null;
  requiredMonthlyCents: number | null;
  onTrack: boolean;
  projectedCompletion: Date | null;
  /** True when the horizon is long enough that investing beats savings. */
  investable: boolean;
}

export function goalProgress(goal: {
  targetCents: number;
  currentCents: number;
  monthlyContributionCents: number;
  targetDate: Date | null;
}): GoalProgress {
  const remainingCents = Math.max(goal.targetCents - goal.currentCents, 0);
  const progressFraction =
    goal.targetCents > 0 ? Math.min(goal.currentCents / goal.targetCents, 1) : 0;

  const monthsRemaining =
    goal.targetDate != null
      ? Math.max(
          Math.ceil(
            (goal.targetDate.getTime() - Date.now()) / (30.44 * 24 * 60 * 60 * 1000)
          ),
          0
        )
      : null;

  const requiredMonthlyCents =
    monthsRemaining && monthsRemaining > 0
      ? Math.ceil(remainingCents / monthsRemaining)
      : remainingCents > 0
        ? remainingCents
        : 0;

  const projectedCompletion =
    goal.monthlyContributionCents > 0 && remainingCents > 0
      ? new Date(
          Date.now() +
            (remainingCents / goal.monthlyContributionCents) * 30.44 * 24 * 60 * 60 * 1000
        )
      : remainingCents === 0
        ? new Date()
        : null;

  return {
    progressFraction,
    remainingCents,
    monthsRemaining,
    requiredMonthlyCents,
    onTrack:
      requiredMonthlyCents == null ||
      goal.monthlyContributionCents >= requiredMonthlyCents,
    projectedCompletion,
    // Under ~3 years, market risk isn't worth the extra expected return —
    // a 30% drawdown the year before you need the money is unrecoverable.
    investable: (monthsRemaining ?? 0) >= 36,
  };
}

/** What a goal balance grows to if invested vs held in cash. */
export function projectGoalGrowth(
  monthlyCents: number,
  months: number,
  invested: boolean
): number {
  const annualRate = invested ? ASSUMPTIONS.equityNominalReturn : ASSUMPTIONS.cashReturn;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return monthlyCents * months;
  return Math.round(monthlyCents * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate));
}
