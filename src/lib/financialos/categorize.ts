import { db } from "@/lib/db";
import { categoryFromPlaid, isTransferCategory } from "@/lib/financialos/categories";
import type { CategoryRule } from "@/generated/prisma/client";

// Categorization precedence, highest wins:
//
//   1. USER   — someone corrected this exact transaction by hand. Nothing
//               ever overwrites that, including a later Plaid re-sync. This is
//               the rule that makes the feature trustworthy: a correction that
//               silently reverts is worse than no correction at all.
//   2. RULE   — a household rule ("anything containing SAFEWAY is groceries"),
//               highest priority first.
//   3. PLAID  — the provider's personal finance category, mapped to ours.
//   4. Fallback keyword matching for the many transactions Plaid leaves
//               generic ("uncategorized" is a dead end for a user).

export interface CategorizationInput {
  name: string;
  merchantName?: string | null;
  plaidPrimary?: string | null;
  plaidDetailed?: string | null;
  amountCents: number;
}

export interface CategorizationResult {
  categoryKey: string;
  categorySource: "PLAID" | "RULE" | "USER";
  isTransfer: boolean;
}

export async function loadRules(householdId: string): Promise<CategoryRule[]> {
  return db.categoryRule.findMany({
    where: { householdId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

export function applyRules(
  input: CategorizationInput,
  rules: CategoryRule[]
): { categoryKey: string; markAsTransfer: boolean } | null {
  const name = input.name.toLowerCase();
  const merchant = (input.merchantName ?? "").toLowerCase();

  for (const rule of rules) {
    const haystack = rule.matchField === "MERCHANT" ? merchant : name;
    const needle = rule.pattern.toLowerCase();
    if (!needle) continue;

    const matched =
      rule.matchType === "EQUALS"
        ? haystack === needle
        : rule.matchType === "STARTS_WITH"
          ? haystack.startsWith(needle)
          : haystack.includes(needle);

    if (matched) {
      return { categoryKey: rule.categoryKey, markAsTransfer: rule.markAsTransfer };
    }
  }
  return null;
}

// Keyword fallbacks. Not an attempt at a merchant database — just the handful
// of patterns that otherwise land in "uncategorized" and make the whole
// transaction list feel broken. Ordered most-specific first.
const KEYWORD_RULES: { pattern: RegExp; categoryKey: string }[] = [
  { pattern: /\b(vanguard|fidelity|schwab|betterment|wealthfront|robinhood|e\*?trade)\b/i, categoryKey: "brokerage_contribution" },
  { pattern: /\b(529|scholarshare|bright ?start|collegeadvantage|my529)\b/i, categoryKey: "education_savings" },
  { pattern: /\b(401k|401\(k\)|retirement|pension|empower retirement|voya|principal)\b/i, categoryKey: "retirement_contribution" },
  { pattern: /\b(hsa|health savings|healthequity|lively)\b/i, categoryKey: "hsa_contribution" },
  { pattern: /\b(netflix|spotify|hulu|disney\+?|prime video|youtube premium|patreon|substack)\b/i, categoryKey: "subscriptions" },
  { pattern: /\b(safeway|kroger|trader joe|whole foods|costco|aldi|wegmans|publix|h-?e-?b|sprouts)\b/i, categoryKey: "groceries" },
  { pattern: /\b(uber eats|doordash|grubhub|postmates|starbucks|chipotle|mcdonald)\b/i, categoryKey: "dining" },
  { pattern: /\b(uber|lyft|shell|chevron|exxon|76 gas|bp |arco|parking|toll)\b/i, categoryKey: "transport" },
  { pattern: /\b(pg&e|edison|con ?ed|water district|waste management|xcel energy)\b/i, categoryKey: "utilities" },
  { pattern: /\b(comcast|xfinity|at&?t|verizon|t-?mobile|spectrum)\b/i, categoryKey: "phone_internet" },
  { pattern: /\b(geico|state farm|allstate|progressive|term life|northwestern mutual)\b/i, categoryKey: "insurance" },
  { pattern: /\b(mortgage|rent payment|landlord|property management)\b/i, categoryKey: "housing" },
  { pattern: /\b(irs|franchise tax|dept of revenue|treasury tax)\b/i, categoryKey: "taxes" },
  { pattern: /\b(daycare|preschool|montessori|tuition|after ?school)\b/i, categoryKey: "childcare" },
  { pattern: /\b(payroll|direct dep|dir dep|salary|adp|gusto|paychex|workday)\b/i, categoryKey: "paycheck" },
  { pattern: /\b(transfer|xfer|zelle|venmo|cash app|wire)\b/i, categoryKey: "transfer" },
];

export function keywordCategory(input: CategorizationInput): string | null {
  const haystack = `${input.name} ${input.merchantName ?? ""}`;
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(haystack)) {
      // A "payroll" string on an outflow isn't income — it's the payroll
      // provider taking a fee, or a transfer. Sign is a stronger signal than
      // the merchant string, so it wins.
      if (rule.categoryKey === "paycheck" && input.amountCents <= 0) continue;
      return rule.categoryKey;
    }
  }
  return null;
}

export function categorize(
  input: CategorizationInput,
  rules: CategoryRule[]
): CategorizationResult {
  const ruleMatch = applyRules(input, rules);
  if (ruleMatch) {
    return {
      categoryKey: ruleMatch.categoryKey,
      categorySource: "RULE",
      isTransfer: ruleMatch.markAsTransfer || isTransferCategory(ruleMatch.categoryKey),
    };
  }

  const fromPlaid = categoryFromPlaid(input.plaidPrimary, input.plaidDetailed);
  if (fromPlaid !== "uncategorized") {
    return {
      categoryKey: fromPlaid,
      categorySource: "PLAID",
      isTransfer: isTransferCategory(fromPlaid),
    };
  }

  const keyword = keywordCategory(input);
  if (keyword) {
    return {
      categoryKey: keyword,
      categorySource: "PLAID",
      isTransfer: isTransferCategory(keyword),
    };
  }

  return {
    categoryKey: "uncategorized",
    categorySource: "PLAID",
    isTransfer: false,
  };
}

/**
 * Re-run rules across existing history — what you want after adding a rule,
 * so it applies to the past too and not just to whatever syncs next.
 *
 * USER-categorized transactions are left alone, on purpose.
 */
export async function recategorizeHistory(householdId: string): Promise<number> {
  const rules = await loadRules(householdId);
  if (rules.length === 0) return 0;

  const transactions = await db.transaction.findMany({
    where: { householdId, categorySource: { not: "USER" } },
    select: {
      id: true,
      name: true,
      merchantName: true,
      amountCents: true,
      categoryKey: true,
      plaidPfcPrimary: true,
      plaidPfcDetailed: true,
    },
  });

  let updated = 0;
  for (const transaction of transactions) {
    const result = categorize(
      {
        name: transaction.name,
        merchantName: transaction.merchantName,
        amountCents: transaction.amountCents,
        plaidPrimary: transaction.plaidPfcPrimary,
        plaidDetailed: transaction.plaidPfcDetailed,
      },
      rules
    );

    if (result.categoryKey !== transaction.categoryKey) {
      await db.transaction.update({
        where: { id: transaction.id },
        data: {
          categoryKey: result.categoryKey,
          categorySource: result.categorySource,
          isTransfer: result.isTransfer,
        },
      });
      updated += 1;
    }
  }
  return updated;
}

// --- Recurring detection ----------------------------------------------------
// Subscriptions and bills are the highest-leverage thing to surface: they're
// the spending people forget they agreed to. Detection is deliberately simple
// and explainable — same normalized merchant, similar amount, roughly monthly
// spacing, at least 3 occurrences — rather than a model whose output nobody
// can argue with.

export function normalizeMerchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d{2,}/g, "") // strip order numbers, dates, store ids
    .replace(/[^a-z\s]/g, " ")
    .replace(/\b(payment|purchase|pos|debit|card|recurring|autopay|ach)\b/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
}

export interface RecurringCandidate {
  key: string;
  displayName: string;
  categoryKey: string;
  averageCents: number;
  occurrences: number;
  averageIntervalDays: number;
  lastDate: Date;
}

export function detectRecurring(
  transactions: {
    name: string;
    merchantName: string | null;
    amountCents: number;
    date: Date;
    categoryKey: string;
  }[]
): RecurringCandidate[] {
  const groups = new Map<string, typeof transactions>();

  for (const transaction of transactions) {
    if (transaction.amountCents >= 0) continue; // outflows only
    const key = normalizeMerchantKey(transaction.merchantName ?? transaction.name);
    if (key.length < 3) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(transaction);
    groups.set(key, bucket);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [key, bucket] of groups) {
    if (bucket.length < 3) continue;

    const sorted = [...bucket].sort((a, b) => a.date.getTime() - b.date.getTime());
    const amounts = sorted.map((t) => Math.abs(t.amountCents));
    const average = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

    // Amounts must be consistent — a coffee shop visited weekly for varying
    // amounts is a habit, not a subscription.
    const spread = Math.max(...amounts) - Math.min(...amounts);
    if (average > 0 && spread / average > 0.25) continue;

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      const days =
        (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86_400_000;
      intervals.push(days);
    }
    const averageInterval =
      intervals.reduce((sum, d) => sum + d, 0) / Math.max(intervals.length, 1);

    // Weekly through quarterly. Anything outside that is not a bill.
    if (averageInterval < 5 || averageInterval > 95) continue;

    candidates.push({
      key,
      displayName: sorted[sorted.length - 1].merchantName ?? sorted[sorted.length - 1].name,
      categoryKey: sorted[sorted.length - 1].categoryKey,
      averageCents: Math.round(average),
      occurrences: sorted.length,
      averageIntervalDays: Math.round(averageInterval),
      lastDate: sorted[sorted.length - 1].date,
    });
  }

  return candidates.sort((a, b) => b.averageCents - a.averageCents);
}
