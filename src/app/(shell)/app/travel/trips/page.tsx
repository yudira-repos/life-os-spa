import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requireTravelAccess } from "@/lib/travelos/authz";
import { formatRange, daysBetween, today } from "@/lib/travelos/dates";
import { formatCents } from "@/lib/financialos/money";
import { goalProgress } from "@/lib/financialos/goals";

export default async function TripsPage() {
  const access = await requireTravelAccess();
  if (!access.ok) return null;
  const { household, canPlan } = access;

  const trips = await db.trip.findMany({
    where: { householdId: household.id },
    include: { flights: { orderBy: { priceCents: "asc" }, take: 1 } },
    orderBy: { startDate: "asc" },
  });

  if (trips.length === 0) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">
          No trips planned yet. Pick a travel window, choose a destination, and
          confirm it — that&apos;s what creates a trip here.
        </p>
        <Link
          href="/app/travel"
          className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          See travel windows →
        </Link>
      </Card>
    );
  }

  // Savings goals are FinancialOS data, so only planners see the money side.
  const goalIds = trips
    .map((trip) => trip.savingsGoalId)
    .filter((id): id is string => Boolean(id));

  const goals = canPlan && goalIds.length > 0
    ? await db.savingsGoal.findMany({ where: { id: { in: goalIds } } })
    : [];
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));

  return (
    <div className="flex flex-col gap-3">
      {trips.map((trip) => {
        const goal = trip.savingsGoalId ? goalById.get(trip.savingsGoalId) : undefined;
        const progress = goal ? goalProgress(goal) : null;
        const daysAway = daysBetween(today(), trip.startDate);

        return (
          <Card key={trip.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {trip.name}
                  <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400">
                    {trip.status.toLowerCase()}
                  </span>
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {formatRange(trip.startDate, trip.endDate)}
                  {daysAway > 0 && ` · ${daysAway} days away`}
                </p>
              </div>
              {canPlan && trip.estimatedCostCents > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatCents(trip.estimatedCostCents, { whole: true })}
                  </p>
                  <p className="text-[11px] text-neutral-600">estimated total</p>
                </div>
              )}
            </div>

            {canPlan && goal && progress && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-emerald-400/70"
                    style={{ width: `${Math.round(progress.progressFraction * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {formatCents(goal.currentCents, { whole: true })} saved of{" "}
                  {formatCents(goal.targetCents, { whole: true })}
                  {progress.requiredMonthlyCents
                    ? ` · ${formatCents(progress.requiredMonthlyCents)}/month to stay on track`
                    : ""}
                </p>
                <Link
                  href="/app/financial/goals"
                  className="mt-1 inline-block text-xs text-indigo-300 underline underline-offset-2"
                >
                  Manage this goal in FinancialOS →
                </Link>
              </div>
            )}

            {trip.flights.length > 0 && trip.flights[0].bookingUrl && canPlan && (
              <a
                href={trip.flights[0].bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs text-indigo-300 underline underline-offset-2"
              >
                Check current fares for this route ↗
              </a>
            )}

            {trip.notes && <p className="mt-3 text-sm text-neutral-400">{trip.notes}</p>}
          </Card>
        );
      })}
    </div>
  );
}
