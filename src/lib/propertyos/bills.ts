import { addDays, startOfDay, today, utcDay, daysBetween } from "@/lib/travelos/dates";

// Bill categories, cadences, and the property tax schedules that vary by state.
//
// On the state data: California's schedule is modelled properly because it's
// unambiguous and verified against a county treasurer — two installments,
// each with a due date and a later delinquency date, which is the detail that
// actually matters (Nov 1 is when it's "due"; Dec 10 is when the 10% penalty
// lands, and that's the date worth reminding someone about).
//
// Everything else ships as an editable default marked unverified, because
// property tax deadlines genuinely vary by county and the aggregators that
// publish state-level tables disagree with each other. Presenting a scraped
// date as authoritative is how someone misses a payment and gets a penalty —
// so anything we're not sure of says so, and points at the county.

export type BillCategory =
  | "PROPERTY_TAX"
  | "ELECTRIC"
  | "GAS"
  | "WATER"
  | "SEWER"
  | "TRASH"
  | "INTERNET"
  | "INSURANCE"
  | "HOA"
  | "WARRANTY"
  | "LANDSCAPING"
  | "PEST"
  | "SECURITY"
  | "OTHER";

export const BILL_CATEGORY_LABELS: Record<BillCategory, string> = {
  PROPERTY_TAX: "Property tax",
  ELECTRIC: "Electricity",
  GAS: "Gas",
  WATER: "Water",
  SEWER: "Sewer",
  TRASH: "Trash & recycling",
  INTERNET: "Internet & phone",
  INSURANCE: "Home insurance",
  HOA: "HOA dues",
  WARRANTY: "Home warranty",
  LANDSCAPING: "Gardener & landscaping",
  PEST: "Pest control",
  SECURITY: "Security monitoring",
  OTHER: "Other",
};

export const BILL_CATEGORY_EMOJI: Record<BillCategory, string> = {
  PROPERTY_TAX: "🏛️",
  ELECTRIC: "💡",
  GAS: "🔥",
  WATER: "💧",
  SEWER: "🚰",
  TRASH: "🗑️",
  INTERNET: "📶",
  INSURANCE: "🛡️",
  HOA: "🏘️",
  WARRANTY: "🔧",
  LANDSCAPING: "🌿",
  PEST: "🐜",
  SECURITY: "🔒",
  OTHER: "📄",
};

/** The bills essentially every homeowner has — used for the setup checklist. */
export const ESSENTIAL_CATEGORIES: BillCategory[] = [
  "PROPERTY_TAX",
  "INSURANCE",
  "ELECTRIC",
  "WATER",
  "TRASH",
];

export type Cadence =
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL"
  | "SPLIT_SEMIANNUAL"
  | "ONE_TIME";

export const CADENCE_LABELS: Record<Cadence, string> = {
  MONTHLY: "Monthly",
  BIMONTHLY: "Every 2 months",
  QUARTERLY: "Quarterly",
  SEMIANNUAL: "Twice a year",
  ANNUAL: "Annually",
  SPLIT_SEMIANNUAL: "Two installments (property tax)",
  ONE_TIME: "One-off",
};

export const CADENCE_MONTHS: Record<Cadence, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  SPLIT_SEMIANNUAL: 6,
  ONE_TIME: 0,
};

// --- Property tax schedules -------------------------------------------------

export interface TaxInstallment {
  /** Month 1-12 the installment is nominally due. */
  dueMonth: number;
  dueDay: number;
  /** When the penalty actually lands. This is the date worth reminding about. */
  delinquentMonth: number;
  delinquentDay: number;
  label: string;
}

export interface StateTaxSchedule {
  installments: TaxInstallment[];
  /** True only where we've confirmed this against an authoritative source. */
  verified: boolean;
  note: string;
}

export const STATE_TAX_SCHEDULES: Record<string, StateTaxSchedule> = {
  CA: {
    verified: true,
    installments: [
      {
        dueMonth: 11,
        dueDay: 1,
        delinquentMonth: 12,
        delinquentDay: 10,
        label: "1st installment",
      },
      {
        dueMonth: 2,
        dueDay: 1,
        delinquentMonth: 4,
        delinquentDay: 10,
        label: "2nd installment",
      },
    ],
    note:
      "California secured property tax: 1st installment due Nov 1, delinquent after Dec 10; 2nd due Feb 1, delinquent after Apr 10. A 10% penalty applies after each delinquency date. If a delinquency date falls on a weekend or county holiday, it moves to the next business day.",
  },
  TX: {
    verified: false,
    installments: [
      { dueMonth: 1, dueDay: 31, delinquentMonth: 2, delinquentDay: 1, label: "Annual" },
    ],
    note: "Texas is commonly a single January 31 deadline. Confirm with your county appraisal district.",
  },
  WA: {
    verified: false,
    installments: [
      { dueMonth: 4, dueDay: 30, delinquentMonth: 5, delinquentDay: 1, label: "1st half" },
      { dueMonth: 10, dueDay: 31, delinquentMonth: 11, delinquentDay: 1, label: "2nd half" },
    ],
    note: "Washington is commonly two halves, April 30 and October 31. Confirm with your county treasurer.",
  },
  AZ: {
    verified: false,
    installments: [
      { dueMonth: 10, dueDay: 1, delinquentMonth: 11, delinquentDay: 1, label: "1st half" },
      { dueMonth: 3, dueDay: 1, delinquentMonth: 5, delinquentDay: 1, label: "2nd half" },
    ],
    note: "Arizona is commonly two halves. Confirm the delinquency dates with your county treasurer.",
  },
  CO: {
    verified: false,
    installments: [
      { dueMonth: 2, dueDay: 28, delinquentMonth: 3, delinquentDay: 1, label: "1st half" },
      { dueMonth: 6, dueDay: 15, delinquentMonth: 6, delinquentDay: 16, label: "2nd half" },
    ],
    note: "Colorado is commonly two halves, or a single payment by April 30. Confirm with your county.",
  },
  NJ: {
    verified: false,
    installments: [
      { dueMonth: 2, dueDay: 1, delinquentMonth: 2, delinquentDay: 11, label: "Q1" },
      { dueMonth: 5, dueDay: 1, delinquentMonth: 5, delinquentDay: 11, label: "Q2" },
      { dueMonth: 8, dueDay: 1, delinquentMonth: 8, delinquentDay: 11, label: "Q3" },
      { dueMonth: 11, dueDay: 1, delinquentMonth: 11, delinquentDay: 11, label: "Q4" },
    ],
    note: "New Jersey is commonly quarterly with a 10-day grace period. Confirm with your municipality.",
  },
};

/** States where the schedule is genuinely set locally — we won't guess. */
export const LOCALLY_VARIABLE_STATES = new Set(["NY", "PA", "IL", "OH", "MI", "MA", "GA", "FL"]);

export function taxScheduleFor(stateCode: string): StateTaxSchedule | null {
  return STATE_TAX_SCHEDULES[stateCode?.toUpperCase()] ?? null;
}

export function taxScheduleNote(stateCode: string): string {
  const code = stateCode?.toUpperCase();
  const schedule = STATE_TAX_SCHEDULES[code];
  if (schedule) return schedule.note;
  if (LOCALLY_VARIABLE_STATES.has(code)) {
    return `Property tax dates in ${code} are set by your county or municipality rather than the state, so there's no reliable default to pre-fill. Enter your own due dates — they're on your tax bill.`;
  }
  return "We don't ship a default schedule for this state. Enter the due dates from your tax bill.";
}

/**
 * The next property tax deadline from a state schedule. Returns the
 * DELINQUENCY date, not the nominal due date — that's the one with money
 * attached, and the one people actually need to be reminded of.
 */
export function nextTaxDeadline(
  stateCode: string,
  now?: Date
): { date: Date; label: string; dueDate: Date } | null {
  const schedule = taxScheduleFor(stateCode);
  if (!schedule) return null;

  const reference = startOfDay(now ?? today());
  const year = reference.getUTCFullYear();

  const candidates: { date: Date; label: string; dueDate: Date }[] = [];
  for (const offset of [-1, 0, 1]) {
    for (const installment of schedule.installments) {
      candidates.push({
        date: utcDay(year + offset, installment.delinquentMonth, installment.delinquentDay),
        dueDate: utcDay(year + offset, installment.dueMonth, installment.dueDay),
        label: installment.label,
      });
    }
  }

  return (
    candidates
      .filter((candidate) => candidate.date >= reference)
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null
  );
}

/** Estimated annual property tax from assessed value and rate. */
export function estimatedAnnualTaxCents(
  assessedValueCents: number | null,
  taxRatePercent: number | null
): number | null {
  if (!assessedValueCents || !taxRatePercent) return null;
  return Math.round((assessedValueCents * taxRatePercent) / 100);
}

// --- Recurrence -------------------------------------------------------------

/**
 * The next due date for a bill after one is paid. Anchored to the calendar,
 * not to the payment: paying an electricity bill three days late doesn't move
 * next month's bill three days later.
 */
export function nextBillDueDate(params: {
  cadence: Cadence;
  currentDue: Date;
  dueDayOfMonth?: number | null;
  stateCode?: string;
  category?: string;
}): Date | null {
  if (params.cadence === "ONE_TIME") return null;

  // Property tax follows its state schedule rather than a simple interval —
  // California's installments are 3 and 9 months apart, not 6 and 6.
  if (params.category === "PROPERTY_TAX" && params.stateCode) {
    const next = nextTaxDeadline(params.stateCode, addDays(params.currentDue, 1));
    if (next) return next.date;
  }

  const months = CADENCE_MONTHS[params.cadence];
  const base = startOfDay(params.currentDue);
  const targetDay = params.dueDayOfMonth ?? base.getUTCDate();

  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + months;

  // Clamp to the last day of the target month, so a bill due on the 31st
  // doesn't roll into March when the next month is February.
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(targetDay, lastDayOfTarget);

  return new Date(Date.UTC(year, month, day));
}

export type BillStatus = "OVERDUE" | "DUE_SOON" | "UPCOMING" | "SCHEDULED" | "PAUSED";

export function billStatus(
  nextDueDate: Date | null,
  status: string,
  now?: Date
): BillStatus {
  if (status !== "ACTIVE") return "PAUSED";
  if (!nextDueDate) return "SCHEDULED";

  const days = daysBetween(startOfDay(now ?? today()), nextDueDate);
  if (days < 0) return "OVERDUE";
  if (days <= 10) return "DUE_SOON";
  if (days <= 45) return "UPCOMING";
  return "SCHEDULED";
}

/** Annualised cost of a bill, for the cost-of-ownership rollup. */
export function annualBillCents(cadence: Cadence, amountCents: number): number {
  switch (cadence) {
    case "MONTHLY":
      return amountCents * 12;
    case "BIMONTHLY":
      return amountCents * 6;
    case "QUARTERLY":
      return amountCents * 4;
    case "SEMIANNUAL":
    case "SPLIT_SEMIANNUAL":
      return amountCents * 2;
    case "ANNUAL":
      return amountCents;
    case "ONE_TIME":
      return 0;
  }
}

/**
 * Flag a bill that has jumped meaningfully above its own history.
 *
 * Deliberately conservative: 25% above the trailing average AND at least $25
 * more in absolute terms. A percentage alone fires constantly on small bills
 * ($8 to $11 is +37%), and people stop reading warnings that cry wolf.
 */
export function priceJump(
  latestCents: number,
  historyCents: number[]
): { jumped: boolean; averageCents: number; deltaCents: number; percent: number } {
  const relevant = historyCents.filter((value) => value > 0);
  if (relevant.length < 3) {
    return { jumped: false, averageCents: 0, deltaCents: 0, percent: 0 };
  }

  const averageCents = Math.round(
    relevant.reduce((sum, value) => sum + value, 0) / relevant.length
  );
  const deltaCents = latestCents - averageCents;
  const percent = averageCents > 0 ? deltaCents / averageCents : 0;

  return {
    jumped: percent >= 0.25 && deltaCents >= 2_500,
    averageCents,
    deltaCents,
    percent,
  };
}
