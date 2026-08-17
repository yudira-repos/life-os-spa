/**
 * Verification for the FinancialOS advice engine.
 *
 *   npm run verify:advice
 *
 * No database, no network, no test framework. The engine's pure path takes a
 * context object and returns a plan, so every rule can be exercised by handing
 * it a hand-written household and asserting on what comes back.
 *
 * These are the cases that matter — the ones where getting it wrong costs the
 * user real money, or tells them to do something they can't do:
 *
 *   1. Match before everything      — even before credit card debt
 *   2. Pro-rata rule                — Backdoor Roth with a pre-tax IRA balance
 *   3. Mega Backdoor gating         — never recommended without plan support
 *   4. Roth phase-out boundary      — direct contribution vs backdoor
 *   5. Catch-up by age              — including the 60-63 window
 *   6. Retirement before college    — the ordering the ask insisted on
 *   7. Term over whole life         — with the cost comparison shown
 *   8. Determinism                  — same inputs, byte-identical output
 */

import { generatePlanFromContext } from "../src/lib/financialos/advice/engine";
import type {
  HouseholdFinancialContext,
  EarnerContext,
  ChildContext,
} from "../src/lib/financialos/profile";
import type { Recommendation } from "../src/lib/financialos/advice/types";
import { LIMITS_401K, LIMITS_IRA, LIMITS_HSA } from "../src/lib/financialos/constants";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  [32m✓[0m ${name}`);
  } else {
    failed += 1;
    console.log(`  [31m✗[0m ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n[1m${name}[0m`);
}

// --- Fixtures ---------------------------------------------------------------

function earner(overrides: Partial<EarnerContext> = {}): EarnerContext {
  return {
    memberId: "m1",
    name: "Alex",
    age: 40,
    isPrimary: true,
    annualIncome: 150_000,
    selfEmployed: false,
    hasWorkplacePlan: true,
    planType: "401K",
    employerMatchPercent: 50,
    employerMatchLimitPercent: 6,
    currentDeferralPercent: 6,
    currentDeferralIsRoth: false,
    currentDeferralDollars: 9_000,
    planAllowsAfterTax: false,
    planAllowsInPlanRoth: false,
    planAllowsInServiceW: false,
    employerContribDollars: 4_500,
    traditionalIraBalance: 0,
    currentIraContrib: 0,
    hsaEligible: false,
    hsaCoverage: "NONE",
    currentHsaContrib: 0,
    employerHsaContrib: 0,
    ...overrides,
  };
}

function child(name: string, age: number): ChildContext {
  return { memberId: `c-${name}`, name, age, yearsToCollege: Math.max(18 - age, 0) };
}

function context(
  overrides: Partial<HouseholdFinancialContext> = {}
): HouseholdFinancialContext {
  const earners = overrides.earners ?? [earner()];
  const householdIncome =
    overrides.householdIncome ?? earners.reduce((sum, e) => sum + e.annualIncome, 0);

  return {
    householdId: "h1",
    householdName: "Test Household",
    filingStatus: "MARRIED_JOINT",
    stateCode: "CA",
    riskTolerance: "MODERATE",
    financialLiteracy: "BEGINNER",
    emergencyFundMonthsTarget: 6,
    hasWill: true,
    hasEstateBeneficiaries: true,
    highInterestDebt: 0,
    highInterestDebtApr: 0,
    earners,
    children: [],
    hasSpouse: earners.length > 1,
    householdIncome,
    estimatedMagi: householdIncome,
    netWorth: {
      assetsCents: 20_000_000,
      liabilitiesCents: 0,
      netWorthCents: 20_000_000,
      byType: [],
      liquidCents: 3_000_000,
      investedCents: 17_000_000,
      accountCount: 3,
    },
    cashflow: {
      months: [],
      current: {
        month: "2026-08",
        label: "Aug 2026",
        incomeCents: 1_000_000,
        expenseCents: 700_000,
        savedCents: 200_000,
        netCents: 300_000,
        savingsRate: 0.3,
      },
      averageMonthlyIncomeCents: 1_000_000,
      averageMonthlyExpenseCents: 700_000,
      averageMonthlySavedCents: 200_000,
      averageSavingsRate: 0.3,
      topCategories: [],
      groupTotals: {
        INCOME: 0,
        ESSENTIAL: 0,
        LIFESTYLE: 0,
        SAVINGS: 0,
        DEBT: 0,
        TRANSFER: 0,
        OTHER: 0,
      },
      recurring: [],
      transactionCount: 200,
      hasEnoughData: true,
    },
    monthlyEssentialCents: 500_000,
    monthlySurplusCents: 300_000,
    goals: [],
    policies: [],
    profileComplete: true,
    ...overrides,
  };
}

function find(items: Recommendation[], prefix: string): Recommendation | undefined {
  return items.find((r) => r.id.startsWith(prefix));
}

function allText(recommendation: Recommendation): string {
  return [
    recommendation.headline,
    ...recommendation.why,
    ...recommendation.math.map((m) => `${m.label} ${m.value}`),
    ...recommendation.actions,
  ].join(" ");
}

// --- 1. Employer match outranks everything ----------------------------------

section("1. The employer match outranks even credit card debt");
{
  const plan = generatePlanFromContext(
    context({
      earners: [earner({ currentDeferralPercent: 2 })],
      highInterestDebt: 18_000,
      highInterestDebtApr: 0.24,
    })
  );

  const matchStep = plan.waterfall.find((s) => s.label === "Employer 401(k) match");
  const debtStep = plan.waterfall.find((s) => s.label === "High-interest debt");

  check("match appears in the waterfall before high-interest debt",
    Boolean(matchStep && debtStep && matchStep.order < debtStep.order),
    `match=${matchStep?.order} debt=${debtStep?.order}`);

  const match = find(plan.recommendations, "employer_match_");
  check("under-contributing flags the match as CRITICAL",
    match?.priority === "CRITICAL" && match.status === "ACTION_NEEDED",
    `priority=${match?.priority} status=${match?.status}`);

  // 150k * 6% * 50% = 4500 available; at 2% only 1500 captured; 3000 missed.
  check("missed match is computed correctly ($3,000)",
    allText(match!).includes("$3,000"),
    match?.headline);

  const debt = find(plan.recommendations, "debt_payoff");
  check("24% APR debt is also CRITICAL", debt?.priority === "CRITICAL");
  check("debt rule states the match exception explicitly",
    allText(debt!).toLowerCase().includes("match"));
}

// --- 2. The pro-rata rule ---------------------------------------------------

section("2. Backdoor Roth warns about the pro-rata rule");
{
  const clean = generatePlanFromContext(
    context({
      householdIncome: 400_000,
      estimatedMagi: 400_000,
      earners: [earner({ annualIncome: 400_000, traditionalIraBalance: 0 })],
    })
  );
  const cleanBackdoor = find(clean.recommendations, "backdoor_roth_");

  check("over the income limit produces a Backdoor Roth recommendation",
    Boolean(cleanBackdoor));
  check("with no pre-tax IRA it is HIGH priority (clean case)",
    cleanBackdoor?.priority === "HIGH", `priority=${cleanBackdoor?.priority}`);
  check("clean case states there is no pro-rata exposure",
    allText(cleanBackdoor!).includes("$0 — you're clear"));

  const dirty = generatePlanFromContext(
    context({
      householdIncome: 400_000,
      estimatedMagi: 400_000,
      earners: [earner({ annualIncome: 400_000, traditionalIraBalance: 93_000 })],
    })
  );
  const dirtyBackdoor = find(dirty.recommendations, "backdoor_roth_");

  check("a pre-tax IRA balance downgrades it to MEDIUM (there's a cost first)",
    dirtyBackdoor?.priority === "MEDIUM", `priority=${dirtyBackdoor?.priority}`);
  check("the pro-rata rule is named in the reasoning",
    allText(dirtyBackdoor!).toLowerCase().includes("pro-rata"));
  check("the fix (roll the IRA into the 401k) is the first action",
    dirtyBackdoor!.actions[0].toLowerCase().includes("roll"),
    dirtyBackdoor!.actions[0]);
  check("Form 8606 is mentioned",
    allText(dirtyBackdoor!).includes("8606"));
}

// --- 3. Mega Backdoor Roth gating -------------------------------------------

section("3. Mega Backdoor Roth is never recommended without plan support");
{
  const unsupported = generatePlanFromContext(
    context({
      householdIncome: 400_000,
      estimatedMagi: 400_000,
      earners: [earner({ annualIncome: 400_000, planAllowsAfterTax: false })],
    })
  );
  const noMega = find(unsupported.recommendations, "mega_backdoor_");
  check("without after-tax contributions it is NOT_APPLICABLE",
    noMega?.status === "NOT_APPLICABLE", `status=${noMega?.status}`);
  check("it still tells the user the exact question to ask their plan",
    allText(noMega!).includes("after-tax (non-Roth) contributions"));

  const partial = generatePlanFromContext(
    context({
      householdIncome: 400_000,
      estimatedMagi: 400_000,
      earners: [
        earner({
          annualIncome: 400_000,
          planAllowsAfterTax: true,
          planAllowsInPlanRoth: false,
          planAllowsInServiceW: false,
        }),
      ],
    })
  );
  const partialMega = find(partial.recommendations, "mega_backdoor_");
  check("after-tax alone, with no conversion route, is NEEDS_INFO",
    partialMega?.status === "NEEDS_INFO", `status=${partialMega?.status}`);

  const supported = generatePlanFromContext(
    context({
      householdIncome: 400_000,
      estimatedMagi: 400_000,
      earners: [
        earner({
          annualIncome: 400_000,
          planAllowsAfterTax: true,
          planAllowsInPlanRoth: true,
          employerContribDollars: 10_000,
        }),
      ],
    })
  );
  const mega = find(supported.recommendations, "mega_backdoor_");
  check("with both features it becomes an actionable HIGH recommendation",
    mega?.status === "ACTION_NEEDED" && mega.priority === "HIGH",
    `status=${mega?.status} priority=${mega?.priority}`);

  // 72,000 − 24,500 − 10,000 = 37,500
  check("after-tax headroom is 415(c) − elective − employer = $37,500",
    Math.round(mega!.annualAmount!) === 37_500,
    `got ${mega?.annualAmount}`);
}

// --- 4. Roth IRA phase-out boundary -----------------------------------------

section("4. Roth IRA phase-out is applied at the published boundary");
{
  const below = generatePlanFromContext(
    context({ householdIncome: 200_000, estimatedMagi: 200_000 })
  );
  check("MAGI below the range allows a direct Roth contribution",
    Boolean(find(below.recommendations, "roth_ira_")));

  const inside = generatePlanFromContext(
    context({ householdIncome: 247_000, estimatedMagi: 247_000 })
  );
  const partial = find(inside.recommendations, "roth_ira_");
  check("MAGI inside the range still allows a (reduced) direct contribution",
    Boolean(partial));
  // Halfway through 242,000-252,000 = half of 7,500 = 3,750
  check("the reduced amount is prorated correctly (~$3,750 at the midpoint)",
    allText(partial!).includes("$3,750"), partial?.headline);

  const above = generatePlanFromContext(
    context({ householdIncome: 260_000, estimatedMagi: 260_000 })
  );
  check("MAGI above the range switches to the Backdoor Roth",
    Boolean(find(above.recommendations, "backdoor_roth_")) &&
      !find(above.recommendations, "roth_ira_"));
}

// --- 5. Catch-up contributions by age ---------------------------------------

section("5. Catch-up contributions follow the age bands");
{
  const at45 = generatePlanFromContext(context({ earners: [earner({ age: 45 })] }));
  const at55 = generatePlanFromContext(context({ earners: [earner({ age: 55 })] }));
  const at61 = generatePlanFromContext(context({ earners: [earner({ age: 61 })] }));
  const at64 = generatePlanFromContext(context({ earners: [earner({ age: 64 })] }));

  const limitFor = (plan: ReturnType<typeof generatePlanFromContext>) =>
    allText(find(plan.recommendations, "max_401k_")!);

  check(`under 50: limit is the base $${LIMITS_401K.electiveDeferral.toLocaleString()}`,
    limitFor(at45).includes("$24,500") && !limitFor(at45).includes("Catch-up"));
  check(`50-59: adds the $${LIMITS_401K.catchUp50.toLocaleString()} catch-up ($32,500 total)`,
    limitFor(at55).includes("$32,500"));
  check(`60-63: uses the enhanced $${LIMITS_401K.catchUp60to63.toLocaleString()} catch-up ($35,750 total)`,
    limitFor(at61).includes("$35,750"));
  check("60-63 explains that the window closes at 64",
    limitFor(at61).includes("four-year opportunity"));
  check("64: drops back to the standard catch-up ($32,500 total)",
    limitFor(at64).includes("$32,500"));
}

// --- 6. Retirement before college -------------------------------------------

section("6. Retirement is prioritized over college savings");
{
  const underfunded = generatePlanFromContext(
    context({
      children: [child("Maya", 8), child("Rohan", 12)],
      earners: [earner({ currentDeferralPercent: 3, currentDeferralDollars: 4_500 })],
    })
  );
  const college = find(underfunded.recommendations, "college_savings");

  check("529 recommendation exists when there are children", Boolean(college));
  check("with retirement underfunded, college drops to LOW priority",
    college?.priority === "LOW", `priority=${college?.priority}`);
  check("it says retirement comes first, in as many words",
    allText(college!).toLowerCase().includes("retirement comes before college"));
  check("it explains why: you can borrow for college, not for retirement",
    allText(college!).toLowerCase().includes("borrow"));

  const funded = generatePlanFromContext(
    context({
      children: [child("Maya", 8)],
      earners: [earner({ currentDeferralPercent: 16, currentDeferralDollars: 24_000 })],
    })
  );
  const collegeFunded = find(funded.recommendations, "college_savings");
  check("with retirement on track it becomes MEDIUM",
    collegeFunded?.priority === "MEDIUM", `priority=${collegeFunded?.priority}`);
  check("it targets half of in-state public, not the full private cost",
    allText(collegeFunded!).toLowerCase().includes("half"));

  const waterfall = funded.waterfall;
  const iraStep = waterfall.find((s) => s.label.startsWith("Roth IRA"));
  const eduStep = waterfall.find((s) => s.label.startsWith("Kids' education"));
  check("waterfall puts the 529 after the Roth IRA",
    Boolean(iraStep && eduStep && iraStep.order < eduStep.order));
}

// --- 7. Term over whole life ------------------------------------------------

section("7. Life insurance recommends term, with the cost comparison shown");
{
  const plan = generatePlanFromContext(
    context({
      children: [child("Maya", 4)],
      earners: [earner(), earner({ memberId: "m2", name: "Sam", annualIncome: 90_000 })],
    })
  );
  const life = find(plan.recommendations, "life_insurance");

  check("a household with children gets a life insurance recommendation",
    Boolean(life));
  check("it recommends TERM explicitly", life!.headline.includes("TERM"));
  check("it states the ~10x cost difference vs whole life",
    allText(life!).toLowerCase().includes("ten times"));
  check("it discloses the commission conflict of interest",
    allText(life!).toLowerCase().includes("commission"));
  check("it sizes coverage with DIME (debt, income, mortgage, education)",
    life!.math.some((m) => m.label.includes("DIME")));
  check("it still names the narrow cases where whole life genuinely fits",
    (life!.caveats ?? []).join(" ").toLowerCase().includes("estate"));
  check("it says to cover a non-earning spouse too",
    allText(life!).toLowerCase().includes("non-earning spouse"));
}

// --- 8. Determinism ---------------------------------------------------------

section("8. The engine is deterministic");
{
  const input = context({
    children: [child("Maya", 8)],
    earners: [earner({ age: 61, planAllowsAfterTax: true, planAllowsInPlanRoth: true })],
    highInterestDebt: 5_000,
    highInterestDebtApr: 0.19,
  });

  const first = generatePlanFromContext(input);
  const second = generatePlanFromContext(input);

  const strip = (plan: typeof first) =>
    JSON.stringify({ ...plan, generatedAt: null });

  check("two runs on identical input produce identical plans",
    strip(first) === strip(second));
  check("the input fingerprint is stable across runs",
    first.inputHash === second.inputHash);
  check("every recommendation carries reasoning",
    first.recommendations.every((r) => r.why.length > 0));
  check("every actionable recommendation carries concrete next steps",
    first.recommendations
      .filter((r) => r.status === "ACTION_NEEDED")
      .every((r) => r.actions.length > 0));
  check("recommendation ids are unique",
    new Set(first.recommendations.map((r) => r.id)).size ===
      first.recommendations.length);
}

// --- 9. Constants match the published 2026 figures --------------------------

section("9. Tax constants match the published 2026 IRS figures");
{
  check("401(k) elective deferral is $24,500", LIMITS_401K.electiveDeferral === 24_500);
  check("401(k) catch-up (50+) is $8,000", LIMITS_401K.catchUp50 === 8_000);
  check("401(k) catch-up (60-63) is $11,250", LIMITS_401K.catchUp60to63 === 11_250);
  check("415(c) total additions limit is $72,000", LIMITS_401K.annualAdditions === 72_000);
  check("IRA limit is $7,500", LIMITS_IRA.contribution === 7_500);
  check("IRA catch-up is $1,100", LIMITS_IRA.catchUp50 === 1_100);
  check("HSA self-only is $4,400", LIMITS_HSA.selfOnly === 4_400);
  check("HSA family is $8,750", LIMITS_HSA.family === 8_750);
}

// --- Result -----------------------------------------------------------------

console.log(
  `\n${failed === 0 ? "[32m" : "[31m"}${passed} passed, ${failed} failed[0m\n`
);
process.exit(failed === 0 ? 0 : 1);
