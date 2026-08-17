import Link from "next/link";
import { clsx } from "clsx";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/financialos/Stat";
import { requirePropertyAccess } from "@/lib/propertyos/authz";
import { buildDashboard, actualSpend } from "@/lib/propertyos/service";
import { homeFundSnapshot } from "@/lib/propertyos/integrations";
import { formatCents, formatCompactCents } from "@/lib/financialos/money";
import { formatDayWithYear, daysBetween, today } from "@/lib/travelos/dates";
import { BILL_CATEGORY_EMOJI, taxScheduleNote, taxScheduleFor } from "@/lib/propertyos/bills";
import type { BillCategory } from "@/lib/propertyos/bills";

export default async function PropertyOverviewPage() {
  const access = await requirePropertyAccess();
  if (!access.ok) return null;
  const { household, canManage } = access;

  const dashboard = await buildDashboard(household.id, { includeCosts: canManage });

  if (!dashboard.property) {
    return (
      <Card className="border-indigo-400/20 bg-indigo-500/5">
        <p className="font-semibold">Tell PropertyOS about your house.</p>
        <p className="mt-2 text-sm text-neutral-400">
          A few facts — the state it&apos;s in, whether there&apos;s a water
          softener, whether trees hang over the roof — are enough to build the
          maintenance schedule and work out when property tax is due.
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          If FinancialOS is connected, PropertyOS will also find the home bills
          you&apos;re already paying rather than making you type them in.
        </p>
        <Link
          href="/app/property/settings"
          className="mt-4 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          Set up the property →
        </Link>
      </Card>
    );
  }

  const [spend, homeFund] = await Promise.all([
    canManage ? actualSpend(household.id, 12) : Promise.resolve(null),
    canManage ? homeFundSnapshot(household.id) : Promise.resolve(null),
  ]);

  const taxSchedule = taxScheduleFor(dashboard.property.stateCode);
  const taxDaysAway = dashboard.nextTaxDeadline
    ? daysBetween(today(), dashboard.nextTaxDeadline.date)
    : null;

  return (
    <div className="flex flex-col gap-8">
      {canManage && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Overdue"
            value={String(dashboard.overdue.length)}
            sub={dashboard.overdue.length > 0 ? "Needs attention now" : "Nothing overdue"}
            tone={dashboard.overdue.length > 0 ? "negative" : "positive"}
          />
          <Stat
            label="Next 2 weeks"
            value={String(dashboard.dueSoon.length)}
            sub="Bills and jobs due"
            tone="accent"
          />
          <Stat
            label="Cost of ownership"
            value={formatCompactCents(dashboard.costs.monthlyTotalCents)}
            sub="per month, all in"
          />
          <Stat
            label="Spent last 12 months"
            value={spend ? formatCompactCents(spend.totalCents) : "—"}
            sub="Logged bills and repairs"
          />
        </section>
      )}

      {dashboard.nextTaxDeadline && canManage && (
        <Card
          className={clsx(
            taxDaysAway != null && taxDaysAway <= 30
              ? "border-amber-400/30 bg-amber-500/5"
              : undefined
          )}
        >
          <p className="font-semibold">
            🏛️ Property tax — {dashboard.nextTaxDeadline.label}
          </p>
          <p className="mt-1 text-sm text-neutral-300">
            Delinquent after {formatDayWithYear(dashboard.nextTaxDeadline.date)}
            {taxDaysAway != null && taxDaysAway >= 0 && ` — ${taxDaysAway} days away`}. Nominally
            due {formatDayWithYear(dashboard.nextTaxDeadline.dueDate)}.
          </p>
          {dashboard.costs.estimatedTaxCents && (
            <p className="mt-1 text-sm text-neutral-400">
              Estimated annual bill:{" "}
              {formatCents(dashboard.costs.estimatedTaxCents, { whole: true })} — about{" "}
              {formatCents(
                Math.round(
                  dashboard.costs.estimatedTaxCents /
                    Math.max(taxSchedule?.installments.length ?? 1, 1)
                ),
                { whole: true }
              )}{" "}
              per installment.
            </p>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            {taxScheduleNote(dashboard.property.stateCode)}
          </p>
          {taxSchedule && !taxSchedule.verified && (
            <p className="mt-1 text-xs text-amber-300">
              These dates are a common default, not verified for your county — confirm
              them against your tax bill.
            </p>
          )}
        </Card>
      )}

      {dashboard.overdue.length > 0 && (
        <ItemSection title="Overdue" items={dashboard.overdue} tone="negative" canManage={canManage} />
      )}
      {dashboard.dueSoon.length > 0 && (
        <ItemSection title="Due now" items={dashboard.dueSoon} tone="warning" canManage={canManage} />
      )}
      {dashboard.upcoming.length > 0 && (
        <ItemSection title="Coming up" items={dashboard.upcoming} tone="neutral" canManage={canManage} />
      )}

      {dashboard.overdue.length === 0 &&
        dashboard.dueSoon.length === 0 &&
        dashboard.upcoming.length === 0 && (
          <Card>
            <p className="text-sm text-neutral-400">
              Nothing due in the next 45 days.{" "}
              {dashboard.counts.tasks === 0 && (
                <>
                  There are no maintenance tasks yet —{" "}
                  <Link
                    href="/app/property/maintenance"
                    className="text-indigo-300 underline underline-offset-2"
                  >
                    add the standard list
                  </Link>{" "}
                  to get started.
                </>
              )}
            </p>
          </Card>
        )}

      {canManage && (
        <section>
          <h2 className="text-lg font-semibold">What this house costs</h2>
          <Card className="mt-3">
            <dl className="divide-y divide-white/5">
              <Row label="Bills (annualised)" value={formatCents(dashboard.costs.annualBillsCents, { whole: true })} />
              <Row label="Scheduled maintenance" value={formatCents(dashboard.costs.annualMaintenanceCents, { whole: true })} />
              <Row
                label="Replacement reserve"
                value={formatCents(dashboard.costs.annualReserveCents, { whole: true })}
                hint="A year of aging across the equipment you've recorded — what you'd need to set aside so a water heater failure isn't a shock."
              />
              <Row
                label="Total per year"
                value={formatCents(dashboard.costs.annualTotalCents, { whole: true })}
                emphasis
              />
              <Row
                label="Per month"
                value={formatCents(dashboard.costs.monthlyTotalCents, { whole: true })}
                emphasis
              />
            </dl>

            {homeFund && (
              <p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3 text-xs text-neutral-300">
                Your FinancialOS home maintenance fund holds{" "}
                {formatCents(homeFund.currentCents, { whole: true })} against a{" "}
                {formatCents(homeFund.targetCents, { whole: true })} target.{" "}
                <Link
                  href="/app/financial/goals"
                  className="text-indigo-300 underline underline-offset-2"
                >
                  Manage it →
                </Link>
              </p>
            )}

            <p className="mt-3 text-xs text-neutral-600">
              Bills use your typical amounts; maintenance uses catalog estimates
              until you log real costs. Both get more accurate as you use it.
            </p>
          </Card>
        </section>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-neutral-400">
        {label}
        {hint && <span className="block text-[11px] text-neutral-600">{hint}</span>}
      </dt>
      <dd
        className={clsx(
          "shrink-0 tabular-nums",
          emphasis ? "text-sm font-semibold text-neutral-100" : "text-sm text-neutral-300"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ItemSection({
  title,
  items,
  tone,
  canManage,
}: {
  title: string;
  items: {
    kind: string;
    id: string;
    name: string;
    detail: string;
    dueDate: Date;
    amountCents?: number;
    category: string;
  }[];
  tone: "negative" | "warning" | "neutral";
  canManage: boolean;
}) {
  return (
    <section>
      <h2
        className={clsx(
          "text-sm font-semibold uppercase tracking-wide",
          tone === "negative" && "text-rose-300",
          tone === "warning" && "text-amber-300",
          tone === "neutral" && "text-neutral-500"
        )}
      >
        {title}
      </h2>
      <Card className="mt-3 divide-y divide-white/5 p-0">
        {items.map((item) => (
          <div
            key={`${item.kind}-${item.id}`}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm text-neutral-200">
                <span className="mr-2">
                  {item.kind === "BILL"
                    ? (BILL_CATEGORY_EMOJI[item.category as BillCategory] ?? "📄")
                    : "🔧"}
                </span>
                {item.name}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {formatDayWithYear(item.dueDate)} · {item.detail}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {canManage && item.amountCents != null && item.amountCents > 0 && (
                <span className="text-sm tabular-nums text-neutral-300">
                  {formatCents(item.amountCents)}
                </span>
              )}
              <Link
                href={item.kind === "BILL" ? "/app/property/bills" : "/app/property/maintenance"}
                className="text-xs text-indigo-300 underline underline-offset-2"
              >
                Open
              </Link>
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}
