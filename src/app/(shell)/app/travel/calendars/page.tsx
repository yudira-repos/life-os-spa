import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requireTravelAccess } from "@/lib/travelos/authz";
import { CalendarUpload } from "@/components/travelos/CalendarUpload";
import { extractionConfigured } from "@/lib/travelos/calendar/extract";
import { formatDayWithYear } from "@/lib/travelos/dates";

export default async function CalendarsPage() {
  const access = await requireTravelAccess();
  if (!access.ok) return null;
  const { household, canPlan } = access;

  const [calendars, children] = await Promise.all([
    db.schoolCalendar.findMany({
      where: { householdId: household.id },
      include: {
        entries: { select: { id: true, confirmed: true } },
        children: { include: { child: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.householdMember.findMany({
      where: { householdId: household.id, role: "CHILD" },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {calendars.length > 0 && (
        <section className="flex flex-col gap-3">
          {calendars.map((calendar) => {
            const unreviewed = calendar.entries.filter((e) => !e.confirmed).length;
            const kids = calendar.children.map((link) => link.child.name).join(", ");

            return (
              <Card key={calendar.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {calendar.name}
                      {calendar.status === "CONFIRMED" ? (
                        <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                          Confirmed
                        </span>
                      ) : (
                        <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                          Needs review
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {kids || "No children linked"} · {calendar.entries.length} dates
                      {unreviewed > 0 && ` · ${unreviewed} to check`}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      From {calendar.sourceFileName ?? calendar.sourceType}
                      {calendar.schoolYearStart &&
                        ` · school year starts ${formatDayWithYear(calendar.schoolYearStart)}`}
                    </p>
                  </div>
                  {canPlan && (
                    <Link
                      href={`/app/travel/calendars/${calendar.id}`}
                      className="text-sm text-indigo-300 underline underline-offset-2"
                    >
                      {calendar.status === "CONFIRMED" ? "View dates" : "Review dates"} →
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </section>
      )}

      {canPlan && (
        <CalendarUpload kids={children} extractionAvailable={extractionConfigured()} />
      )}

      <Card className="border-white/5 bg-transparent">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          What happens to the file
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
          <li>
            The file is read once and discarded. We keep the extracted dates and
            the file&apos;s name — not the document, which usually carries a
            child&apos;s school and daily schedule.
          </li>
          <li>
            Dates read from a PDF or photo arrive unconfirmed, with a confidence
            score, and can&apos;t be used for planning until reviewed.
          </li>
          <li>
            Editing a date marks it as yours, so it&apos;s clear later which
            dates a person checked.
          </li>
        </ul>
      </Card>
    </div>
  );
}
