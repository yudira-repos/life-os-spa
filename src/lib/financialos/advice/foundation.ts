import { ASSUMPTIONS, SOURCES } from "@/lib/financialos/constants";
import type { HouseholdFinancialContext } from "@/lib/financialos/profile";
import { money, pct, type Recommendation } from "@/lib/financialos/advice/types";

// Steps 0 and 1 of the waterfall: don't get wiped out, and don't pay 22% to a
// credit card while earning 7% in an index fund.
//
// These run before every retirement rule and are marked CRITICAL, because the
// order is the advice. Maxing a 401k while carrying $18,000 at 24% APR is a
// guaranteed loss dressed up as diligence.

export function emergencyFundRule(
  context: HouseholdFinancialContext
): Recommendation {
  const monthlyEssential = context.monthlyEssentialCents / 100;
  const liquid = context.netWorth.liquidCents / 100;
  const targetMonths = context.emergencyFundMonthsTarget;

  if (monthlyEssential <= 0) {
    return {
      id: "emergency_fund",
      title: "Emergency fund",
      category: "SAFETY_NET",
      priority: "CRITICAL",
      status: "NEEDS_INFO",
      headline:
        "Link an account (or add a few months of spending) so we can size your emergency fund.",
      why: [
        "An emergency fund is measured in months of *essential* spending — rent, food, utilities, insurance, minimum debt payments — not in a round number someone picked.",
        "Until there are transactions to look at, any target would be a guess.",
      ],
      math: [],
      actions: [
        "Link your main checking account on the Accounts page.",
        "Give it a few weeks of transactions, or enter a monthly essentials figure manually.",
      ],
      learnKeys: ["emergency_fund"],
    };
  }

  const targetAmount = monthlyEssential * targetMonths;
  const runwayMonths = liquid / monthlyEssential;
  const shortfall = Math.max(targetAmount - liquid, 0);
  const onTrack = liquid >= targetAmount;

  // A starter fund comes before everything except the employer match. A full
  // fund can be built alongside investing.
  const hasStarter = liquid >= monthlyEssential;

  const monthlySurplus = context.monthlySurplusCents / 100;
  const monthsToFill =
    shortfall > 0 && monthlySurplus > 0 ? Math.ceil(shortfall / monthlySurplus) : null;

  return {
    id: "emergency_fund",
    title: "Emergency fund",
    category: "SAFETY_NET",
    priority: onTrack ? "LOW" : hasStarter ? "HIGH" : "CRITICAL",
    status: onTrack ? "ON_TRACK" : "ACTION_NEEDED",
    headline: onTrack
      ? `You have ${runwayMonths.toFixed(1)} months of essential spending in cash — your safety net is funded.`
      : `Build up to ${money(targetAmount)} in cash. You're ${money(shortfall)} short of ${targetMonths} months.`,
    why: [
      `Your essential spending averages ${money(monthlyEssential)} a month, so ${targetMonths} months is ${money(targetAmount)}.`,
      onTrack
        ? "This is the money that keeps a job loss or a medical bill from becoming credit card debt. It's doing its job by being boring and available."
        : "Every other financial move gets harder if a surprise expense forces you to borrow. This is the one balance that should be dull, liquid, and untouched.",
      "Keep it in a high-yield savings account, not invested. The point is that it's there on the worst day of the year, which is exactly the day markets are also down.",
    ],
    math: [
      { label: "Monthly essential spending", value: money(monthlyEssential) },
      { label: `Target (${targetMonths} months)`, value: money(targetAmount), emphasis: true },
      { label: "Cash on hand today", value: money(liquid) },
      { label: "Current runway", value: `${runwayMonths.toFixed(1)} months` },
      ...(shortfall > 0
        ? [{ label: "Still needed", value: money(shortfall), emphasis: true }]
        : []),
      ...(monthsToFill
        ? [
            {
              label: "At your current surplus",
              value: `~${monthsToFill} month${monthsToFill === 1 ? "" : "s"} to fill`,
            },
          ]
        : []),
    ],
    actions: onTrack
      ? [
          "Make sure it's in a high-yield savings account, not a checking account earning nothing.",
          `At ${pct(ASSUMPTIONS.cashReturn)} instead of 0%, ${money(targetAmount)} earns about ${money(targetAmount * ASSUMPTIONS.cashReturn)} a year for doing nothing.`,
        ]
      : [
          "Open a high-yield savings account at a separate bank from your checking — friction is a feature here.",
          "Automate a transfer on payday so it happens before you can spend it.",
          hasStarter
            ? "You can build this alongside retirement contributions; it doesn't have to be finished first."
            : "Get to one month of expenses before anything except capturing your employer 401(k) match.",
        ],
    learnKeys: ["emergency_fund", "high_yield_savings"],
    caveats: [
      "Essential spending is estimated from your categorized transactions. If categories are wrong, this target is wrong — correct them on the Transactions page.",
      context.earners.length > 1
        ? "Two incomes means a job loss is less likely to be total, so 3-6 months is often enough. One income, or variable income, argues for 6-12."
        : "A single income (or self-employment) argues for the higher end — 6 to 12 months.",
    ],
  };
}

export function highInterestDebtRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  // Two sources: what the user told us, and what their linked credit/loan
  // accounts actually show. Take the larger — self-reported debt is often
  // understated, and linked balances often miss the loans held elsewhere.
  const reportedDebt = context.highInterestDebt;
  const reportedApr = context.highInterestDebtApr;

  const creditBalances = context.netWorth.byType
    .filter((t) => t.type === "CREDIT")
    .reduce((sum, t) => sum + Math.abs(Math.min(t.balanceCents, 0)), 0) / 100;

  const debt = Math.max(reportedDebt, creditBalances);
  if (debt <= 0) return null;

  const apr = reportedApr > 0 ? reportedApr : 0.22; // typical card APR when unknown
  const isHighInterest = apr >= ASSUMPTIONS.highInterestDebtApr;
  const annualInterest = debt * apr;

  if (!isHighInterest) {
    return {
      id: "debt_payoff",
      title: "Low-rate debt",
      category: "DEBT",
      priority: "INFO",
      status: "ON_TRACK",
      headline: `Your ${money(debt)} of debt is at ${pct(apr)} — low enough to pay on schedule while you invest.`,
      why: [
        `Below about ${pct(ASSUMPTIONS.highInterestDebtApr)}, the expected return on a diversified index fund (${pct(ASSUMPTIONS.equityNominalReturn)} long-run nominal) is higher than the interest you'd avoid.`,
        "That's an expectation, not a guarantee — paying debt down is a certain return, investing is not. If the balance keeps you up at night, paying it off early is a legitimate answer.",
      ],
      math: [
        { label: "Balance", value: money(debt) },
        { label: "Rate", value: pct(apr) },
        { label: "Annual interest", value: money(annualInterest) },
      ],
      actions: ["Keep making the scheduled payments; don't rush this ahead of investing."],
      learnKeys: ["good_vs_bad_debt"],
    };
  }

  return {
    id: "debt_payoff",
    title: "Pay off high-interest debt",
    category: "DEBT",
    priority: "CRITICAL",
    status: "ACTION_NEEDED",
    headline: `Clear ${money(debt)} at ${pct(apr)} before investing anything beyond your employer match.`,
    annualAmount: debt,
    why: [
      `That debt costs you ${money(annualInterest)} a year, guaranteed.`,
      `A diversified index fund is expected to return about ${pct(ASSUMPTIONS.equityNominalReturn)} a year — and only on average, over decades, with losing years in between.`,
      `Paying off a ${pct(apr)} balance is a risk-free ${pct(apr)} return. Nothing in a brokerage account can promise that.`,
      "The one exception is your employer 401(k) match. A 50-100% instant return beats even this.",
    ],
    math: [
      { label: "Balance", value: money(debt) },
      { label: "Rate", value: pct(apr) },
      { label: "Interest cost per year", value: money(annualInterest), emphasis: true },
      {
        label: "Expected index fund return on the same money",
        value: money(debt * ASSUMPTIONS.equityNominalReturn),
      },
      {
        label: "Difference",
        value: `${money(annualInterest - debt * ASSUMPTIONS.equityNominalReturn)} a year in favor of paying it off`,
        emphasis: true,
      },
    ],
    actions: [
      "Capture your full employer 401(k) match first — that's free money and it outranks even this.",
      "Then throw every spare dollar at the highest-rate balance (the avalanche method) until it's gone.",
      "Call the card issuer and ask for a lower rate. It works more often than people expect, and it costs one phone call.",
      "Consider a 0% balance transfer if you can realistically clear it within the promotional window — and only then.",
    ],
    learnKeys: ["good_vs_bad_debt", "avalanche_vs_snowball"],
    sources: [{ label: "IRS: retirement plan basics", url: SOURCES.irsRetirement2026 }],
    caveats: [
      "This assumes a fixed rate. Variable-rate debt gets worse when rates rise, which strengthens the case rather than weakening it.",
    ],
  };
}

export function estateBasicsRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  const hasKids = context.children.length > 0;
  const hasAssets = context.netWorth.netWorthCents > 5_000_000; // $50k
  if (!hasKids && !hasAssets) return null;
  if (context.hasWill && context.hasEstateBeneficiaries) {
    return {
      id: "estate_basics",
      title: "Will & beneficiaries",
      category: "ESTATE",
      priority: "INFO",
      status: "ON_TRACK",
      headline: "You have a will and your beneficiary designations are set.",
      why: [
        "Beneficiary designations on retirement accounts and life insurance override your will. Both being current is the whole game.",
      ],
      math: [],
      actions: [
        "Re-check beneficiaries after any birth, death, marriage, or divorce in the family.",
      ],
      learnKeys: ["will_vs_beneficiary"],
    };
  }

  const missing: string[] = [];
  if (!context.hasWill) missing.push("a will");
  if (!context.hasEstateBeneficiaries) missing.push("beneficiary designations");

  return {
    id: "estate_basics",
    title: "Will & beneficiaries",
    category: "ESTATE",
    priority: hasKids ? "HIGH" : "MEDIUM",
    status: "ACTION_NEEDED",
    headline: `You're missing ${missing.join(" and ")}${hasKids ? " — and you have children" : ""}.`,
    why: [
      hasKids
        ? "A will is the only place you name a guardian for your children. Without one, a court decides, using a stranger's judgment about your family."
        : "Without a will, state intestacy law decides who gets what — a formula that rarely matches what anyone actually wanted.",
      "Beneficiary designations on 401(k)s, IRAs, and life insurance pass OUTSIDE the will and override it. An ex-spouse listed on a 401(k) from three jobs ago inherits it, will or no will.",
      "This is the cheapest, highest-impact hour in personal finance, and the one people put off longest.",
    ],
    math: [],
    actions: [
      "List beneficiaries (primary AND contingent) on every retirement account and insurance policy. This is free and takes about 20 minutes online.",
      hasKids
        ? "Get a simple will that names a guardian. Online services handle straightforward situations for a few hundred dollars; blended families or a business need an attorney."
        : "Get a simple will. Online services are fine for straightforward situations.",
      "Add a healthcare directive and financial power of attorney while you're at it — same visit, and they matter while you're alive.",
    ],
    learnKeys: ["will_vs_beneficiary", "estate_basics"],
    caveats: [
      "LifeOS isn't a law firm and this isn't legal advice. State law varies substantially — especially community property states.",
    ],
  };
}
