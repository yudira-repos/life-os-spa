// The category taxonomy. Static content, same pattern as the KidsOS catalogs.
//
// Two design choices worth stating:
//
// 1. Categories carry a `group`, and the group — not the category — is what
//    the cashflow and advice engines reason about. "Is this household
//    overspending?" is answered with ESSENTIAL vs LIFESTYLE, not with a
//    45-way switch. New categories can be added without touching any engine.
//
// 2. TRANSFER is its own group and is excluded from income and expense
//    totals. Moving $2,000 from checking to savings is not $2,000 of income
//    and $2,000 of spending — counting it as either is the single most common
//    way budgeting tools produce numbers that make no sense.

export type CategoryGroup =
  | "INCOME"
  | "ESSENTIAL"
  | "LIFESTYLE"
  | "SAVINGS"
  | "DEBT"
  | "TRANSFER"
  | "OTHER";

export interface CategoryDefinition {
  key: string;
  label: string;
  group: CategoryGroup;
  emoji: string;
  /** Plaid PERSONAL_FINANCE_CATEGORY primary values that map here. */
  plaidPrimary?: string[];
  /** More specific PFC detailed values that override the primary mapping. */
  plaidDetailed?: string[];
}

export const CATEGORIES: CategoryDefinition[] = [
  // --- Income ---
  { key: "paycheck", label: "Paycheck", group: "INCOME", emoji: "💵", plaidDetailed: ["INCOME_WAGES"] },
  { key: "bonus", label: "Bonus & RSUs", group: "INCOME", emoji: "🎯", plaidDetailed: ["INCOME_OTHER_INCOME"] },
  { key: "self_employment", label: "Self-employment", group: "INCOME", emoji: "🧾", plaidDetailed: ["INCOME_UNEMPLOYMENT", "INCOME_RETIREMENT_PENSION"] },
  { key: "investment_income", label: "Interest & dividends", group: "INCOME", emoji: "📈", plaidDetailed: ["INCOME_INTEREST_EARNED", "INCOME_DIVIDENDS"] },
  { key: "other_income", label: "Other income", group: "INCOME", emoji: "➕", plaidPrimary: ["INCOME"] },
  { key: "refund", label: "Refunds", group: "INCOME", emoji: "↩️", plaidDetailed: ["INCOME_TAX_REFUND"] },

  // --- Essentials ---
  { key: "housing", label: "Rent & mortgage", group: "ESSENTIAL", emoji: "🏠", plaidDetailed: ["RENT_AND_UTILITIES_RENT", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"] },
  { key: "utilities", label: "Utilities", group: "ESSENTIAL", emoji: "💡", plaidPrimary: ["RENT_AND_UTILITIES"] },
  { key: "groceries", label: "Groceries", group: "ESSENTIAL", emoji: "🛒", plaidDetailed: ["FOOD_AND_DRINK_GROCERIES"] },
  { key: "transport", label: "Transportation", group: "ESSENTIAL", emoji: "🚗", plaidPrimary: ["TRANSPORTATION"] },
  { key: "insurance", label: "Insurance", group: "ESSENTIAL", emoji: "🛡️", plaidDetailed: ["GENERAL_SERVICES_INSURANCE"] },
  { key: "healthcare", label: "Healthcare", group: "ESSENTIAL", emoji: "🩺", plaidPrimary: ["MEDICAL"] },
  { key: "childcare", label: "Childcare & school", group: "ESSENTIAL", emoji: "🎒", plaidDetailed: ["GENERAL_SERVICES_CHILDCARE", "GENERAL_SERVICES_EDUCATION"] },
  { key: "taxes", label: "Taxes", group: "ESSENTIAL", emoji: "🏛️", plaidDetailed: ["GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT"] },
  { key: "phone_internet", label: "Phone & internet", group: "ESSENTIAL", emoji: "📶", plaidDetailed: ["RENT_AND_UTILITIES_TELEPHONE", "RENT_AND_UTILITIES_INTERNET_AND_CABLE"] },
  { key: "home_maintenance", label: "Home maintenance", group: "ESSENTIAL", emoji: "🔧", plaidPrimary: ["HOME_IMPROVEMENT"] },

  // --- Lifestyle ---
  { key: "dining", label: "Restaurants & takeout", group: "LIFESTYLE", emoji: "🍽️", plaidPrimary: ["FOOD_AND_DRINK"] },
  { key: "shopping", label: "Shopping", group: "LIFESTYLE", emoji: "🛍️", plaidPrimary: ["GENERAL_MERCHANDISE"] },
  { key: "entertainment", label: "Entertainment", group: "LIFESTYLE", emoji: "🎬", plaidPrimary: ["ENTERTAINMENT"] },
  { key: "travel", label: "Travel & vacation", group: "LIFESTYLE", emoji: "✈️", plaidPrimary: ["TRAVEL"] },
  { key: "subscriptions", label: "Subscriptions", group: "LIFESTYLE", emoji: "🔁", plaidDetailed: ["GENERAL_SERVICES_SUBSCRIPTION"] },
  { key: "personal_care", label: "Personal care", group: "LIFESTYLE", emoji: "💇", plaidPrimary: ["PERSONAL_CARE"] },
  { key: "kids_activities", label: "Kids' activities", group: "LIFESTYLE", emoji: "⚽", plaidDetailed: [] },
  { key: "gifts_donations", label: "Gifts & donations", group: "LIFESTYLE", emoji: "🎁", plaidPrimary: ["GOVERNMENT_AND_NON_PROFIT"] },
  { key: "pets", label: "Pets", group: "LIFESTYLE", emoji: "🐕", plaidDetailed: ["GENERAL_SERVICES_VETERINARY"] },

  // --- Savings & investing ---
  { key: "retirement_contribution", label: "Retirement contributions", group: "SAVINGS", emoji: "🏦" },
  { key: "brokerage_contribution", label: "Brokerage & index funds", group: "SAVINGS", emoji: "📊" },
  { key: "education_savings", label: "529 & education savings", group: "SAVINGS", emoji: "🎓" },
  { key: "emergency_savings", label: "Emergency fund", group: "SAVINGS", emoji: "🧯" },
  { key: "goal_savings", label: "Goal savings", group: "SAVINGS", emoji: "🎯" },
  { key: "hsa_contribution", label: "HSA contributions", group: "SAVINGS", emoji: "🩹" },

  // --- Debt ---
  { key: "credit_card_payment", label: "Credit card payment", group: "DEBT", emoji: "💳", plaidDetailed: ["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"] },
  { key: "student_loan", label: "Student loans", group: "DEBT", emoji: "📚", plaidDetailed: ["LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT"] },
  { key: "auto_loan", label: "Auto loan", group: "DEBT", emoji: "🚙", plaidDetailed: ["LOAN_PAYMENTS_CAR_PAYMENT"] },
  { key: "other_debt", label: "Other loan payments", group: "DEBT", emoji: "📉", plaidPrimary: ["LOAN_PAYMENTS"] },
  { key: "bank_fees", label: "Fees & interest", group: "DEBT", emoji: "⚠️", plaidPrimary: ["BANK_FEES"] },

  // --- Transfers (never counted as income or expense) ---
  { key: "transfer", label: "Transfer", group: "TRANSFER", emoji: "🔄", plaidPrimary: ["TRANSFER_IN", "TRANSFER_OUT"] },

  { key: "services", label: "Services", group: "LIFESTYLE", emoji: "🧰", plaidPrimary: ["GENERAL_SERVICES"] },
  { key: "uncategorized", label: "Uncategorized", group: "OTHER", emoji: "❓" },
];

export const CATEGORY_BY_KEY: Record<string, CategoryDefinition> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c])
);

export function categoryLabel(key: string): string {
  return CATEGORY_BY_KEY[key]?.label ?? "Uncategorized";
}

export function categoryEmoji(key: string): string {
  return CATEGORY_BY_KEY[key]?.emoji ?? "❓";
}

export function categoryGroup(key: string): CategoryGroup {
  return CATEGORY_BY_KEY[key]?.group ?? "OTHER";
}

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  INCOME: "Income",
  ESSENTIAL: "Essentials",
  LIFESTYLE: "Lifestyle",
  SAVINGS: "Savings & investing",
  DEBT: "Debt payments",
  TRANSFER: "Transfers",
  OTHER: "Other",
};

/**
 * Groups that count as money leaving the household in a cashflow sense.
 * SAVINGS is deliberately NOT here — money you moved into a 401k or a 529 is
 * money you still have. Treating it as spending would tell a household that
 * saves aggressively that it's living beyond its means.
 */
export const EXPENSE_GROUPS: CategoryGroup[] = ["ESSENTIAL", "LIFESTYLE", "DEBT", "OTHER"];

// Detailed mappings are checked first — they're more specific than primary.
const DETAILED_MAP = new Map<string, string>();
const PRIMARY_MAP = new Map<string, string>();

for (const category of CATEGORIES) {
  for (const detailed of category.plaidDetailed ?? []) {
    DETAILED_MAP.set(detailed, category.key);
  }
  for (const primary of category.plaidPrimary ?? []) {
    if (!PRIMARY_MAP.has(primary)) PRIMARY_MAP.set(primary, category.key);
  }
}

/** Map Plaid's personal finance category onto our taxonomy. */
export function categoryFromPlaid(
  primary: string | null | undefined,
  detailed: string | null | undefined
): string {
  if (detailed && DETAILED_MAP.has(detailed)) return DETAILED_MAP.get(detailed)!;
  if (primary && PRIMARY_MAP.has(primary)) return PRIMARY_MAP.get(primary)!;
  return "uncategorized";
}

export function isTransferCategory(key: string): boolean {
  return categoryGroup(key) === "TRANSFER";
}

/** Categories a user can pick in the UI, grouped for the dropdown. */
export function categoriesByGroup(): { group: CategoryGroup; label: string; items: CategoryDefinition[] }[] {
  const order: CategoryGroup[] = [
    "INCOME",
    "ESSENTIAL",
    "LIFESTYLE",
    "SAVINGS",
    "DEBT",
    "TRANSFER",
    "OTHER",
  ];
  return order.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: CATEGORIES.filter((c) => c.group === group),
  }));
}
