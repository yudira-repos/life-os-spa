import { ASSUMPTIONS } from "@/lib/financialos/constants";
import type { HouseholdFinancialContext } from "@/lib/financialos/profile";
import { money, pct, type Recommendation } from "@/lib/financialos/advice/types";

// Investing guidance: what to actually buy, and what it costs when you buy
// the expensive version instead.
//
// The recommendation is broad, low-cost index funds. Not because it's
// fashionable, but because it's what the evidence supports and what survives
// the fee arithmetic — which is the part that gets left out of most sales
// conversations, since it's the part that's unflattering to the seller.

export function indexFundRule(
  context: HouseholdFinancialContext
): Recommendation {
  const invested = context.netWorth.investedCents / 100;
  const primaryAge =
    context.earners.map((e) => e.age).find((a): a is number => a != null) ?? 40;

  // Age-based stock allocation, adjusted by stated risk tolerance. A rule of
  // thumb, presented as one.
  const baseStock = Math.min(Math.max(110 - primaryAge, 40), 95);
  const stockPercent =
    context.riskTolerance === "AGGRESSIVE"
      ? Math.min(baseStock + 10, 100)
      : context.riskTolerance === "CONSERVATIVE"
        ? Math.max(baseStock - 15, 30)
        : baseStock;

  // Fee drag: 1% vs 0.05%, over 30 years, on the money already invested.
  const years = 30;
  const grossFuture = invested * Math.pow(1 + ASSUMPTIONS.equityNominalReturn, years);
  const indexFuture = invested * Math.pow(1 + ASSUMPTIONS.equityNominalReturn - 0.0005, years);
  const activeFuture = invested * Math.pow(1 + ASSUMPTIONS.equityNominalReturn - 0.01, years);
  const feeDrag = indexFuture - activeFuture;

  return {
    id: "index_funds",
    title: "What to actually invest in",
    category: "INVESTING",
    priority: "MEDIUM",
    status: "ACTION_NEEDED",
    headline: `Buy broad, low-cost index funds — roughly ${stockPercent}% stocks / ${100 - stockPercent}% bonds at your age and risk tolerance.`,
    why: [
      "Contributing to a 401(k) or IRA is not investing. It's moving money into an account. Until you pick what it buys, it may be sitting in a money market fund earning nothing — an extremely common and extremely expensive oversight.",
      "The evidence on fund selection is unusually one-sided: over any 15-year window, the large majority of actively managed funds underperform their index benchmark after fees. The ones that beat it in one period are mostly not the ones that beat it in the next.",
      `Fees are the part that's certain. A 1% expense ratio versus 0.05% doesn't sound like much. On ${money(invested)} over ${years} years it's about ${money(feeDrag)} — money that goes to the fund company regardless of whether they beat the market.`,
      "Three funds cover essentially everything: a total US stock market index, a total international stock index, and a total bond market index. That's a complete portfolio. Everything beyond it is optimization at the margins.",
      "A target-date fund does the same job in one holding, rebalancing automatically as you age. Slightly higher fees, meaningfully lower chance of the portfolio drifting because nobody rebalanced it for eight years. For most people that's a good trade.",
      `The ${stockPercent}/${100 - stockPercent} split comes from your age (${primaryAge}) and your stated ${context.riskTolerance.toLowerCase()} risk tolerance. It's a starting point, not a law.`,
      "The hard part isn't the portfolio. It's not selling during a crash. Automate the contributions, check the balance rarely, and don't be clever.",
    ],
    math: [
      { label: "Currently invested", value: money(invested) },
      { label: "Suggested stock allocation", value: `${stockPercent}%`, emphasis: true },
      { label: "Suggested bond allocation", value: `${100 - stockPercent}%` },
      { label: `Index fund fee (0.05%) over ${years}y`, value: money(indexFuture) },
      { label: `Active fund fee (1.00%) over ${years}y`, value: money(activeFuture) },
      { label: "Cost of the 1% fee", value: money(feeDrag), emphasis: true },
      { label: "Untaxed, unfeed growth (reference)", value: money(grossFuture) },
    ],
    actions: [
      "Log into every retirement account and check what's actually held. If any of it is in a money market or 'capital preservation' fund by default, that's the first thing to fix.",
      "Look up each fund's expense ratio. Under 0.20% is fine, under 0.10% is better, above 0.50% needs a reason.",
      "In a 401(k), pick the cheapest broad index option available — often an S&P 500 or total market index fund. You're limited to the plan's menu; pick the best thing on it.",
      "In an IRA or brokerage, you have the whole market: a total-market index fund and a total-international index fund cover it.",
      `Rebalance about once a year back to your ${stockPercent}/${100 - stockPercent} target, or use a target-date fund and skip the step.`,
      "Set contributions to automatic. The consistency matters more than the timing, and it removes the temptation to wait for a better entry point.",
    ],
    learnKeys: ["index_funds", "expense_ratio", "asset_allocation", "dollar_cost_averaging"],
    caveats: [
      "Fee comparison assumes 7% gross returns and no withdrawals. It illustrates the mechanism, it doesn't predict a balance.",
      "Allocation rules of thumb are starting points. Someone with a pension, or a very short horizon, or a low tolerance for watching a balance fall by 30%, should adjust.",
      "In taxable accounts, put tax-inefficient holdings (bonds, REITs) in retirement accounts where you can. Asset location is worth a bit and costs nothing.",
    ],
  };
}

export function taxableInvestingRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  // Only relevant once the tax-advantaged accounts are actually being filled.
  const maxingRetirement = context.earners.some(
    (e) => e.currentDeferralDollars >= 20_000
  );
  if (!maxingRetirement) return null;

  const surplus = (context.monthlySurplusCents / 100) * 12;
  if (surplus <= 0) return null;

  return {
    id: "taxable_investing",
    title: "Taxable brokerage account",
    category: "INVESTING",
    priority: "LOW",
    status: "ACTION_NEEDED",
    annualAmount: surplus,
    headline: `With the tax-advantaged accounts filling up, put the remaining ${money(surplus)}/year surplus into a taxable brokerage account.`,
    why: [
      "A taxable brokerage account is the least glamorous and most underrated account: no contribution limit, no withdrawal age, no penalty, no forms.",
      "Long-term capital gains (held over a year) are taxed at 0%, 15%, or 20% — lower than ordinary income rates. Qualified dividends get the same treatment.",
      "Held in broad index funds, it's remarkably tax-efficient on its own: low turnover means few taxable distributions, and you control when gains are realized.",
      "This is also the account that funds anything before 59½ — a sabbatical, early retirement, a house. Money locked in retirement accounts can't do that job.",
      "Tax-loss harvesting: in a down year, sell a losing position and buy a similar (not identical) one. The loss offsets gains and up to $3,000 of ordinary income, and you stay invested throughout.",
    ],
    math: [
      { label: "Annual surplus after expenses", value: money(surplus), emphasis: true },
      { label: "Monthly", value: money(surplus / 12) },
      { label: "Long-term capital gains rate", value: "0% / 15% / 20% by income" },
    ],
    actions: [
      "Open a brokerage account at the same place your IRA lives — fewer logins, same funds.",
      `Automate ${money(surplus / 12)} a month into a total-market index fund.`,
      "Hold positions over a year before selling, so gains are long-term.",
      "Turn OFF automatic dividend reinvestment only if you want the flexibility to direct dividends elsewhere — otherwise leave it on.",
    ],
    learnKeys: ["taxable_brokerage", "capital_gains", "tax_loss_harvesting"],
  };
}

export function savingsRateRule(
  context: HouseholdFinancialContext
): Recommendation | null {
  if (!context.cashflow.hasEnoughData) return null;

  const rate = context.cashflow.averageSavingsRate;
  const income = context.cashflow.averageMonthlyIncomeCents / 100;
  const expenses = context.cashflow.averageMonthlyExpenseCents / 100;
  const surplus = income - expenses;

  const healthy = rate >= 0.2;
  const concerning = rate < 0.05;

  return {
    id: "savings_rate",
    title: "Your savings rate",
    category: "GOALS",
    priority: concerning ? "HIGH" : healthy ? "INFO" : "MEDIUM",
    status: healthy ? "ON_TRACK" : "ACTION_NEEDED",
    headline: healthy
      ? `You're saving ${pct(rate, 0)} of income — ${money(surplus)} a month. That's a strong rate.`
      : concerning
        ? `You're saving ${pct(rate, 0)} of income. Almost everything on this list depends on freeing up more than that.`
        : `You're saving ${pct(rate, 0)} of income. Getting to 20% is what makes the rest of this plan work.`,
    why: [
      `Over the last few months you've averaged ${money(income)} of income against ${money(expenses)} of spending — a surplus of ${money(surplus)} a month.`,
      "Savings rate matters more than investment returns for most of a working life. The difference between saving 10% and 20% dwarfs the difference between a 6% and a 7% return, and unlike returns, it's under your control.",
      healthy
        ? "At this rate the compounding does the work. The main risk now is lifestyle creep as income rises — the fix is automating increases so raises get saved before they're seen."
        : "The largest levers are the largest expenses: housing, transportation, and food, in that order. Cancelling subscriptions is satisfying but rarely decisive.",
      ...(context.cashflow.recurring.length > 0
        ? [
            `We found ${context.cashflow.recurring.length} recurring charges totalling about ${money(context.cashflow.recurring.reduce((sum, r) => sum + r.averageCents, 0) / 100)} a month. Worth a look — recurring charges are the ones that keep costing after you stop paying attention.`,
          ]
        : []),
    ],
    math: [
      { label: "Average monthly income", value: money(income) },
      { label: "Average monthly spending", value: money(expenses) },
      { label: "Monthly surplus", value: money(surplus), emphasis: true },
      { label: "Savings rate", value: pct(rate, 0), emphasis: true },
      { label: "Target", value: "20%+" },
    ],
    actions: healthy
      ? [
          "Automate the surplus so it's invested rather than accumulating in checking.",
          "When you get a raise, raise the automatic contribution first.",
        ]
      : [
          "Review the recurring charges on the Cashflow page — that's the fastest win.",
          "Look at the top three spending categories. That's where the real money is, not in the small stuff.",
          "Automate savings on payday so it happens before discretionary spending, not after.",
        ],
    learnKeys: ["savings_rate", "lifestyle_creep"],
  };
}
