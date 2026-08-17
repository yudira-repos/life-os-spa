import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Stat, BarRow } from "@/components/financialos/Stat";
import { requireFinancialAccess } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";
import { getCashflowSummary } from "@/lib/financialos/cashflow";
import { formatCents } from "@/lib/financialos/money";
import { categoryLabel, categoryEmoji, GROUP_LABELS } from "@/lib/financialos/categories";

export default async function CashflowPage() {
  const access = await requireFinancialAccess();
  if (!access.ok) return null;
  const { household, user, member, isOwner } = access;
  const scope = { memberId: member.id, isOwner };

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "VIEW_CASHFLOW",
    resource: "TRANSACTION",
  });

  const cashflow = await getCashflowSummary(household.id, scope, 6);
  const maxMonth = Math.max(
    ...cashflow.months.map((m) => Math.max(m.incomeCents, m.expenseCents)),
    1
  );
  const maxCategory = cashflow.topCategories[0]?.amountCents ?? 1;

  if (!cashflow.hasEnoughData) {
    return (
      <Card>
        <p className="font-semibold">Not enough data yet.</p>
        <p className="mt-2 text-sm text-neutral-400">
          We have {cashflow.transactionCount} transaction
          {cashflow.transactionCount === 1 ? "" : "s"} to work with. Below about
          20, any average or trend here would be noise dressed up as insight —
          so rather than draw a confident chart of nothing, this page waits.
        </p>
        <Link
          href="/app/financial/accounts"
          className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          Link an account →
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 sm:grid-cols-4">
        <Stat
          label="Avg monthly income"
          value={formatCents(cashflow.averageMonthlyIncomeCents, { whole: true })}
          tone="positive"
        />
        <Stat
          label="Avg monthly spending"
          value={formatCents(cashflow.averageMonthlyExpenseCents, { whole: true })}
        />
        <Stat
          label="Avg monthly saved"
          value={formatCents(cashflow.averageMonthlySavedCents, { whole: true })}
          sub="Into retirement, 529s, brokerage"
          tone="accent"
        />
        <Stat
          label="Savings rate"
          value={`${Math.round(cashflow.averageSavingsRate * 100)}%`}
          sub="Target 20%+"
          tone={cashflow.averageSavingsRate >= 0.2 ? "positive" : "neutral"}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Month by month</h2>
        <Card className="mt-3">
          <div className="flex flex-col gap-4">
            {cashflow.months.map((month) => (
              <div key={month.month}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-neutral-300">{month.label}</span>
                  <span
                    className={
                      month.netCents >= 0
                        ? "tabular-nums text-emerald-300"
                        : "tabular-nums text-rose-300"
                    }
                  >
                    {month.netCents >= 0 ? "+" : ""}
                    {formatCents(month.netCents, { whole: true })}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  <BarRow
                    label="In"
                    value={month.incomeCents}
                    max={maxMonth}
                    amount={formatCents(month.incomeCents, { whole: true })}
                    tone="positive"
                  />
                  <BarRow
                    label="Out"
                    value={month.expenseCents}
                    max={maxMonth}
                    amount={formatCents(month.expenseCents, { whole: true })}
                    tone="negative"
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-neutral-600">
            Transfers between your own accounts are excluded — moving $2,000 from
            checking to savings is neither income nor spending. Money moved into
            retirement or investment accounts counts as saved, not spent.
          </p>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Where the money goes</h2>
        <Card className="mt-3">
          <div className="flex flex-col gap-2">
            {cashflow.topCategories.slice(0, 12).map((category) => (
              <Link
                key={category.categoryKey}
                href={`/app/financial/transactions?category=${category.categoryKey}`}
                className="rounded-lg px-1 py-0.5 transition-colors hover:bg-white/5"
              >
                <BarRow
                  label={`${categoryEmoji(category.categoryKey)} ${categoryLabel(category.categoryKey)}`}
                  value={category.amountCents}
                  max={maxCategory}
                  amount={formatCents(category.amountCents, { whole: true })}
                />
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold">By group</h2>
        <Card className="mt-3">
          <dl className="divide-y divide-white/5">
            {Object.entries(cashflow.groupTotals)
              .filter(([group, value]) => value !== 0 && group !== "TRANSFER")
              .sort((a, b) => b[1] - a[1])
              .map(([group, value]) => (
                <div key={group} className="flex justify-between py-2 text-sm">
                  <dt className="text-neutral-400">
                    {GROUP_LABELS[group as keyof typeof GROUP_LABELS]}
                  </dt>
                  <dd className="tabular-nums text-neutral-200">
                    {formatCents(value, { whole: true })}
                  </dd>
                </div>
              ))}
          </dl>
          <p className="mt-3 text-xs text-neutral-600">Totals across the last 6 months.</p>
        </Card>
      </section>

      {cashflow.recurring.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Recurring charges</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Same merchant, similar amount, roughly monthly, at least three times.
            These are the charges that keep costing after you stop paying
            attention.
          </p>
          <Card className="mt-3 divide-y divide-white/5 p-0">
            {cashflow.recurring.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-neutral-200">{item.displayName}</p>
                  <p className="text-xs text-neutral-600">
                    {item.occurrences} times · about every {item.averageIntervalDays} days
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-neutral-200">
                    {formatCents(item.averageCents)}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {formatCents(Math.round((item.averageCents * 365) / item.averageIntervalDays), { whole: true })}
                    /year
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
