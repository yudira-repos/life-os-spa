import { ASSUMPTIONS } from "@/lib/financialos/constants";
import type { HouseholdFinancialContext } from "@/lib/financialos/profile";
import { money, pct, type Recommendation } from "@/lib/financialos/advice/types";

// Life insurance, answered honestly.
//
// This is the area where commission-driven advice does the most damage, so
// the rules here are explicit about the conflict of interest rather than
// diplomatic about it. A whole life policy pays the agent who sells it a
// commission of roughly the entire first year's premium. A term policy
// covering the same risk for a fraction of the cost pays a fraction of that.
// That asymmetry explains an enormous amount of what families get sold.
//
// The module's position, stated plainly and applied consistently:
//   - Insurance exists to replace income if someone dies. That's it.
//   - Term insurance does that job at roughly 1/10th the cost.
//   - Invest the difference in index funds.
//   - Whole life is a legitimate product for a narrow set of situations
//     (estate liquidity above the exemption, a permanently dependent child,
//     a business buy-sell agreement) and a poor one for everyone else.

/** DIME: Debt, Income, Mortgage, Education — a defensible coverage estimate. */
export function lifeInsuranceRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  const hasDependents = context.children.length > 0 || context.hasSpouse;
  if (!hasDependents) return null;

  const income = context.householdIncome;
  if (income <= 0) {
    return {
      id: "life_insurance",
      title: "Life insurance",
      category: "INSURANCE",
      priority: "MEDIUM",
      status: "NEEDS_INFO",
      headline: "Add income details in Setup so we can size the coverage your family would need.",
      why: ["Coverage is sized against the income it has to replace, so we need that number first."],
      math: [],
      actions: ["Fill in the earner details on the Setup page."],
      learnKeys: ["term_life"],
    };
  }

  // DIME components
  const debt = context.highInterestDebt;
  const mortgage =
    context.netWorth.byType
      .filter((t) => t.type === "LOAN")
      .reduce((sum, t) => sum + Math.abs(Math.min(t.balanceCents, 0)), 0) / 100;

  const youngestChildAge = context.children
    .map((c) => c.age)
    .filter((a): a is number => a != null)
    .sort((a, b) => a - b)[0];

  // Replace income until the youngest child is independent, minimum 10 years.
  const incomeYears =
    youngestChildAge != null ? Math.max(22 - youngestChildAge, 10) : 10;
  const incomeReplacement = income * incomeYears;

  const educationPerChild = 120_000; // 4 years, in-state public, today's dollars
  const education = context.children.length * educationPerChild;

  const totalNeed = debt + incomeReplacement + mortgage + education;
  const liquidAssets = context.netWorth.liquidCents / 100 + context.netWorth.investedCents / 100;
  const netNeed = Math.max(totalNeed - liquidAssets, 0);

  const termPolicies = context.policies.filter((p) => p.type === "TERM_LIFE");
  const wholePolicies = context.policies.filter(
    (p) => p.type === "WHOLE_LIFE" || p.type === "UNIVERSAL_LIFE"
  );
  const existingCoverage =
    context.policies
      .filter((p) => ["TERM_LIFE", "WHOLE_LIFE", "UNIVERSAL_LIFE"].includes(p.type))
      .reduce((sum, p) => sum + p.coverageCents, 0) / 100;

  const gap = Math.max(netNeed - existingCoverage, 0);
  const onTrack = gap <= 0;

  const primaryAge = context.earners.map((e) => e.age).find((a): a is number => a != null) ?? 40;
  // Rough healthy-applicant pricing for $1M of 20-year level term, per year.
  const estimatedTermAnnual = Math.round(
    (gap / 1_000_000) * (primaryAge < 35 ? 500 : primaryAge < 45 ? 800 : primaryAge < 55 ? 1_800 : 4_500)
  );
  const wholeLifeEquivalent = estimatedTermAnnual * 10;

  return {
    id: "life_insurance",
    title: "Term life insurance",
    category: "INSURANCE",
    priority: onTrack ? "LOW" : context.children.length > 0 ? "HIGH" : "MEDIUM",
    status: onTrack ? "ON_TRACK" : "ACTION_NEEDED",
    annualAmount: estimatedTermAnnual,
    headline: onTrack
      ? `Your ${money(existingCoverage)} of coverage meets the ${money(netNeed)} your family would need.`
      : `Your family would need about ${money(netNeed)} of coverage. You have ${money(existingCoverage)} — buy ${money(gap)} of TERM insurance, not whole life.`,
    why: [
      "Life insurance has exactly one job: if you die, your family doesn't also lose the house, the college fund, and their standard of living. It is not a savings vehicle and not an investment.",
      `Sizing it with the DIME method — Debt ${money(debt)}, Income replacement ${money(incomeReplacement)} (${incomeYears} years), Mortgage ${money(mortgage)}, Education ${money(education)} — comes to ${money(totalNeed)}, less ${money(liquidAssets)} you already have invested.`,
      "Buy TERM, level for 20 or 30 years, matched to how long anyone depends on your income. When the kids are grown and the mortgage is paid, the need ends and so should the policy.",
      `Whole life covering the same amount typically costs roughly ten times as much — around ${money(wholeLifeEquivalent)} a year instead of ${money(estimatedTermAnnual)}.`,
      `Invest the ${money(wholeLifeEquivalent - estimatedTermAnnual)} difference in index funds instead and, at ${pct(ASSUMPTIONS.equityNominalReturn)} over 30 years, it becomes roughly ${money((wholeLifeEquivalent - estimatedTermAnnual) * ((Math.pow(1 + ASSUMPTIONS.equityNominalReturn, 30) - 1) / ASSUMPTIONS.equityNominalReturn))}. That is the entire argument, and it's why "buy term and invest the difference" has survived every rebuttal for fifty years.`,
      "Be ready for the sales pitch. Whole life is sold on 'guaranteed returns', 'tax-free growth', and 'you get money back'. What's rarely said out loud: the internal return over the first decade is usually negative, the fees are opaque, surrendering early loses most of what you paid in, and the agent's commission is often close to your entire first-year premium.",
      "Cover BOTH spouses if both contribute — including a non-earning spouse. Replacing full-time childcare and household management costs real money that would suddenly have to be paid.",
      ...(wholePolicies.length > 0
        ? [
            `You already hold ${wholePolicies.length} permanent policy${wholePolicies.length === 1 ? "" : "ies"}. Don't cancel reflexively — if it's several years old the worst costs are already sunk, and there may be a 1035 exchange or reduced-paid-up option that beats surrendering. Get an in-force illustration before deciding anything.`,
          ]
        : []),
    ],
    math: [
      { label: "Debt", value: money(debt) },
      { label: `Income replacement (${incomeYears} years)`, value: money(incomeReplacement) },
      { label: "Mortgage & loans", value: money(mortgage) },
      { label: `Education (${context.children.length} child${context.children.length === 1 ? "" : "ren"})`, value: money(education) },
      { label: "Total need (DIME)", value: money(totalNeed), emphasis: true },
      { label: "Less assets already invested", value: `− ${money(liquidAssets)}` },
      { label: "Coverage needed", value: money(netNeed), emphasis: true },
      { label: "Coverage you have", value: money(existingCoverage) },
      ...(gap > 0
        ? [
            { label: "Gap", value: money(gap), emphasis: true },
            { label: "Estimated term cost", value: `~${money(estimatedTermAnnual)}/year` },
            { label: "Same coverage as whole life", value: `~${money(wholeLifeEquivalent)}/year` },
            { label: "Annual difference", value: money(wholeLifeEquivalent - estimatedTermAnnual), emphasis: true },
          ]
        : []),
    ],
    actions: onTrack
      ? [
          "Check the term end dates — coverage that expires while a child is still 12 is a problem you want to find now, not then.",
          "Confirm beneficiaries are current on every policy.",
        ]
      : [
          `Get quotes for ${money(gap)} of level term, ${incomeYears <= 20 ? "20" : "30"}-year, from at least three carriers. Term insurance is a commodity — the only differences that matter are price and the carrier's financial strength rating.`,
          "Use a fee-based broker or a direct online quote service. If someone steers you toward whole life within five minutes of meeting you, they're selling, not advising.",
          "Apply while you're healthy. Pricing is set at underwriting and locked for the term; every year you wait costs more, and a diagnosis can make you uninsurable.",
          "Also check what your employer provides. Group life is usually 1-2x salary — helpful, but nowhere near enough, and it disappears when you leave the job.",
          ...(termPolicies.length > 0 ? ["Add the new policy on top of your existing term rather than replacing it — laddering is fine and often cheaper."] : []),
        ],
    learnKeys: ["term_life", "whole_life", "dime_method"],
    caveats: [
      "Premium estimates are order-of-magnitude for a healthy applicant. Real pricing depends on health, family history, tobacco use, and the carrier.",
      "Whole life genuinely fits some situations: estates above the federal exemption needing liquidity, a permanently dependent child, or funding a business buy-sell agreement. If one of those describes you, that's a conversation with a fee-only advisor — one who charges you rather than the insurer.",
    ],
  };
}

export function disabilityInsuranceRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  if (context.householdIncome <= 0) return null;
  const hasDisability = context.policies.some((p) => p.type === "DISABILITY");

  const primaryIncome = context.earners[0]?.annualIncome ?? 0;
  const targetBenefit = primaryIncome * 0.6;

  return {
    id: "disability_insurance",
    title: "Disability insurance",
    category: "INSURANCE",
    priority: hasDisability ? "INFO" : "MEDIUM",
    status: hasDisability ? "ON_TRACK" : "ACTION_NEEDED",
    annualAmount: targetBenefit,
    headline: hasDisability
      ? "You have disability coverage — the risk most people forget entirely."
      : `You're far more likely to be disabled than to die during your working years, and you have no disability coverage listed.`,
    why: [
      "Roughly one in four of today's 20-year-olds will experience a disability lasting a year or more before retirement. That's meaningfully more likely than dying in the same window — and yet almost everyone buys life insurance first.",
      "Your ability to earn is your largest asset. A 35-year-old earning $150,000 will earn something like $6 million over a career. Insuring the house and not that is backwards.",
      `Aim for a benefit around 60% of income — roughly ${money(targetBenefit)} a year. Benefits from a policy you paid for with after-tax dollars are tax-free, which is why 60% of gross replaces close to your take-home.`,
      "Check the definition of disability in the policy. 'Own occupation' pays if you can't do YOUR job; 'any occupation' pays only if you can't do any work at all. The difference is enormous, and it's where cheap policies get cheap.",
      "Employer group coverage is a good start but usually caps out, is taxable if the employer pays the premium, and vanishes when you change jobs.",
    ],
    math: [
      { label: "Primary income", value: money(primaryIncome) },
      { label: "Target benefit (60%)", value: money(targetBenefit), emphasis: true },
      { label: "Typical cost", value: "1-3% of income per year" },
    ],
    actions: hasDisability
      ? [
          "Verify it's 'own occupation' and check the elimination period (how long before benefits start — 90 days is standard).",
          "Confirm whether it's portable if you change employers.",
        ]
      : [
          "Start with what your employer offers — it's the cheapest coverage available and requires no underwriting.",
          "Add an individual own-occupation policy on top if you're a high earner or in a specialized profession.",
          "Pay the premium with after-tax dollars so the benefit arrives tax-free.",
        ],
    learnKeys: ["disability_insurance"],
  };
}

export function umbrellaInsuranceRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  const netWorth = context.netWorth.netWorthCents / 100;
  if (netWorth < 500_000) return null;

  const hasUmbrella = context.policies.some((p) => p.type === "UMBRELLA");
  const suggested = Math.ceil(netWorth / 1_000_000) * 1_000_000;

  return {
    id: "umbrella_insurance",
    title: "Umbrella liability insurance",
    category: "INSURANCE",
    priority: hasUmbrella ? "INFO" : "LOW",
    status: hasUmbrella ? "ON_TRACK" : "ACTION_NEEDED",
    headline: hasUmbrella
      ? "You have umbrella coverage protecting your net worth from a liability claim."
      : `With ${money(netWorth)} of net worth, ${money(suggested)} of umbrella coverage costs a few hundred dollars a year.`,
    why: [
      "Umbrella insurance sits above your auto and home policies and covers liability beyond their limits — a serious at-fault car accident, a guest injured at your house, a teenager driving.",
      "It's the cheapest insurance per dollar of protection that exists, precisely because large claims are rare. A few hundred dollars a year for a million dollars of coverage.",
      "Once there are assets worth suing for, this stops being optional. A judgment above your auto policy limit comes out of savings, investments, and future wages.",
    ],
    math: [
      { label: "Net worth", value: money(netWorth) },
      { label: "Suggested coverage", value: money(suggested), emphasis: true },
      { label: "Typical cost", value: "$150-$400 per year per $1M" },
    ],
    actions: hasUmbrella
      ? ["Re-check the limit as net worth grows — coverage should keep pace."]
      : [
          "Call your existing auto/home insurer; bundling the umbrella with them is nearly always cheapest.",
          "They may require raising your underlying auto liability limits first. Do it — that's a good change on its own.",
        ],
    learnKeys: ["umbrella_insurance"],
  };
}
