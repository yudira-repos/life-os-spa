import {
  LIMITS_401K,
  LIMITS_IRA,
  LIMITS_HSA,
  ROTH_IRA_PHASEOUT,
  TRAD_IRA_DEDUCTION_PHASEOUT,
  ASSUMPTIONS,
  SOURCES,
  TAX_YEAR,
  workplaceCatchUpFor,
  iraCatchUpFor,
  hsaLimitFor,
  combinedMarginalRate,
  marginalFederalRate,
  stateMarginalRate,
  phaseOutFactor,
} from "@/lib/financialos/constants";
import type {
  EarnerContext,
  HouseholdFinancialContext,
} from "@/lib/financialos/profile";
import { money, pct, type Recommendation } from "@/lib/financialos/advice/types";

// The retirement waterfall, in the order the dollars should actually go:
//
//   1. Employer match          — 50-100% instant return, nothing beats it
//   2. HSA                     — the only triple-tax-free account in the code
//   3. Max the 401(k)          — $24,500 (2026), plus catch-up if eligible
//   4. Roth IRA, or Backdoor    — $7,500, per spouse
//   5. Mega Backdoor Roth       — up to the $72,000 415(c) ceiling
//   6. Taxable index funds      — unlimited, and underrated
//
// Steps 1 and 2 are not negotiable. Steps 4 and 5 are gated on facts we ask
// for explicitly rather than assume, because both have a precondition that
// turns them from smart into expensive when it isn't met: the pro-rata rule
// for the Backdoor, and plan support for after-tax contributions for the Mega.

const IRS_SOURCE = { label: `IRS ${TAX_YEAR} retirement limits`, url: SOURCES.irsRetirement2026 };
const PUB590A = { label: "IRS Publication 590-A (IRAs)", url: SOURCES.irsBackdoorPubs };

function earnerLabel(earner: EarnerContext, hasSpouse: boolean): string {
  if (!hasSpouse) return "";
  return ` — ${earner.name}`;
}

/** Step 1. The single highest-return move available to almost anyone. */
export function employerMatchRule(
  context: HouseholdFinancialContext,
  earner: EarnerContext
): Recommendation | null {
  if (!earner.hasWorkplacePlan || earner.employerMatchPercent <= 0) return null;

  const salary = earner.annualIncome;
  const matchLimitPercent = earner.employerMatchLimitPercent || 0;
  const requiredDeferralPercent = matchLimitPercent;
  const currentPercent = earner.currentDeferralPercent;

  const fullMatchDollars = (salary * matchLimitPercent * (earner.employerMatchPercent / 100)) / 100;
  const capturedPercent = Math.min(currentPercent, matchLimitPercent);
  const capturedDollars = (salary * capturedPercent * (earner.employerMatchPercent / 100)) / 100;
  const missedDollars = Math.max(fullMatchDollars - capturedDollars, 0);

  const onTrack = currentPercent >= matchLimitPercent;
  const gapPercent = Math.max(matchLimitPercent - currentPercent, 0);
  const gapDollars = (salary * gapPercent) / 100;

  // 30 years of compounding on the missed match, to make the cost concrete.
  const thirtyYearCost =
    missedDollars > 0
      ? missedDollars *
        ((Math.pow(1 + ASSUMPTIONS.equityNominalReturn, 30) - 1) /
          ASSUMPTIONS.equityNominalReturn)
      : 0;

  return {
    id: `employer_match_${earner.memberId}`,
    title: `Capture the full employer match${earnerLabel(earner, context.hasSpouse)}`,
    category: "RETIREMENT",
    priority: onTrack ? "LOW" : "CRITICAL",
    status: onTrack ? "ON_TRACK" : "ACTION_NEEDED",
    memberId: earner.memberId,
    memberName: earner.name,
    annualAmount: onTrack ? fullMatchDollars : missedDollars,
    headline: onTrack
      ? `Contributing ${currentPercent}% captures the full ${money(fullMatchDollars)} match. Nothing to change.`
      : `Raise your contribution to ${matchLimitPercent}% — you're leaving ${money(missedDollars)} a year on the table.`,
    why: onTrack
      ? [
          `Your employer matches ${earner.employerMatchPercent}% of what you contribute, up to ${matchLimitPercent}% of pay. At ${currentPercent}% you're capturing all of it.`,
          "This is the only guaranteed return in personal finance. You're taking it.",
        ]
      : [
          `Your employer matches ${earner.employerMatchPercent}% of contributions up to ${matchLimitPercent}% of pay. You're contributing ${currentPercent}%.`,
          `Every dollar you don't contribute up to that ${matchLimitPercent}% line costs you ${earner.employerMatchPercent} cents of free money.`,
          `That's an immediate ${earner.employerMatchPercent}% return, before the money is invested in anything. No investment on earth reliably offers that.`,
          "This outranks paying off credit card debt, funding your emergency fund, and every other item on this list.",
        ],
    math: [
      { label: "Salary", value: money(salary) },
      { label: "Employer matches", value: `${earner.employerMatchPercent}% of contributions up to ${matchLimitPercent}% of pay` },
      { label: "Your current contribution", value: `${currentPercent}% (${money((salary * currentPercent) / 100)})` },
      { label: "Needed for full match", value: `${requiredDeferralPercent}% (${money((salary * requiredDeferralPercent) / 100)})` },
      { label: "Full match available", value: money(fullMatchDollars), emphasis: true },
      ...(missedDollars > 0
        ? [
            { label: "Match you're missing", value: `${money(missedDollars)} per year`, emphasis: true },
            { label: "Extra you'd contribute", value: `${money(gapDollars)} per year (${money(gapDollars / 12)}/month)` },
            { label: "30-year cost of skipping it", value: `~${money(thirtyYearCost)}`, emphasis: true },
          ]
        : []),
    ],
    actions: onTrack
      ? ["Nothing to do here. Re-check if your employer changes the match formula."]
      : [
          `Log into your 401(k) provider and raise your deferral from ${currentPercent}% to at least ${matchLimitPercent}%.`,
          `That's about ${money(gapDollars / 12)} more per month out of your paycheck — less than that after tax, since it comes out pre-tax.`,
          "Check the vesting schedule. Some employers' matches vest over 3-5 years; that affects what you keep if you leave, not whether to take it.",
        ],
    learnKeys: ["employer_match", "401k_basics", "vesting"],
    sources: [IRS_SOURCE],
    caveats: [
      "Assumes the match applies to base salary. Some plans match on bonus too — check your plan document.",
      "The 30-year figure assumes a 7% nominal return and no withdrawals. It illustrates the scale of the loss, not a prediction.",
    ],
  };
}

/** Step 2. Triple tax advantage — the best account almost nobody maxes. */
export function hsaRule(
  context: HouseholdFinancialContext,
  earner: EarnerContext
): Recommendation | null {
  if (!earner.hsaEligible || earner.hsaCoverage === "NONE") return null;

  const age = earner.age ?? 40;
  const limit = hsaLimitFor(earner.hsaCoverage, age);
  const employerPortion = earner.employerHsaContrib;
  const yourRoom = Math.max(limit - employerPortion, 0);
  const current = earner.currentHsaContrib;
  const gap = Math.max(yourRoom - current, 0);

  const marginalRate = combinedMarginalRate(
    context.estimatedMagi,
    context.filingStatus,
    context.stateCode
  );
  // HSA contributions through payroll also dodge FICA — 7.65% that a 401(k)
  // contribution does not escape. This is the part people miss.
  const ficaRate = 0.0765;
  const taxSaving = gap * (marginalRate + ficaRate);

  const onTrack = gap <= 0;

  return {
    id: `hsa_${earner.memberId}`,
    title: `Max the HSA${earnerLabel(earner, context.hasSpouse)}`,
    category: "TAX",
    priority: onTrack ? "LOW" : "HIGH",
    status: onTrack ? "ON_TRACK" : "ACTION_NEEDED",
    memberId: earner.memberId,
    memberName: earner.name,
    annualAmount: gap,
    estimatedTaxSaving: taxSaving,
    headline: onTrack
      ? `You're contributing the full ${money(limit)} to your HSA. This is the best account you have.`
      : `Add ${money(gap)} to your HSA — the only account that's tax-free going in, growing, and coming out.`,
    why: [
      "An HSA is the only triple-tax-advantaged account in the US tax code: contributions are deductible, growth is untaxed, and withdrawals for medical expenses are untaxed. A 401(k) and a Roth IRA each get two of those three.",
      "Contributed through payroll, it also escapes the 7.65% FICA tax — which a 401(k) contribution does not.",
      "The real move: pay current medical bills out of pocket, invest the HSA balance, and save the receipts. There's no deadline for reimbursement, so a receipt from today can be reimbursed tax-free in 30 years after the balance has compounded.",
      `After 65 it works like a traditional IRA for non-medical withdrawals (taxed, but no penalty) — so over-contributing has no trap door.`,
      ...(earner.hsaCoverage === "FAMILY"
        ? [`Family coverage means a ${money(LIMITS_HSA.family)} limit for ${TAX_YEAR}, shared across the family — not per person.`]
        : []),
      ...(age >= 55 ? [`At 55+ you can add another ${money(LIMITS_HSA.catchUp55)} per eligible person.`] : []),
    ],
    math: [
      { label: `${TAX_YEAR} HSA limit (${earner.hsaCoverage.toLowerCase()} coverage)`, value: money(limit) },
      ...(age >= 55 ? [{ label: "Includes age-55 catch-up", value: money(LIMITS_HSA.catchUp55) }] : []),
      ...(employerPortion > 0 ? [{ label: "Employer contributes", value: money(employerPortion) }] : []),
      { label: "Your available room", value: money(yourRoom) },
      { label: "You're contributing", value: money(current) },
      ...(gap > 0
        ? [
            { label: "Room left", value: money(gap), emphasis: true },
            { label: "Combined marginal rate", value: pct(marginalRate) },
            { label: "Plus FICA saved via payroll", value: pct(ficaRate) },
            { label: "Estimated tax saved", value: money(taxSaving), emphasis: true },
          ]
        : []),
    ],
    actions: onTrack
      ? [
          "Make sure the balance is INVESTED, not sitting in the cash sweep. Most HSA providers default to cash and most people never notice.",
          "Keep digital copies of medical receipts — they're reimbursable decades later.",
        ]
      : [
          `Increase your payroll HSA contribution by about ${money(gap / 12)} per month.`,
          "Contribute through payroll, not by direct deposit to the HSA — payroll is what saves the FICA.",
          "Invest the balance above whatever cash minimum your provider requires. An uninvested HSA is just a checking account with paperwork.",
          "Start a folder (physical or digital) for medical receipts you pay out of pocket.",
        ],
    learnKeys: ["hsa", "triple_tax_advantage", "fica"],
    sources: [{ label: "IRS Publication 969 (HSAs)", url: SOURCES.irsHsa }],
    caveats: [
      "Requires an HSA-eligible high-deductible health plan. If your family's medical needs make a low-deductible plan cheaper overall, take the better health plan — the tax break isn't worth a worse plan.",
      "Being enrolled in Medicare ends HSA eligibility, and contributing after enrolling triggers penalties.",
    ],
  };
}

/** Step 3. Max the 401(k) beyond the match. */
export function max401kRule(
  context: HouseholdFinancialContext,
  earner: EarnerContext
): Recommendation | null {
  if (!earner.hasWorkplacePlan) return null;

  const age = earner.age ?? 40;
  const catchUp = workplaceCatchUpFor(age);
  const limit = LIMITS_401K.electiveDeferral + catchUp;
  const current = earner.currentDeferralDollars;
  const gap = Math.max(limit - current, 0);
  const onTrack = gap <= 500; // within rounding of maxed

  const federalRate = marginalFederalRate(context.estimatedMagi, context.filingStatus);
  const stateRate = stateMarginalRate(context.stateCode);
  const marginalRate = federalRate + stateRate;
  const taxSaving = gap * marginalRate;

  const percentOfSalary = earner.annualIncome > 0 ? (limit / earner.annualIncome) * 100 : 0;

  // Roth vs traditional guidance, driven by the actual bracket.
  const rothFavored = federalRate <= 0.12;
  const brackets: string[] = rothFavored
    ? [
        `You're in the ${pct(federalRate, 0)} federal bracket. That's low — likely lower than your bracket in retirement, which argues for ROTH contributions (pay tax now at a cheap rate, never again).`,
      ]
    : federalRate >= 0.32
      ? [
          `You're in the ${pct(federalRate, 0)} federal bracket${stateRate > 0 ? ` plus ${pct(stateRate)} state` : ""}. That's high, which argues for TRADITIONAL (pre-tax) contributions — take the deduction now, pay tax later at what's likely a lower rate.`,
        ]
      : [
          `You're in the ${pct(federalRate, 0)} federal bracket — the middle, where the traditional-vs-Roth question is genuinely close. Splitting between the two hedges the fact that nobody knows future tax rates.`,
        ];

  const catchUpNote =
    catchUp > 0
      ? age >= 60 && age <= 63
        ? [
            `At ${age} you're in the 60-63 window, where the catch-up jumps to ${money(LIMITS_401K.catchUp60to63)} instead of ${money(LIMITS_401K.catchUp50)}. It drops back down at 64 — this is a four-year opportunity, not a permanent one.`,
          ]
        : [`At ${age} you can add the ${money(LIMITS_401K.catchUp50)} catch-up on top of the standard limit.`]
      : [];

  const rothCatchUpNote =
    catchUp > 0 && earner.annualIncome > LIMITS_401K.rothCatchUpWageThreshold
      ? [
          `Because your prior-year FICA wages exceeded ${money(LIMITS_401K.rothCatchUpWageThreshold)}, SECURE 2.0 requires your catch-up contributions to be ROTH. That's not optional and your plan should enforce it.`,
        ]
      : [];

  return {
    id: `max_401k_${earner.memberId}`,
    title: `Max the ${earner.planType === "403B" ? "403(b)" : "401(k)"}${earnerLabel(earner, context.hasSpouse)}`,
    category: "RETIREMENT",
    priority: onTrack ? "LOW" : "HIGH",
    status: onTrack ? "ON_TRACK" : "ACTION_NEEDED",
    memberId: earner.memberId,
    memberName: earner.name,
    annualAmount: gap,
    estimatedTaxSaving: taxSaving,
    headline: onTrack
      ? `You're on pace for the full ${money(limit)} ${TAX_YEAR} limit.`
      : `Contribute ${money(gap)} more to reach the ${money(limit)} limit for ${TAX_YEAR}.`,
    why: [
      `The ${TAX_YEAR} employee contribution limit is ${money(LIMITS_401K.electiveDeferral)}${catchUp > 0 ? `, plus ${money(catchUp)} of catch-up at your age, so ${money(limit)} for you` : ""}.`,
      ...catchUpNote,
      ...brackets,
      ...rothCatchUpNote,
      "This is per person, not per household — if your spouse also has a plan, they have their own separate limit.",
      "It's also use-it-or-lose-it. Unused 401(k) room does not carry forward to next year.",
    ],
    math: [
      { label: `${TAX_YEAR} employee limit`, value: money(LIMITS_401K.electiveDeferral) },
      ...(catchUp > 0 ? [{ label: `Catch-up (age ${age})`, value: money(catchUp) }] : []),
      { label: "Your total limit", value: money(limit), emphasis: true },
      { label: "On pace to contribute", value: `${money(current)} (${earner.currentDeferralPercent}% of salary)` },
      ...(gap > 0
        ? [
            { label: "Room left", value: money(gap), emphasis: true },
            { label: "Deferral % needed to max", value: `~${percentOfSalary.toFixed(1)}% of salary` },
            { label: "Marginal rate (fed + state)", value: pct(marginalRate) },
            { label: "Estimated tax saved this year", value: money(taxSaving), emphasis: true },
          ]
        : []),
    ],
    actions: onTrack
      ? [
          "Check what the money is actually invested in — a maxed 401(k) sitting in a money market fund is a missed decade.",
          "Look up the expense ratios of your funds. Anything above 0.20% deserves a hard look at the index alternative.",
        ]
      : [
          `Raise your deferral to about ${percentOfSalary.toFixed(0)}% of salary, or ${money(gap / 12)} more per month.`,
          rothFavored
            ? "Choose the Roth option in your plan if it has one — at your bracket, paying tax now is the cheaper end of the trade."
            : "Use traditional (pre-tax) contributions at your bracket.",
          "Watch the front-loading trap: if you max out in October, you stop getting per-paycheck match for November and December unless your plan has a 'true-up'.",
        ],
    learnKeys: ["401k_basics", "roth_vs_traditional", "expense_ratio"],
    sources: [IRS_SOURCE],
    caveats: [
      "The tax saving is estimated from a marginal-rate approximation, not a full return. Treat it as the right order of magnitude.",
      "Contribution room is per person across all employers in a year — if you changed jobs, both plans share the one limit.",
    ],
  };
}

/** Step 4. Roth IRA, direct or through the back door. */
export function rothIraRule(
  context: HouseholdFinancialContext,
  earner: EarnerContext
): Recommendation {
  const age = earner.age ?? 40;
  const limit = LIMITS_IRA.contribution + iraCatchUpFor(age);
  const magi = context.estimatedMagi;
  const range = ROTH_IRA_PHASEOUT[context.filingStatus];
  const factor = phaseOutFactor(magi, range);
  const allowedDirect = Math.round(limit * factor);
  const current = earner.currentIraContrib;

  const needsBackdoor = factor === 0;
  const partialPhaseOut = factor > 0 && factor < 1;
  const hasPreTaxIra = earner.traditionalIraBalance > 0;

  // The pro-rata rule: a Backdoor Roth conversion is taxed in proportion to
  // pre-tax IRA money across ALL your traditional/SEP/SIMPLE IRAs. This is the
  // single most common way people get an unexpected tax bill from a move they
  // read about online.
  const proRataTaxable = hasPreTaxIra
    ? (earner.traditionalIraBalance / (earner.traditionalIraBalance + limit)) * limit
    : 0;
  const proRataTax =
    proRataTaxable *
    combinedMarginalRate(magi, context.filingStatus, context.stateCode);

  if (!needsBackdoor) {
    const onTrack = current >= allowedDirect - 100;
    return {
      id: `roth_ira_${earner.memberId}`,
      title: `Roth IRA${earnerLabel(earner, context.hasSpouse)}`,
      category: "RETIREMENT",
      priority: onTrack ? "LOW" : "HIGH",
      status: onTrack ? "ON_TRACK" : "ACTION_NEEDED",
      memberId: earner.memberId,
      memberName: earner.name,
      annualAmount: Math.max(allowedDirect - current, 0),
      headline: onTrack
        ? `You're funding your Roth IRA at ${money(current)}. Good.`
        : `Contribute ${money(Math.max(allowedDirect - current, 0))} to a Roth IRA — you can still do it directly.`,
      why: [
        `Your estimated MAGI of ${money(magi)} is ${partialPhaseOut ? "inside" : "below"} the ${TAX_YEAR} Roth IRA phase-out range of ${money(range.start)}-${money(range.end)} for your filing status.`,
        partialPhaseOut
          ? `That means you can contribute a reduced amount — about ${money(allowedDirect)} instead of the full ${money(limit)}.`
          : `You can contribute the full ${money(limit)} directly, no backdoor maneuver needed.`,
        "A Roth IRA grows and comes out completely tax-free in retirement, and unlike a 401(k) it has no required minimum distributions during your lifetime.",
        "Contributions (not earnings) can be withdrawn any time, penalty-free — which makes it a reasonable secondary emergency reserve once your cash fund is built.",
        context.hasSpouse
          ? "A non-working or lower-earning spouse can still contribute the full amount through a spousal IRA, as long as household earned income covers both."
          : "",
      ].filter(Boolean),
      math: [
        { label: `${TAX_YEAR} IRA limit`, value: money(LIMITS_IRA.contribution) },
        ...(age >= 50 ? [{ label: "Catch-up (50+)", value: money(LIMITS_IRA.catchUp50) }] : []),
        { label: "Estimated household MAGI", value: money(magi) },
        { label: "Phase-out range", value: `${money(range.start)} – ${money(range.end)}` },
        { label: "You can contribute", value: money(allowedDirect), emphasis: true },
        { label: "Currently contributing", value: money(current) },
      ],
      actions: onTrack
        ? ["Confirm the money is invested, not sitting as cash in the IRA — this is an extremely common and expensive oversight."]
        : [
            "Open a Roth IRA at a low-cost brokerage (Fidelity, Vanguard, Schwab) if you don't have one.",
            `Set up an automatic monthly transfer of about ${money(allowedDirect / 12)}.`,
            "Then BUY something with it. Money in an IRA is not invested until you place a trade — a broad index fund is the default answer.",
            `You have until the tax filing deadline in April to make a ${TAX_YEAR} contribution.`,
          ],
      learnKeys: ["roth_ira", "index_funds", "spousal_ira"],
      sources: [IRS_SOURCE, PUB590A],
      caveats: [
        "MAGI here is estimated from the income and pre-tax contributions in your profile, not calculated from a tax return. If you're near the edge of the range, confirm with your actual return.",
      ],
    };
  }

  // Over the limit — Backdoor Roth territory.
  return {
    id: `backdoor_roth_${earner.memberId}`,
    title: `Backdoor Roth IRA${earnerLabel(earner, context.hasSpouse)}`,
    category: "TAX",
    priority: hasPreTaxIra ? "MEDIUM" : "HIGH",
    status: "ACTION_NEEDED",
    memberId: earner.memberId,
    memberName: earner.name,
    annualAmount: limit,
    headline: hasPreTaxIra
      ? `You're over the Roth income limit. The Backdoor Roth works — but your ${money(earner.traditionalIraBalance)} pre-tax IRA would make it cost about ${money(proRataTax)} in tax first.`
      : `You're over the Roth income limit — use the Backdoor Roth to get ${money(limit)} in anyway.`,
    why: [
      `Your estimated MAGI of ${money(magi)} is above the ${TAX_YEAR} Roth IRA cutoff of ${money(range.end)}, so you can't contribute directly.`,
      "The Backdoor Roth is the legal workaround, and it's not a loophole in any grey sense — Congress removed the income limit on Roth *conversions* in 2010 and has left it removed since. It's two steps: contribute to a traditional IRA (non-deductible, no income limit), then convert it to Roth.",
      ...(hasPreTaxIra
        ? [
            `THE CATCH, and it's a real one: the pro-rata rule. The IRS treats ALL your traditional, SEP, and SIMPLE IRAs as one pot when you convert. With ${money(earner.traditionalIraBalance)} of pre-tax money in there, roughly ${money(proRataTaxable)} of a ${money(limit)} conversion would be taxable — about ${money(proRataTax)} in tax.`,
            "The fix: roll that pre-tax IRA balance INTO your 401(k) first, if your plan accepts roll-ins. 401(k) balances don't count in the pro-rata calculation. Do that, and the backdoor becomes clean.",
            "Do NOT skip this step and hope. The tax bill arrives with Form 8606 and it surprises people every year.",
          ]
        : [
            `You have no pre-tax IRA balance, which means the pro-rata rule doesn't bite. This is the clean case — the conversion is essentially tax-free.`,
          ]),
      "Convert promptly after contributing, so there's minimal earnings to be taxed on the conversion.",
      context.hasSpouse
        ? `Both spouses can do this independently — that's ${money(limit * 2)} a year into Roth accounts for the household.`
        : "",
    ].filter(Boolean),
    math: [
      { label: "Estimated household MAGI", value: money(magi) },
      { label: `${TAX_YEAR} Roth direct-contribution cutoff`, value: money(range.end) },
      { label: "Direct Roth contribution allowed", value: "$0" },
      { label: "Backdoor Roth amount", value: money(limit), emphasis: true },
      ...(hasPreTaxIra
        ? [
            { label: "Your pre-tax IRA balance", value: money(earner.traditionalIraBalance) },
            { label: "Taxable portion of conversion (pro-rata)", value: money(proRataTaxable) },
            { label: "Estimated tax if you convert as-is", value: money(proRataTax), emphasis: true },
            { label: "Tax if you roll the IRA into your 401(k) first", value: "~$0", emphasis: true },
          ]
        : [{ label: "Pre-tax IRA balance (pro-rata exposure)", value: "$0 — you're clear" }]),
      ...(context.hasSpouse ? [{ label: "Household total (both spouses)", value: money(limit * 2) }] : []),
    ],
    actions: [
      ...(hasPreTaxIra
        ? [
            "FIRST: ask your 401(k) provider whether the plan accepts roll-ins from an IRA. Most do.",
            `Roll your ${money(earner.traditionalIraBalance)} traditional IRA into the 401(k), and confirm the balance is $0 before December 31 — the pro-rata rule looks at your year-end balance.`,
          ]
        : []),
      `Open a traditional IRA and a Roth IRA at the same brokerage. Contribute ${money(limit)} to the traditional as a NON-DEDUCTIBLE contribution.`,
      "Leave it in cash for a few days, then convert the whole balance to the Roth IRA. Most brokerages have a one-click 'convert to Roth' button.",
      "Invest the money once it lands in the Roth.",
      "File Form 8606 with your tax return. Every year. This is the step that documents the contribution was non-deductible; skipping it means paying tax twice on the same money.",
      ...(context.hasSpouse ? ["Repeat the whole sequence for your spouse in their own accounts."] : []),
    ],
    learnKeys: ["backdoor_roth", "pro_rata_rule", "form_8606"],
    sources: [IRS_SOURCE, PUB590A],
    caveats: [
      "The pro-rata rule uses your December 31 balance across all traditional/SEP/SIMPLE IRAs, not the balance on conversion day.",
      "This is a well-established strategy, but it's your tax return. Confirm the mechanics with a CPA the first year if it's new to you.",
    ],
  };
}

/** Step 5. The Mega Backdoor Roth — entirely gated on plan features. */
export function megaBackdoorRule(
  context: HouseholdFinancialContext,
  earner: EarnerContext
): Recommendation | null {
  if (!earner.hasWorkplacePlan) return null;

  const age = earner.age ?? 40;
  const catchUp = workplaceCatchUpFor(age);
  const electiveLimit = LIMITS_401K.electiveDeferral + catchUp;
  const totalLimit = LIMITS_401K.annualAdditions + catchUp;

  const employerContrib =
    earner.employerContribDollars ||
    (earner.annualIncome *
      Math.min(earner.currentDeferralPercent, earner.employerMatchLimitPercent) *
      (earner.employerMatchPercent / 100)) /
      100;

  // The after-tax room is what's left under 415(c) once elective deferrals
  // and everything the employer puts in are accounted for.
  const afterTaxRoom = Math.max(
    totalLimit - LIMITS_401K.electiveDeferral - employerContrib,
    0
  );

  const canDo = earner.planAllowsAfterTax && (earner.planAllowsInPlanRoth || earner.planAllowsInServiceW);
  const highIncome = earner.annualIncome >= 150_000;

  // Only worth surfacing to someone who could plausibly fund it.
  if (!highIncome && !canDo) return null;

  if (!earner.planAllowsAfterTax) {
    return {
      id: `mega_backdoor_${earner.memberId}`,
      title: `Mega Backdoor Roth${earnerLabel(earner, context.hasSpouse)}`,
      category: "TAX",
      priority: "INFO",
      status: "NOT_APPLICABLE",
      memberId: earner.memberId,
      memberName: earner.name,
      headline: "Your plan doesn't allow after-tax contributions, so the Mega Backdoor Roth isn't available — but it's worth confirming.",
      why: [
        `The Mega Backdoor Roth would let you put up to about ${money(afterTaxRoom)} MORE into a Roth account each year, on top of the ${money(electiveLimit)} regular limit.`,
        "It requires two specific plan features: (1) after-tax contributions — which are NOT the same thing as Roth 401(k) contributions, and (2) either in-plan Roth conversion or in-service withdrawals.",
        "Your profile says your plan doesn't offer after-tax contributions. That's the common case — roughly half of large plans don't.",
        "It's worth one call to your plan administrator to be sure, because plan summaries describe this badly and 'after-tax' is easy to confuse with 'Roth'. The exact question is: 'Does the plan permit after-tax (non-Roth) contributions above the elective deferral limit, and does it allow in-plan Roth conversions?'",
      ],
      math: [
        { label: `${TAX_YEAR} total 415(c) limit`, value: money(LIMITS_401K.annualAdditions) },
        { label: "Employee elective limit", value: money(LIMITS_401K.electiveDeferral) },
        { label: "Theoretical after-tax room", value: money(afterTaxRoom) },
      ],
      actions: [
        "Call your 401(k) provider and ask the exact question above. If the answer changes, update your profile and this recommendation will change with it.",
      ],
      learnKeys: ["mega_backdoor_roth", "after_tax_401k"],
      sources: [IRS_SOURCE],
    };
  }

  if (!canDo) {
    return {
      id: `mega_backdoor_${earner.memberId}`,
      title: `Mega Backdoor Roth${earnerLabel(earner, context.hasSpouse)}`,
      category: "TAX",
      priority: "MEDIUM",
      status: "NEEDS_INFO",
      memberId: earner.memberId,
      memberName: earner.name,
      headline: "Your plan allows after-tax contributions — but you'll need in-plan Roth conversion or in-service withdrawals to finish the move.",
      why: [
        "After-tax contributions alone aren't the strategy. Left in place, their EARNINGS grow tax-deferred and are taxed on withdrawal — better than taxable, but not the point.",
        "The value comes from converting them to Roth, either in-plan or by withdrawing them to a Roth IRA while still employed. Without one of those two, this isn't worth doing.",
        `If you can get one of them enabled, there's roughly ${money(afterTaxRoom)} a year of additional Roth space here.`,
      ],
      math: [
        { label: "After-tax room available", value: money(afterTaxRoom), emphasis: true },
      ],
      actions: [
        "Ask your plan administrator: 'Does the plan support in-plan Roth conversions or in-service withdrawals of after-tax contributions?'",
        "If yes, update your profile — the full recommendation will unlock.",
      ],
      learnKeys: ["mega_backdoor_roth", "after_tax_401k"],
      sources: [IRS_SOURCE],
    };
  }

  const conversionMethod = earner.planAllowsInPlanRoth
    ? "in-plan Roth conversion"
    : "in-service withdrawal to a Roth IRA";

  const affordable = Math.min(afterTaxRoom, Math.max((context.monthlySurplusCents / 100) * 12, 0));

  return {
    id: `mega_backdoor_${earner.memberId}`,
    title: `Mega Backdoor Roth${earnerLabel(earner, context.hasSpouse)}`,
    category: "TAX",
    priority: "HIGH",
    status: "ACTION_NEEDED",
    memberId: earner.memberId,
    memberName: earner.name,
    annualAmount: afterTaxRoom,
    headline: `Your plan supports it: up to ${money(afterTaxRoom)} a year of extra Roth space via after-tax contributions and ${conversionMethod}.`,
    why: [
      `Your plan allows after-tax contributions AND ${conversionMethod}. Both boxes checked — this is available to you, and most people never find out they have it.`,
      `The ${TAX_YEAR} total limit on everything going into your 401(k) — your contributions, your employer's, and after-tax — is ${money(LIMITS_401K.annualAdditions)}. Your elective deferrals (${money(LIMITS_401K.electiveDeferral)}) and employer contributions (${money(employerContrib)}) leave roughly ${money(afterTaxRoom)} of after-tax room.`,
      "Contribute that after-tax, then immediately convert it to Roth. Because you convert right away, there are almost no earnings to be taxed — you're moving after-tax dollars into an account where all future growth is tax-free forever.",
      "This is the single largest tax-advantaged opportunity available to a high earner, and it is entirely a function of whether your specific employer's plan allows it.",
      "Convert on every contribution, or set up automatic conversion if the plan offers it. Earnings that accumulate before conversion are taxable at conversion.",
      context.hasSpouse && context.earners.length > 1
        ? "If your spouse's plan also supports it, the household can do this twice."
        : "",
    ].filter(Boolean),
    math: [
      { label: `${TAX_YEAR} 415(c) total additions limit`, value: money(LIMITS_401K.annualAdditions) },
      { label: "Less your elective deferrals", value: `− ${money(LIMITS_401K.electiveDeferral)}` },
      { label: "Less employer contributions", value: `− ${money(employerContrib)}` },
      { label: "After-tax room", value: money(afterTaxRoom), emphasis: true },
      ...(catchUp > 0
        ? [{ label: "Catch-up sits on top of 415(c)", value: `+ ${money(catchUp)}` }]
        : []),
      ...(affordable < afterTaxRoom && affordable > 0
        ? [{ label: "What your current cashflow supports", value: money(affordable) }]
        : []),
      { label: "Conversion method available", value: conversionMethod },
    ],
    actions: [
      "Max your regular elective deferrals first — that's the pre-tax or Roth 401(k) contribution, and it comes before after-tax dollars.",
      `Then elect after-tax contributions, up to about ${money(afterTaxRoom)} a year (${money(afterTaxRoom / 12)} a month).`,
      earner.planAllowsInPlanRoth
        ? "Turn on automatic in-plan Roth conversion if your plan offers it. If not, convert manually after each contribution — set a calendar reminder."
        : "Set up in-service withdrawals of the after-tax balance to your Roth IRA, on a regular schedule.",
      "Verify the after-tax contributions and the conversions appear correctly on your year-end statement and your W-2.",
      ...(affordable < afterTaxRoom
        ? [`Your current monthly surplus supports roughly ${money(affordable)} of this. Start there and increase as cashflow allows — partial use is still enormously valuable.`]
        : []),
    ],
    learnKeys: ["mega_backdoor_roth", "after_tax_401k", "415c_limit"],
    sources: [IRS_SOURCE],
    caveats: [
      "Employer contribution is estimated from your match formula unless you entered an exact figure. Overshooting the 415(c) limit means a corrective distribution, so confirm the number with your provider before maxing.",
      "Some plans limit after-tax contributions to a percentage of pay that's lower than the 415(c) headroom.",
      "Highly compensated employee testing can force a refund of after-tax contributions in some plans. Ask whether your plan has failed this test recently.",
    ],
  };
}

/** Spousal IRA — easy to miss when one spouse doesn't work. */
export function spousalIraRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  if (!context.hasSpouse) return null;
  if (context.filingStatus !== "MARRIED_JOINT") return null;

  const nonEarner = context.earners.find((e) => e.annualIncome <= 0);
  if (!nonEarner) return null;

  const earner = context.earners.find((e) => e.annualIncome > 0);
  if (!earner || earner.annualIncome < LIMITS_IRA.contribution * 2) return null;

  const age = nonEarner.age ?? 40;
  const limit = LIMITS_IRA.contribution + iraCatchUpFor(age);
  const magi = context.estimatedMagi;
  const rothRange = ROTH_IRA_PHASEOUT.MARRIED_JOINT;
  const canRothDirectly = magi < rothRange.end;
  const tradRange = TRAD_IRA_DEDUCTION_PHASEOUT.MARRIED_JOINT_SPOUSE_COVERED;
  const tradDeductible = magi < tradRange.start;

  return {
    id: `spousal_ira_${nonEarner.memberId}`,
    title: `Spousal IRA for ${nonEarner.name}`,
    category: "RETIREMENT",
    priority: "MEDIUM",
    status: "ACTION_NEEDED",
    memberId: nonEarner.memberId,
    memberName: nonEarner.name,
    annualAmount: limit,
    headline: `${nonEarner.name} can contribute ${money(limit)} to an IRA even without earned income.`,
    why: [
      "Normally an IRA contribution requires earned income. The spousal IRA is the exception: a married couple filing jointly can fund an IRA for a spouse with little or no income, as long as household earned income covers both contributions.",
      "This is the most commonly missed account in single-income households — a full retirement account, in the non-earning spouse's own name, going unused every year.",
      "The account belongs to that spouse individually. That matters both for retirement and, bluntly, for financial independence within a marriage.",
      canRothDirectly
        ? `At your MAGI of ${money(magi)}, this can go into a Roth IRA directly.`
        : `At your MAGI of ${money(magi)} you're above the Roth limit, so use the Backdoor Roth route for this contribution too.`,
      tradDeductible
        ? "A traditional IRA contribution would also be deductible at your income."
        : `A traditional IRA contribution would NOT be fully deductible at your income (phase-out starts at ${money(tradRange.start)} when one spouse is covered by a workplace plan), which is another reason to use the Roth route.`,
    ],
    math: [
      { label: `${TAX_YEAR} IRA limit`, value: money(LIMITS_IRA.contribution) },
      ...(age >= 50 ? [{ label: "Catch-up (50+)", value: money(LIMITS_IRA.catchUp50) }] : []),
      { label: `Available to ${nonEarner.name}`, value: money(limit), emphasis: true },
      { label: "Household earned income", value: money(context.householdIncome) },
      { label: "Route", value: canRothDirectly ? "Direct Roth IRA" : "Backdoor Roth" },
    ],
    actions: [
      `Open an IRA in ${nonEarner.name}'s name — it must be their own account, not a joint one.`,
      `Contribute ${money(limit)} for ${TAX_YEAR}, by the April filing deadline.`,
      "Invest it in a broad index fund once the money lands.",
    ],
    learnKeys: ["spousal_ira", "roth_ira"],
    sources: [IRS_SOURCE, PUB590A],
  };
}

/** Self-employed: the plan options an employee doesn't have. */
export function selfEmployedRule(
  context: HouseholdFinancialContext,
  earner: EarnerContext
): Recommendation | null {
  if (!earner.selfEmployed) return null;
  if (earner.planType === "SOLO_401K") return null;

  const income = earner.annualIncome;
  // Solo 401(k): employee deferral plus ~20% of net self-employment income as
  // the employer piece, capped by 415(c).
  const employerPortion = Math.min(income * 0.2, LIMITS_401K.annualAdditions - LIMITS_401K.electiveDeferral);
  const total = Math.min(LIMITS_401K.electiveDeferral + employerPortion, LIMITS_401K.annualAdditions);

  return {
    id: `solo_401k_${earner.memberId}`,
    title: `Solo 401(k)${earnerLabel(earner, context.hasSpouse)}`,
    category: "RETIREMENT",
    priority: "HIGH",
    status: "ACTION_NEEDED",
    memberId: earner.memberId,
    memberName: earner.name,
    annualAmount: total,
    headline: `As a self-employed earner you can shelter up to about ${money(total)} a year in a Solo 401(k) — far more than an IRA.`,
    why: [
      "Being self-employed means you're both the employee and the employer, so you can make both contributions to your own plan.",
      `Employee side: up to ${money(LIMITS_401K.electiveDeferral)}. Employer side: roughly 20% of net self-employment income, up to the ${money(LIMITS_401K.annualAdditions)} total cap.`,
      "A SEP-IRA is simpler to open but has two disadvantages: no employee deferral (so less total room at moderate income), and the balance counts against the Backdoor Roth pro-rata rule. A Solo 401(k) avoids both.",
      "If your income is variable, note that the contribution is discretionary each year — you're not locked in.",
    ],
    math: [
      { label: "Self-employment income", value: money(income) },
      { label: "Employee deferral", value: money(LIMITS_401K.electiveDeferral) },
      { label: "Employer side (~20% of net)", value: money(employerPortion) },
      { label: "Total possible", value: money(total), emphasis: true },
      { label: "vs. an IRA alone", value: money(LIMITS_IRA.contribution) },
    ],
    actions: [
      "Open a Solo 401(k) at Fidelity, Schwab, or Vanguard — they're free to open and have no ongoing fee.",
      "The plan must be established by your business's tax year end for employee deferrals, so don't leave it to April.",
      "Choose a provider that supports Roth Solo 401(k) contributions and roll-ins, which keeps the Backdoor Roth clean.",
      "The exact employer contribution depends on net earnings after the self-employment tax deduction — have your CPA confirm the figure.",
    ],
    learnKeys: ["solo_401k", "self_employment_retirement"],
    sources: [IRS_SOURCE],
    caveats: [
      "The 20% figure is the common approximation for a sole proprietor. The precise calculation nets out half of self-employment tax and the contribution itself.",
      "Having employees (other than a spouse) changes the plan requirements substantially.",
    ],
  };
}

/** A single retirement-readiness number, so the plan has a destination. */
export function retirementTargetRule(
  context: HouseholdFinancialContext
): Recommendation {
  const primaryAge =
    context.earners.map((e) => e.age).filter((a): a is number => a != null)[0] ?? null;
  const yearsToRetirement =
    primaryAge != null ? Math.max(ASSUMPTIONS.defaultRetirementAge - primaryAge, 0) : null;

  const income = context.householdIncome;
  const targetIncome = income * ASSUMPTIONS.retirementIncomeReplacement;
  const targetNestEgg = targetIncome / ASSUMPTIONS.safeWithdrawalRate;

  const invested = context.netWorth.investedCents / 100;
  const annualContributions =
    context.earners.reduce(
      (sum, e) => sum + e.currentDeferralDollars + e.currentIraContrib,
      0
    ) || 0;

  const r = ASSUMPTIONS.equityNominalReturn;
  const n = yearsToRetirement ?? 25;
  const futureOfCurrent = invested * Math.pow(1 + r, n);
  const futureOfContributions =
    annualContributions * ((Math.pow(1 + r, n) - 1) / r);
  const projected = futureOfCurrent + futureOfContributions;
  const gap = Math.max(targetNestEgg - projected, 0);
  const onTrack = projected >= targetNestEgg;

  const requiredAnnual =
    gap > 0 ? gap / ((Math.pow(1 + r, n) - 1) / r) : 0;

  return {
    id: "retirement_target",
    title: "Are you on track for retirement?",
    category: "RETIREMENT",
    priority: onTrack ? "INFO" : "MEDIUM",
    status: primaryAge == null ? "NEEDS_INFO" : onTrack ? "ON_TRACK" : "ACTION_NEEDED",
    annualAmount: requiredAnnual,
    headline:
      primaryAge == null
        ? "Add birthdates in Settings so we can project a retirement number."
        : onTrack
          ? `On current contributions you're projected to reach about ${money(projected)} by ${ASSUMPTIONS.defaultRetirementAge} — past the ${money(targetNestEgg)} target.`
          : `You're projected to reach about ${money(projected)} by ${ASSUMPTIONS.defaultRetirementAge}, against a ${money(targetNestEgg)} target.`,
    why: [
      `A common planning rule replaces ${pct(ASSUMPTIONS.retirementIncomeReplacement, 0)} of pre-retirement income. On ${money(income)} that's ${money(targetIncome)} a year.`,
      `At a ${pct(ASSUMPTIONS.safeWithdrawalRate)} withdrawal rate, funding ${money(targetIncome)} a year takes about ${money(targetNestEgg)} invested.`,
      `The projection assumes ${pct(r)} nominal returns over ${n} years and that you keep contributing ${money(annualContributions)} a year. It ignores Social Security, pensions, and any inheritance — all of which push the required number down.`,
      onTrack
        ? "Being ahead of the number means you have options: retiring earlier, working less, or spending more now without guilt."
        : `Closing the gap takes about ${money(requiredAnnual)} a year of additional contributions — which is exactly what the recommendations above are for.`,
    ],
    math: [
      { label: "Household income", value: money(income) },
      { label: `Target retirement income (${pct(ASSUMPTIONS.retirementIncomeReplacement, 0)})`, value: money(targetIncome) },
      { label: `Nest egg needed (${pct(ASSUMPTIONS.safeWithdrawalRate)} rule)`, value: money(targetNestEgg), emphasis: true },
      { label: "Invested today", value: money(invested) },
      { label: "Annual contributions", value: money(annualContributions) },
      { label: `Years to ${ASSUMPTIONS.defaultRetirementAge}`, value: `${n}` },
      { label: "Projected at retirement", value: money(projected), emphasis: true },
      ...(gap > 0
        ? [
            { label: "Gap", value: money(gap) },
            { label: "Extra needed per year", value: money(requiredAnnual), emphasis: true },
          ]
        : []),
    ],
    actions: onTrack
      ? ["Keep going. Re-check after any major income change."]
      : [
          "Work the list above in order — match, HSA, 401(k), Roth, mega backdoor. The gap usually closes without needing new money, just better-placed money.",
          "Social Security is not modeled here and will cover a meaningful share for most households. Check your estimate at ssa.gov.",
        ],
    learnKeys: ["four_percent_rule", "compound_growth"],
    caveats: [
      "This is a straight-line projection, not a simulation. Real returns arrive unevenly, and the order they arrive in matters more than the average.",
      "Excludes Social Security, pensions, home equity, and inheritance.",
      `Uses a retirement age of ${ASSUMPTIONS.defaultRetirementAge} and ${pct(ASSUMPTIONS.equityNominalReturn)} returns as assumptions, not forecasts.`,
    ],
  };
}
