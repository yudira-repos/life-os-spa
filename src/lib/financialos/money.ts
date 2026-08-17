// Money in FinancialOS is ALWAYS integer cents. Floats never touch a balance.
//
// Why: 0.1 + 0.2 !== 0.3 in IEEE-754, and a household budget that's off by a
// cent per transaction is a budget nobody trusts. Cents are exact under
// addition/subtraction, and JS numbers are exact integers up to 2^53 — that's
// $90 trillion in cents, so aggregates are safe. Only division (interest,
// percentages, projections) introduces rounding, and those all funnel through
// the helpers below so the rounding rule is stated in one place.

export const CENTS = 100;

export function dollarsToCents(dollars: number): number {
  // Math.round, not truncation: 19.99 * 100 is 1998.9999999999998 in binary
  // floating point, and truncating that loses a cent on a very common price.
  return Math.round(dollars * CENTS);
}

export function centsToDollars(cents: number): number {
  return cents / CENTS;
}

/** Parse free-text money input ("$1,234.56", "1234.56", "(45.00)") to cents. */
export function parseMoneyToCents(input: string): number | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
  const cleaned = trimmed.replace(/[^0-9.]/g, "");
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  const cents = dollarsToCents(value);
  return negative ? -cents : cents;
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCents(cents: number, opts?: { whole?: boolean }): string {
  const fmt = opts?.whole ? USD_WHOLE : USD;
  return fmt.format(centsToDollars(cents));
}

/** "$1.2M" / "$84.5k" / "$940" — for dashboard tiles where precision is noise. */
export function formatCompactCents(cents: number): string {
  const dollars = centsToDollars(cents);
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Multiply cents by a rate and round to whole cents (banker-free, half-up). */
export function scaleCents(cents: number, rate: number): number {
  return Math.round(cents * rate);
}

export function sumCents(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/** Split a monthly target across N months without losing pennies to rounding. */
export function splitCentsEvenly(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function clampCents(cents: number, min: number, max: number): number {
  return Math.min(Math.max(cents, min), max);
}
