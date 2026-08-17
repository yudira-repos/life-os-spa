import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requireTravelPlanner, assertCalendarInHousehold } from "@/lib/travelos/authz";
import {
  EntryReviewRow,
  ConfirmCalendarButton,
} from "@/components/travelos/EntryReview";

export default async function CalendarReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireTravelPlanner();
  if (!access.ok) return null;

  const { id } = await params;
  const calendar = await assertCalendarInHousehold(access.household.id, id);
  if (!calendar) return notFound();

  const [entries, links] = await Promise.all([
    db.schoolCalendarEntry.findMany({
      where: { calendarId: calendar.id },
      orderBy: { startDate: "asc" },
    }),
    db.schoolCalendarChild.findMany({
      where: { calendarId: calendar.id },
      include: { child: { select: { name: true } } },
    }),
  ]);

  const unreviewed = entries.filter((e) => !e.confirmed).length;
  const noSchoolDays = entries.filter((e) => e.noSchool).length;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/app/travel/calendars"
        className="text-xs text-neutral-500 hover:text-neutral-300"
      >
        ← All calendars
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{calendar.name}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {links.map((l) => l.child.name).join(", ") || "No children linked"} ·{" "}
          {entries.length} dates · {noSchoolDays} with no school
        </p>
      </div>

      {calendar.status === "DRAFT" && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <p className="font-semibold">Check these dates before confirming.</p>
          <p className="mt-2 text-sm text-neutral-400">
            {calendar.sourceType === "PDF" || calendar.sourceType === "IMAGE"
              ? "These were read from the file by a model. It reads grids well and still gets things wrong — a break that ends a day late here becomes a flight home on a school day."
              : "These were parsed directly from the file, so they should be exact. A quick scan is still worth it."}
          </p>
          {calendar.extractionNotes && (
            <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-neutral-400">
              <span className="font-medium text-neutral-300">Notes from the read:</span>{" "}
              {calendar.extractionNotes}
            </p>
          )}
        </Card>
      )}

      <Card className="divide-y divide-white/5 p-0">
        {entries.map((entry) => (
          <EntryReviewRow
            key={entry.id}
            calendarId={calendar.id}
            entry={{
              id: entry.id,
              title: entry.title,
              startDate: entry.startDate.toISOString(),
              endDate: entry.endDate.toISOString(),
              kind: entry.kind,
              noSchool: entry.noSchool,
              source: entry.source,
              confidence: entry.confidence,
              confirmed: entry.confirmed,
            }}
          />
        ))}
      </Card>

      {calendar.status === "DRAFT" ? (
        <ConfirmCalendarButton calendarId={calendar.id} unreviewed={unreviewed} />
      ) : (
        <Card className="border-emerald-400/20 bg-emerald-500/5">
          <p className="text-sm text-neutral-300">
            Confirmed — these dates feed the window planner. Editing any of them
            here changes future suggestions, so recalculate windows afterwards.
          </p>
          <Link
            href="/app/travel"
            className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
          >
            See travel windows →
          </Link>
        </Card>
      )}
    </div>
  );
}
