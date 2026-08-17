// Tax-year constants. Every number here is a real, published figure — none are
// estimated, interpolated, or remembered. Sources are cited inline so that
// next November's update is a mechanical edit against a single IRS release
// rather than an archaeology project.
//
// The advice engine reads ONLY from this file. No rule hardcodes a dollar
// amount, so rolling the tax year forward is one file, one PR, and the rules
// keep working.
//
// Sources:
//   IRS Notice 2025-67 / IR-2025-110 — retirement plan limits for 2026
//     https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
//   Rev. Proc. 2025-32 — inflation adjustments for tax year 2026 (brackets,
//     standard deduction, gift/estate)
//     https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill
//   Rev. Proc. 2025-19 — 2026 HSA/HDHP limits

export const TAX_YEAR = 2026;

// --- Workplace retirement plans (401k/403b/457b) ---------------------------
export const LIMITS_401K = {
  /** 402(g) employee elective deferral limit. */
  electiveDeferral: 24_500,
  /** Age 50+ catch-up (ages 50-59 and 64+). */
  catchUp50: 8_000,
  /** SECURE 2.0 enhanced catch-up, ages 60-63 only. */
  catchUp60to63: 11_250,
  /**
   * 415(c) total annual additions: employee + employer + after-tax, per
   * employer plan. This is the ceiling the Mega Backdoor Roth fills up to.
   */
  annualAdditions: 72_000,
  /** 401(a)(17) compensation cap used in match/profit-sharing math. */
  compensationLimit: 360_000,
  /** Highly compensated employee threshold (based on prior-year pay). */
  hceThreshold: 160_000,
  /**
   * SECURE 2.0: if prior-year FICA wages from THIS employer exceeded this,
   * catch-up contributions must be Roth. Effective for 2026.
   */
  rothCatchUpWageThreshold: 150_000,
} as const;

// --- IRAs -------------------------------------------------------------------
export const LIMITS_IRA = {
  contribution: 7_500,
  catchUp50: 1_100,
} as const;

/** Roth IRA direct-contribution MAGI phase-outs. Above the top = Backdoor territory. */
export const ROTH_IRA_PHASEOUT = {
  SINGLE: { start: 153_000, end: 168_000 },
  HEAD_OF_HOUSEHOLD: { start: 153_000, end: 168_000 },
  MARRIED_JOINT: { start: 242_000, end: 252_000 },
  MARRIED_SEPARATE: { start: 0, end: 10_000 },
} as const;

/** Traditional IRA deductibility phase-outs when covered by a workplace plan. */
export const TRAD_IRA_DEDUCTION_PHASEOUT = {
  SINGLE_COVERED: { start: 81_000, end: 91_000 },
  HEAD_OF_HOUSEHOLD_COVERED: { start: 81_000, end: 91_000 },
  MARRIED_JOINT_COVERED: { start: 129_000, end: 149_000 },
  /** Contributor NOT covered, but spouse is. */
  MARRIED_JOINT_SPOUSE_COVERED: { start: 242_000, end: 252_000 },
  MARRIED_SEPARATE_COVERED: { start: 0, end: 10_000 },
} as const;

// --- HSA / HDHP -------------------------------------------------------------
export const LIMITS_HSA = {
  selfOnly: 4_400,
  family: 8_750,
  /** Age 55+, per eligible individual (not indexed — fixed by statute). */
  catchUp55: 1_000,
  hdhpMinDeductibleSelf: 1_700,
  hdhpMinDeductibleFamily: 3_400,
  hdhpMaxOutOfPocketSelf: 8_500,
  hdhpMaxOutOfPocketFamily: 17_000,
} as const;

// --- Other plan types -------------------------------------------------------
export const LIMITS_SIMPLE = {
  deferral: 17_000,
  higherDeferral: 18_100,
  catchUp50: 4_000,
  catchUp60to63: 5_250,
} as const;

export const LIMITS_FSA = {
  healthCareSalaryReduction: 3_400,
} as const;

// --- Gift / estate / education ---------------------------------------------
export const GIFT_AND_ESTATE = {
  /** Annual exclusion per donor, per recipient. Two parents = 2x into a 529. */
  annualExclusion: 19_000,
  /** 529 five-year election ("superfunding"): 5 years of exclusions at once. */
  superfundingMultiplier: 5,
  estateExclusion: 15_000_000,
} as const;

// --- Payroll ----------------------------------------------------------------
export const PAYROLL = {
  socialSecurityWageBase: 184_500,
  socialSecurityRate: 0.062,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: { SINGLE: 200_000, MARRIED_JOINT: 250_000 },
} as const;

// --- Federal income tax -----------------------------------------------------
export const STANDARD_DEDUCTION = {
  SINGLE: 16_100,
  MARRIED_JOINT: 32_200,
  MARRIED_SEPARATE: 16_100,
  HEAD_OF_HOUSEHOLD: 24_150,
} as const;

export interface TaxBracket {
  rate: number;
  upTo: number; // Infinity for the top bracket
}

/** Marginal brackets on TAXABLE income (after deductions). */
export const FEDERAL_BRACKETS: Record<FilingStatus, TaxBracket[]> = {
  SINGLE: [
    { rate: 0.1, upTo: 12_400 },
    { rate: 0.12, upTo: 50_400 },
    { rate: 0.22, upTo: 105_700 },
    { rate: 0.24, upTo: 201_775 },
    { rate: 0.32, upTo: 256_225 },
    { rate: 0.35, upTo: 640_600 },
    { rate: 0.37, upTo: Infinity },
  ],
  MARRIED_JOINT: [
    { rate: 0.1, upTo: 24_800 },
    { rate: 0.12, upTo: 100_800 },
    { rate: 0.22, upTo: 211_400 },
    { rate: 0.24, upTo: 403_550 },
    { rate: 0.32, upTo: 512_450 },
    { rate: 0.35, upTo: 768_700 },
    { rate: 0.37, upTo: Infinity },
  ],
  // MFS brackets are the MFJ brackets halved.
  MARRIED_SEPARATE: [
    { rate: 0.1, upTo: 12_400 },
    { rate: 0.12, upTo: 50_400 },
    { rate: 0.22, upTo: 105_700 },
    { rate: 0.24, upTo: 201_775 },
    { rate: 0.32, upTo: 256_225 },
    { rate: 0.35, upTo: 384_350 },
    { rate: 0.37, upTo: Infinity },
  ],
  HEAD_OF_HOUSEHOLD: [
    { rate: 0.1, upTo: 17_700 },
    { rate: 0.12, upTo: 67_450 },
    { rate: 0.22, upTo: 105_700 },
    { rate: 0.24, upTo: 201_775 },
    { rate: 0.32, upTo: 256_200 },
    { rate: 0.35, upTo: 640_600 },
    { rate: 0.37, upTo: Infinity },
  ],
};

export type FilingStatus =
  | "SINGLE"
  | "MARRIED_JOINT"
  | "MARRIED_SEPARATE"
  | "HEAD_OF_HOUSEHOLD";

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  SINGLE: "Single",
  MARRIED_JOINT: "Married, filing jointly",
  MARRIED_SEPARATE: "Married, filing separately",
  HEAD_OF_HOUSEHOLD: "Head of household",
};

// --- State income tax -------------------------------------------------------
// Top marginal state rate, used only to size the tax benefit of pre-tax
// contributions — this is NOT a state tax calculator and doesn't pretend to
// be. States with no wage income tax are 0, which correctly makes the engine
// stop claiming a state-tax saving that doesn't exist.
export const STATE_TOP_MARGINAL_RATE: Record<string, number> = {
  AL: 0.05, AK: 0, AZ: 0.025, AR: 0.039, CA: 0.133, CO: 0.044, CT: 0.0699,
  DE: 0.066, DC: 0.1075, FL: 0, GA: 0.0539, HI: 0.11, ID: 0.05695, IL: 0.0495,
  IN: 0.03, IA: 0.038, KS: 0.0558, KY: 0.04, LA: 0.03, ME: 0.0715, MD: 0.0575,
  MA: 0.09, MI: 0.0425, MN: 0.0985, MS: 0.044, MO: 0.047, MT: 0.059,
  NE: 0.052, NV: 0, NH: 0, NJ: 0.1075, NM: 0.059, NY: 0.109, NC: 0.0425,
  ND: 0.025, OH: 0.035, OK: 0.0475, OR: 0.099, PA: 0.0307, RI: 0.0599,
  SC: 0.062, SD: 0, TN: 0, TX: 0, UT: 0.0455, VT: 0.0875, VA: 0.0575,
  WA: 0, WV: 0.0482, WI: 0.0765, WY: 0,
};

/** States offering a state income tax deduction/credit for 529 contributions. */
export const STATE_529_BENEFIT: Record<
  string,
  { type: "DEDUCTION" | "CREDIT" | "NONE"; maxPerYear?: number; note: string }
> = {
  CA: { type: "NONE", note: "California gives no state tax break for 529 contributions." },
  NY: { type: "DEDUCTION", maxPerYear: 10_000, note: "Up to $10,000/year deductible for married filing jointly ($5,000 single)." },
  IL: { type: "DEDUCTION", maxPerYear: 20_000, note: "Up to $20,000/year deductible for married filing jointly ($10,000 single)." },
  PA: { type: "DEDUCTION", maxPerYear: 38_000, note: "Deductible up to the annual gift exclusion per beneficiary, per spouse — and PA lets you use any state's plan." },
  IN: { type: "CREDIT", maxPerYear: 1_500, note: "20% state tax credit on contributions, up to $1,500/year." },
  TX: { type: "NONE", note: "No state income tax, so no 529 deduction to capture." },
  FL: { type: "NONE", note: "No state income tax, so no 529 deduction to capture." },
  WA: { type: "NONE", note: "No state income tax, so no 529 deduction to capture." },
  NV: { type: "NONE", note: "No state income tax, so no 529 deduction to capture." },
  TN: { type: "NONE", note: "No state income tax, so no 529 deduction to capture." },
  NH: { type: "NONE", note: "No tax on wage income, so no 529 deduction to capture." },
  SD: { type: "NONE", note: "No state income tax, so no 529 deduction to capture." },
  WY: { type: "NONE", note: "No state income tax, so no 529 deduction to capture." },
  AK: { type: "NONE", note: "No state income tax, so no 529 deduction to capture." },
};

// --- Planning assumptions ---------------------------------------------------
// Assumptions, clearly labelled as assumptions. Every projection the UI shows
// cites these, because a number with an invisible assumption behind it is
// worse than no number.
export const ASSUMPTIONS = {
  /** Long-run nominal return for a diversified stock index portfolio. */
  equityNominalReturn: 0.07,
  /** Long-run inflation, used to state goals in today's dollars. */
  inflation: 0.025,
  /** College cost inflation runs above general inflation, persistently. */
  collegeInflation: 0.05,
  /** Cash/high-yield savings, for emergency fund and short-horizon goals. */
  cashReturn: 0.04,
  /** Debt above this APR gets paid off before taxable investing. */
  highInterestDebtApr: 0.07,
  /** A "typical" retirement age used only when the user hasn't said otherwise. */
  defaultRetirementAge: 65,
  /** Replacement ratio of pre-retirement income commonly used for planning. */
  retirementIncomeReplacement: 0.75,
  /** Safe-ish withdrawal rate for the retirement-number estimate. */
  safeWithdrawalRate: 0.04,
} as const;

export const SOURCES = {
  irsRetirement2026:
    "https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500",
  irsInflation2026:
    "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
  irsBackdoorPubs: "https://www.irs.gov/publications/p590a",
  irsHsa: "https://www.irs.gov/publications/p969",
  plaidDocs: "https://plaid.com/docs/",
} as const;

// --- Derived helpers --------------------------------------------------------

/** Catch-up amount a person may add to a workplace plan at a given age. */
export function workplaceCatchUpFor(age: number): number {
  if (age >= 60 && age <= 63) return LIMITS_401K.catchUp60to63;
  if (age >= 50) return LIMITS_401K.catchUp50;
  return 0;
}

export function iraCatchUpFor(age: number): number {
  return age >= 50 ? LIMITS_IRA.catchUp50 : 0;
}

export function hsaLimitFor(coverage: "SELF" | "FAMILY" | "NONE", age: number): number {
  if (coverage === "NONE") return 0;
  const base = coverage === "FAMILY" ? LIMITS_HSA.family : LIMITS_HSA.selfOnly;
  return base + (age >= 55 ? LIMITS_HSA.catchUp55 : 0);
}

/** Marginal federal rate on the next dollar of taxable income. */
export function marginalFederalRate(
  taxableIncome: number,
  filingStatus: FilingStatus
): number {
  const brackets = FEDERAL_BRACKETS[filingStatus];
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.upTo) return bracket.rate;
  }
  return brackets[brackets.length - 1].rate;
}

/** Total federal income tax on taxable income, summed bracket by bracket. */
export function federalTaxOn(
  taxableIncome: number,
  filingStatus: FilingStatus
): number {
  if (taxableIncome <= 0) return 0;

  const brackets = FEDERAL_BRACKETS[filingStatus];
  let tax = 0;
  let previousCap = 0;

  for (const bracket of brackets) {
    const slice = Math.min(taxableIncome, bracket.upTo) - previousCap;
    if (slice <= 0) break;
    tax += slice * bracket.rate;
    previousCap = bracket.upTo;
    if (taxableIncome <= bracket.upTo) break;
  }
  return tax;
}

export function stateMarginalRate(stateCode: string): number {
  return STATE_TOP_MARGINAL_RATE[stateCode?.toUpperCase()] ?? 0;
}

/**
 * Combined marginal rate used to size "you'd save $X in tax" claims. Federal
 * marginal + state top marginal. State deductibility of federal tax and vice
 * versa is ignored — it's a second-order effect on a number we present as an
 * estimate, and pretending otherwise would imply a precision we don't have.
 */
export function combinedMarginalRate(
  taxableIncome: number,
  filingStatus: FilingStatus,
  stateCode: string
): number {
  return (
    marginalFederalRate(taxableIncome, filingStatus) + stateMarginalRate(stateCode)
  );
}

/**
 * Where an income lands in a phase-out range.
 * 1 = full contribution allowed, 0 = fully phased out.
 */
export function phaseOutFactor(
  income: number,
  range: { start: number; end: number }
): number {
  if (income <= range.start) return 1;
  if (income >= range.end) return 0;
  return (range.end - income) / (range.end - range.start);
}
