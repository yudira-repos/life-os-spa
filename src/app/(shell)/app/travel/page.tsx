import Link from "next/link";
import { clsx } from "clsx";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requireTravelAccess } from "@/lib/travelos/authz";
import { upcomingWindows } from "@/lib/travelos/service";
import { RegenerateWindowsButton, WindowStatusButtons } from "@/components/travelos/WindowActions";
import { formatRange, daysBetween, today } from "@/lib/travelos/dates";
import { SEASON_LABELS, SEASON_NOTES } from "@/lib/travelos/seasonality";
import { vacationSavingsSnapshot, localIdeasFor } from "@/lib/travelos/integrations";
import { formatCents } from "@/lib/financialos/money";

export default async function TravelWindowsPage() {
  const access = await requireTravelAccess();
  if (!access.ok) return null;
  const { household, canPlan } = access;

  const [windows, calendars, savings, localIdeas] = await Promise.all([
    upcomingWindows(household.id, 12),
    db.schoolCalendar.findMany({
      where: { householdId: household.id },
      select: { id: true, status: true, name: true },
    }),
    canPlan ? vacationSavingsSnapshot(household.id) : Promise.resolve(null),
    localIdeasFor(household.id, 2),
  ]);

  const confirmed = calendars.filter((c) => c.status === "CONFIRMED");
  const drafts = calendars.filter((c) => c.status === "DRAFT");

  if (confirmed.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <Card className="border-indigo-400/20 bg-indigo-500/5">
          <p className="font-semibold">Start with a school calendar.</p>
          <p className="mt-2 text-sm text-neutral-400">
            Upload the calendar for each child&apos;s school. TravelOS works out
            which days everyone is off, finds the stretches where the whole
            family is free at once, and ranks them by how much they&apos;d cost
            in airfare and PTO.
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            An .ics or .csv export is read exactly. A PDF or a photo of the
            printed calendar is read by a model, and you review every date
            before it counts.
          </p>
          <Link
            href="/app/travel/calendars"
            className="mt-4 inline-block text-sm text-indigo-300 underline underline-offset-2"
          >
            Upload a calendar →
          </Link>
        </Card>

        {drafts.length > 0 && (
          <Card className="border-amber-400/20 bg-amber-500/5">
            <p className="text-sm text-neutral-300">
              {drafts.length} calendar{drafts.length === 1 ? " is" : "s are"}{" "}
              waiting for review. Dates aren&apos;t used for planning until
              they&apos;re confirmed.
            </p>
            <Link
              href="/app/travel/calendars"
              className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
            >
              Review {drafts.length === 1 ? "it" : "them"} →
            </Link>
          </Card>
        )}
      </div>
    );
  }

  const shortlisted = windows.filter((w) => w.status === "SHORTLISTED");
  const rest = windows.filter((w) => w.status !== "SHORTLISTED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">
          {windows.length} window{windows.length === 1 ? "" : "s"} from{" "}
          {confirmed.length} confirmed calendar{confirmed.length === 1 ? "" : "s"}
        </p>
        {canPlan && <RegenerateWindowsButton />}
      </div>

      {savings && savings.goalCount > 0 && (
        <Card className="border-emerald-400/20 bg-emerald-500/5">
          <p className="text-sm text-neutral-300">
            You have {formatCents(savings.savedCents, { whole: true })} saved
            toward {formatCents(savings.targetCents, { whole: true })} of
            vacation goals in FinancialOS.
          </p>
        </Card>
      )}

      {windows.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-400">
            No windows found. That usually means the children&apos;s breaks
            don&apos;t overlap, or every break is inside the two-week lead time
            the planner ignores. Check the calendars are for the right school
            year.
          </p>
        </Card>
      )}

      {shortlisted.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Shortlisted
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {shortlisted.map((window) => (
              <WindowCard key={window.id} window={window} canPlan={canPlan} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {shortlisted.length > 0 ? "Other windows" : "Ranked windows"}
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {rest.map((window) => (
              <WindowCard key={window.id} window={window} canPlan={canPlan} />
            ))}
          </div>
        </section>
      )}

      {localIdeas.length > 0 && (
        <Card>
          <p className="text-sm font-medium">Not every break is a trip</p>
          <p className="mt-1 text-sm text-neutral-400">
            For the short ones, FunOS has ideas closer to home:
          </p>
          <ul className="mt-3 space-y-2">
            {localIdeas.map((idea) => (
              <li key={idea.title} className="text-sm text-neutral-300">
                <span className="font-medium">{idea.title}</span>
                {idea.detail && <span className="text-neutral-500"> — {idea.detail}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function WindowCard({
  window,
  canPlan,
}: {
  window: {
    id: string;
    label: string;
    startDate: Date;
    endDate: Date;
    totalDays: number;
    ptoDaysRequired: number;
    seasonLabel: string | null;
    score: number;
    status: string;
    reasons: unknown;
    conflicts: unknown;
  };
  canPlan: boolean;
}) {
  const reasons = Array.isArray(window.reasons) ? (window.reasons as string[]) : [];
  const conflicts = Array.isArray(window.conflicts) ? (window.conflicts as string[]) : [];
  const season = (window.seasonLabel ?? "SHOULDER") as keyof typeof SEASON_LABELS;
  const leadDays = daysBetween(today(), window.startDate);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {window.label}
            <span
              className={clsx(
                "ml-2 rounded-full px-2 py-0.5 text-[11px]",
                season === "OFF_PEAK" && "bg-emerald-500/15 text-emerald-300",
                season === "SHOULDER" && "bg-indigo-500/15 text-indigo-300",
                season === "PEAK" && "bg-amber-500/15 text-amber-300"
              )}
            >
              {SEASON_LABELS[season]}
            </span>
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            {formatRange(window.startDate, window.endDate)} · {window.totalDays} days ·{" "}
            {window.ptoDaysRequired === 0
              ? "no PTO needed"
              : `${window.ptoDaysRequired} PTO day${window.ptoDaysRequired === 1 ? "" : "s"} each`}
            {leadDays > 0 && ` · ${leadDays} days away`}
          </p>
        </div>
        {canPlan && <WindowStatusButtons windowId={window.id} status={window.status} />}
      </div>

      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-neutral-400">
          {reasons.slice(0, 3).map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-neutral-600">{SEASON_NOTES[season]}</p>

      {conflicts.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          {conflicts.map((conflict, index) => (
            <li key={index}>{conflict}</li>
          ))}
        </ul>
      )}

      {canPlan && (
        <Link
          href={`/app/travel/windows/${window.id}`}
          className="mt-4 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          Where could we go? →
        </Link>
      )}
    </Card>
  );
}
