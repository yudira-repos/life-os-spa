import { db } from "@/lib/db";
import { detectRecurring, normalizeMerchantKey } from "@/lib/financialos/categorize";
import { recentMonthKeys } from "@/lib/financialos/cashflow";
import type { BillCategory } from "@/lib/propertyos/bills";

// Finding the home bills you're already paying.
//
// FinancialOS has the transaction history and already detects recurring
// charges. Rather than asking a homeowner to type in twelve bills they could
// read off a statement, PropertyOS reads what they actually pay and offers it
// for adoption with the amount and cadence pre-filled.
//
// This reads FinancialOS through its existing helpers rather than
// reimplementing recurrence detection. It's a one-directional dependency
// (PropertyOS -> FinancialOS), the same shape as TravelOS's integrations file.
//
// Nothing is created automatically. Detection produces SUGGESTIONS; a human
// adopts them. An auto-created bill with a wrong cadence is worse than no bill
// at all, because it produces confident reminders on the wrong dates.

/** Merchant patterns that indicate a home-related recurring charge. */
const CATEGORY_PATTERNS: { pattern: RegExp; category: BillCategory }[] = [
  { pattern: /\b(pg&?e|pacific gas|edison|duke energy|xcel|dominion|national grid|con ?ed|georgia power|apsc?|srp|aps|puget sound energy|dte|ameren|entergy|firstenergy|ppl electric|pse&?g)\b/i, category: "ELECTRIC" },
  { pattern: /\b(socalgas|southwest gas|nicor|peoples gas|atmos|spire|piedmont natural)\b/i, category: "GAS" },
  { pattern: /\b(water district|water dept|water utility|city of .* water|ebmud|lvvwd|dwp|american water|aqua)\b/i, category: "WATER" },
  { pattern: /\b(sewer|sanitation district|wastewater)\b/i, category: "SEWER" },
  { pattern: /\b(waste management|republic services|recology|waste connections|disposal|garbage|refuse)\b/i, category: "TRASH" },
  { pattern: /\b(comcast|xfinity|at&?t|verizon fios|spectrum|cox comm|centurylink|frontier|google fiber|t-?mobile home)\b/i, category: "INTERNET" },
  { pattern: /\b(state farm|allstate|farmers ins|geico|usaa|liberty mutual|travelers|nationwide|chubb|mercury ins|homeowners ins|hazard ins)\b/i, category: "INSURANCE" },
  { pattern: /\b(hoa|homeowners assoc|community assoc|association dues|first service|associa)\b/i, category: "HOA" },
  { pattern: /\b(american home shield|choice home warranty|first american home|old republic home|home warranty)\b/i, category: "WARRANTY" },
  { pattern: /\b(landscap|lawn|gardener|yard service|mow|tree service)\b/i, category: "LANDSCAPING" },
  { pattern: /\b(terminix|orkin|pest|exterminator|rentokil)\b/i, category: "PEST" },
  { pattern: /\b(adt|simplisafe|vivint|ring protect|brinks home|alarm\.com)\b/i, category: "SECURITY" },
  { pattern: /\b(county tax|tax collector|treasurer.?tax|property tax|assessor)\b/i, category: "PROPERTY_TAX" },
];

export interface DetectedBill {
  /** Normalized merchant key — stable across syncs, used to avoid re-suggesting. */
  key: string;
  suggestedName: string;
  category: BillCategory;
  typicalAmountCents: number;
  /** Observed spacing in days between charges. */
  averageIntervalDays: number;
  suggestedCadence: string;
  occurrences: number;
  lastChargedAt: Date;
  /** How confident the cadence mapping is — an odd interval gets flagged. */
  cadenceCertain: boolean;
}

function categoryFor(name: string): BillCategory | null {
  for (const rule of CATEGORY_PATTERNS) {
    if (rule.pattern.test(name)) return rule.category;
  }
  return null;
}

/** Map an observed interval onto a cadence, with a flag when it's a stretch. */
export function cadenceFromInterval(days: number): { cadence: string; certain: boolean } {
  if (days >= 25 && days <= 35) return { cadence: "MONTHLY", certain: true };
  if (days >= 55 && days <= 68) return { cadence: "BIMONTHLY", certain: true };
  if (days >= 84 && days <= 98) return { cadence: "QUARTERLY", certain: true };
  if (days >= 172 && days <= 195) return { cadence: "SEMIANNUAL", certain: true };
  if (days >= 350 && days <= 380) return { cadence: "ANNUAL", certain: true };

  // Outside the bands — pick the nearest and say we're unsure, rather than
  // silently rounding a 45-day cycle into "monthly".
  if (days < 45) return { cadence: "MONTHLY", certain: false };
  if (days < 75) return { cadence: "BIMONTHLY", certain: false };
  if (days < 135) return { cadence: "QUARTERLY", certain: false };
  if (days < 270) return { cadence: "SEMIANNUAL", certain: false };
  return { cadence: "ANNUAL", certain: false };
}

/**
 * Scan the household's transactions for home-related recurring charges.
 *
 * Returns nothing (rather than failing) when FinancialOS isn't entitled or
 * there's no transaction history — PropertyOS works fine on manual entry.
 */
export async function detectHomeBills(householdId: string): Promise<DetectedBill[]> {
  const entitled = await db.entitlement.findUnique({
    where: { householdId_moduleId: { householdId, moduleId: "financial" } },
  });
  if (!entitled?.enabled) return [];

  // A year of history: enough to catch annual insurance and semiannual tax.
  const keys = recentMonthKeys(13);
  const start = new Date(`${keys[0]}-01T00:00:00.000Z`);

  const transactions = await db.transaction.findMany({
    where: {
      householdId,
      date: { gte: start },
      isTransfer: false,
      excludedFromCashflow: false,
      pending: false,
      amountCents: { lt: 0 },
    },
    select: {
      name: true,
      merchantName: true,
      amountCents: true,
      date: true,
      categoryKey: true,
    },
  });

  if (transactions.length === 0) return [];

  const recurring = detectRecurring(
    transactions.map((t) => ({
      name: t.name,
      merchantName: t.merchantName,
      amountCents: t.amountCents,
      date: t.date,
      categoryKey: t.categoryKey,
    }))
  );

  // Don't re-suggest anything already tracked.
  const existing = await db.propertyBill.findMany({
    where: { householdId },
    select: { detectedKey: true, name: true },
  });
  const trackedKeys = new Set(
    existing
      .map((bill) => bill.detectedKey ?? normalizeMerchantKey(bill.name))
      .filter(Boolean)
  );

  const detected: DetectedBill[] = [];

  for (const candidate of recurring) {
    if (trackedKeys.has(candidate.key)) continue;

    const category = categoryFor(candidate.displayName);
    if (!category) continue; // not a home bill — a gym membership isn't ours

    const { cadence, certain } = cadenceFromInterval(candidate.averageIntervalDays);

    detected.push({
      key: candidate.key,
      suggestedName: candidate.displayName.slice(0, 80),
      category,
      typicalAmountCents: candidate.averageCents,
      averageIntervalDays: candidate.averageIntervalDays,
      suggestedCadence: cadence,
      occurrences: candidate.occurrences,
      lastChargedAt: candidate.lastDate,
      cadenceCertain: certain,
    });
  }

  return detected.sort((a, b) => b.typicalAmountCents - a.typicalAmountCents);
}

/**
 * Which essential home bills have no record at all — the gap list.
 * Every homeowner has insurance and property tax; not seeing them usually
 * means they're paid from an account that isn't linked, or via escrow.
 */
export function missingEssentials(
  tracked: { category: string }[],
  detected: DetectedBill[]
): BillCategory[] {
  const present = new Set([
    ...tracked.map((bill) => bill.category),
    ...detected.map((bill) => bill.category),
  ]);

  const essentials: BillCategory[] = [
    "PROPERTY_TAX",
    "INSURANCE",
    "ELECTRIC",
    "WATER",
    "TRASH",
  ];
  return essentials.filter((category) => !present.has(category));
}
