import { db } from "@/lib/db";
import { EXPENSE_GROUPS, categoryGroup, type CategoryGroup } from "@/lib/financialos/categories";
import { detectRecurring } from "@/lib/financialos/categorize";
import { accountVisibilityWhere, type VisibilityScope } from "@/lib/financialos/authz";

// Income and expense tracking. The definitions matter more than the code:
//
//   income   = sum of inflows in INCOME categories
//   expenses = sum of outflows in ESSENTIAL/LIFESTYLE/DEBT/OTHER
//   saved    = sum of outflows in SAVINGS  (money moved, not money spent)
//   net      = income - expenses           (savings is NOT subtracted twice)
//   savings rate = (income - expenses) / income
//
// Transfers are excluded from all of the above. So are transactions the user
// explicitly excluded, and pending ones — a pending charge that later posts
// would otherwise be counted twice for a few days, which is exactly the kind
// of thing that makes someone stop trusting the number.

export interface MonthlyCashflow {
  month: string; // "2026-08"
  label: string; // "Aug 2026"
  incomeCents: number;
  expenseCents: number;
  savedCents: number;
  netCents: number;
  savingsRate: number; // 0..1, 0 when there's no income
}

export interface CategoryTotal {
  categoryKey: string;
  group: CategoryGroup;
  amountCents: number; // positive magnitude
  transactionCount: number;
  shareOfExpenses: number; // 0..1
}

export interface CashflowSummary {
  months: MonthlyCashflow[];
  current: MonthlyCashflow;
  averageMonthlyIncomeCents: number;
  averageMonthlyExpenseCents: number;
  averageMonthlySavedCents: number;
  averageSavingsRate: number;
  topCategories: CategoryTotal[];
  groupTotals: Record<CategoryGroup, number>;
  recurring: ReturnType<typeof detectRecurring>;
  transactionCount: number;
  hasEnoughData: boolean;
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function emptyMonth(key: string): MonthlyCashflow {
  return {
    month: key,
    label: monthLabel(key),
    incomeCents: 0,
    expenseCents: 0,
    savedCents: 0,
    netCents: 0,
    savingsRate: 0,
  };
}

/** The last `count` month keys, oldest first, ending with the current month. */
export function recentMonthKeys(count: number, from = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    keys.push(monthKey(d));
  }
  return keys;
}

export async function getCashflowSummary(
  householdId: string,
  scope: VisibilityScope,
  months = 6
): Promise<CashflowSummary> {
  const keys = recentMonthKeys(months);
  const start = new Date(`${keys[0]}-01T00:00:00.000Z`);

  const transactions = await db.transaction.findMany({
    where: {
      householdId,
      date: { gte: start },
      isTransfer: false,
      excludedFromCashflow: false,
      pending: false,
      account: accountVisibilityWhere(scope),
    },
    select: {
      date: true,
      amountCents: true,
      categoryKey: true,
      name: true,
      merchantName: true,
    },
    orderBy: { date: "desc" },
  });

  const byMonth = new Map<string, MonthlyCashflow>(
    keys.map((key) => [key, emptyMonth(key)])
  );
  const byCategory = new Map<string, { amountCents: number; count: number }>();
  const groupTotals: Record<CategoryGroup, number> = {
    INCOME: 0,
    ESSENTIAL: 0,
    LIFESTYLE: 0,
    SAVINGS: 0,
    DEBT: 0,
    TRANSFER: 0,
    OTHER: 0,
  };

  for (const transaction of transactions) {
    const key = monthKey(transaction.date);
    const month = byMonth.get(key);
    if (!month) continue;

    const group = categoryGroup(transaction.categoryKey);
    const magnitude = Math.abs(transaction.amountCents);

    if (group === "INCOME" && transaction.amountCents > 0) {
      month.incomeCents += transaction.amountCents;
      groupTotals.INCOME += transaction.amountCents;
    } else if (group === "SAVINGS" && transaction.amountCents < 0) {
      month.savedCents += magnitude;
      groupTotals.SAVINGS += magnitude;
    } else if (EXPENSE_GROUPS.includes(group) && transaction.amountCents < 0) {
      month.expenseCents += magnitude;
      groupTotals[group] += magnitude;
    } else if (group !== "INCOME" && transaction.amountCents > 0) {
      // An inflow in a spending category is a refund. Netting it against that
      // category is more honest than calling a Costco return "income".
      month.expenseCents -= magnitude;
      groupTotals[group] -= magnitude;
    }

    if (group !== "INCOME") {
      const entry = byCategory.get(transaction.categoryKey) ?? { amountCents: 0, count: 0 };
      entry.amountCents += transaction.amountCents < 0 ? magnitude : -magnitude;
      entry.count += 1;
      byCategory.set(transaction.categoryKey, entry);
    }
  }

  const monthsList = keys.map((key) => {
    const month = byMonth.get(key) ?? emptyMonth(key);
    month.netCents = month.incomeCents - month.expenseCents;
    month.savingsRate =
      month.incomeCents > 0 ? month.netCents / month.incomeCents : 0;
    return month;
  });

  // Averages exclude the current (incomplete) month — including a month that's
  // three days old drags every average down and makes the household look like
  // it suddenly stopped earning.
  const completed = monthsList.slice(0, -1).filter((m) => m.incomeCents > 0 || m.expenseCents > 0);
  const divisor = Math.max(completed.length, 1);

  const averageMonthlyIncomeCents = Math.round(
    completed.reduce((sum, m) => sum + m.incomeCents, 0) / divisor
  );
  const averageMonthlyExpenseCents = Math.round(
    completed.reduce((sum, m) => sum + m.expenseCents, 0) / divisor
  );
  const averageMonthlySavedCents = Math.round(
    completed.reduce((sum, m) => sum + m.savedCents, 0) / divisor
  );

  const totalExpenses = Object.entries(groupTotals)
    .filter(([group]) => EXPENSE_GROUPS.includes(group as CategoryGroup))
    .reduce((sum, [, value]) => sum + value, 0);

  const topCategories: CategoryTotal[] = [...byCategory.entries()]
    .map(([categoryKey, entry]) => ({
      categoryKey,
      group: categoryGroup(categoryKey),
      amountCents: entry.amountCents,
      transactionCount: entry.count,
      shareOfExpenses: totalExpenses > 0 ? entry.amountCents / totalExpenses : 0,
    }))
    .filter((c) => c.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);

  const current = monthsList[monthsList.length - 1];

  return {
    months: monthsList,
    current,
    averageMonthlyIncomeCents,
    averageMonthlyExpenseCents,
    averageMonthlySavedCents,
    averageSavingsRate:
      averageMonthlyIncomeCents > 0
        ? (averageMonthlyIncomeCents - averageMonthlyExpenseCents) /
          averageMonthlyIncomeCents
        : 0,
    topCategories,
    groupTotals,
    recurring: detectRecurring(
      transactions.map((t) => ({
        name: t.name,
        merchantName: t.merchantName,
        amountCents: t.amountCents,
        date: t.date,
        categoryKey: t.categoryKey,
      }))
    ).slice(0, 12),
    transactionCount: transactions.length,
    // Below this, every derived number is noise dressed up as insight, and the
    // UI says so instead of drawing a confident chart of nothing.
    hasEnoughData: transactions.length >= 20 && completed.length >= 1,
  };
}

// --- Net worth --------------------------------------------------------------

export interface NetWorthBreakdown {
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  byType: { type: string; label: string; balanceCents: number; accountCount: number }[];
  liquidCents: number; // cash available for an emergency
  investedCents: number;
  accountCount: number;
}

const TYPE_LABELS: Record<string, string> = {
  DEPOSITORY: "Cash & savings",
  INVESTMENT: "Investments",
  CREDIT: "Credit cards",
  LOAN: "Loans",
  OTHER: "Other",
};

export async function getNetWorth(
  householdId: string,
  scope: VisibilityScope
): Promise<NetWorthBreakdown> {
  const accounts = await db.financialAccount.findMany({
    where: {
      householdId,
      closedAt: null,
      includeInNetWorth: true,
      ...accountVisibilityWhere(scope),
    },
    select: { type: true, currentBalanceCents: true, subtype: true },
  });

  let assetsCents = 0;
  let liabilitiesCents = 0;
  let liquidCents = 0;
  let investedCents = 0;
  const byType = new Map<string, { balanceCents: number; accountCount: number }>();

  for (const account of accounts) {
    const balance = account.currentBalanceCents;
    if (balance >= 0) assetsCents += balance;
    else liabilitiesCents += Math.abs(balance);

    if (account.type === "DEPOSITORY") liquidCents += Math.max(balance, 0);
    if (account.type === "INVESTMENT") investedCents += Math.max(balance, 0);

    const entry = byType.get(account.type) ?? { balanceCents: 0, accountCount: 0 };
    entry.balanceCents += balance;
    entry.accountCount += 1;
    byType.set(account.type, entry);
  }

  return {
    assetsCents,
    liabilitiesCents,
    netWorthCents: assetsCents - liabilitiesCents,
    byType: [...byType.entries()]
      .map(([type, entry]) => ({
        type,
        label: TYPE_LABELS[type] ?? type,
        balanceCents: entry.balanceCents,
        accountCount: entry.accountCount,
      }))
      .sort((a, b) => b.balanceCents - a.balanceCents),
    liquidCents,
    investedCents,
    accountCount: accounts.length,
  };
}

/** Months of essential spending the household's liquid cash would cover. */
export function emergencyRunwayMonths(
  liquidCents: number,
  monthlyEssentialCents: number
): number {
  if (monthlyEssentialCents <= 0) return 0;
  return liquidCents / monthlyEssentialCents;
}

/** Average monthly ESSENTIAL spend — the right denominator for an emergency fund. */
export async function getMonthlyEssentialSpendCents(
  householdId: string,
  scope: VisibilityScope,
  months = 3
): Promise<number> {
  const keys = recentMonthKeys(months + 1);
  const start = new Date(`${keys[0]}-01T00:00:00.000Z`);

  const transactions = await db.transaction.findMany({
    where: {
      householdId,
      date: { gte: start },
      isTransfer: false,
      excludedFromCashflow: false,
      pending: false,
      amountCents: { lt: 0 },
      account: accountVisibilityWhere(scope),
    },
    select: { amountCents: true, categoryKey: true },
  });

  const essential = transactions
    .filter((t) => categoryGroup(t.categoryKey) === "ESSENTIAL")
    .reduce((sum, t) => sum + Math.abs(t.amountCents), 0);

  return Math.round(essential / Math.max(months, 1));
}
