import Link from "next/link";
import { clsx } from "clsx";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requireDayAccess } from "@/lib/dayos/authz";
import {
  briefFor,
  dayContext,
  occurrencesForDay,
  assigneeKey,
  materializeDay,
  refreshDepartures,
} from "@/lib/dayos/service";
import {
  todayIn,
  formatInstant,
  describeMinutes,
  minutesBetween,
  zonedWeekday,
  formatClock,
} from "@/lib/dayos/time";
import { parseWeekdays, describeWeekdays } from "@/lib/dayos/recurrence";
import { routingEnabled } from "@/lib/dayos/routing";
import { isAutomatable } from "@/lib/dayos/notify";
import {
  ConfirmButtons,
  ReassignControl,
  RecalculateButton,
} from "@/components/dayos/OccurrenceActions";

export default async function TodayPage() {
  const access = await requireDayAccess();
  if (!access.ok) return null;
  const { household, member, canCoordinate } = access;

  const ctx = await dayContext(household.id);
  const now = new Date();
  const today = todayIn(ctx.timeZone, now);

  // Build today's occurrences before reading them.
  //
  // This page used to only READ occurrences, so a household that had just added
  // its activities saw the empty state until somebody happened to press
  // "Recalculate the week" — the one button the empty state tells you about but
  // does not explain you MUST press. materializeDay is idempotent and never
  // overwrites a human decision (see service.ts), so running it on load is safe.
  //
  // Departures are only re-priced when something new was actually created:
  // refreshDepartures can call the routing provider, and paying for that on
  // every render of a page a family opens ten times a morning is not worth it.
  // The explicit button stays for "traffic changed, price it again".
  try {
    const materialized = await materializeDay(household.id, today);
    if (materialized.created > 0) {
      await refreshDepartures(household.id, today, now);
    }
  } catch (error) {
    // A planning failure must not blank the day. Whatever is already in the
    // database still renders, and the button offers an explicit retry.
    console.error("[dayos] auto-materialize failed for today", error);
  }

  const [rows, brief, members, contacts, prefs] = await Promise.all([
    occurrencesForDay(household.id, today),
    briefFor(household.id, member.id, member.name.split(" ")[0] ?? member.name, today, now),
    db.householdMember.findMany({
      where: { householdId: household.id },
      include: { channels: true },
      orderBy: { name: "asc" },
    }),
    db.externalContact.findMany({
      where: { householdId: household.id },
      orderBy: { name: "asc" },
    }),
    db.dayPreferences.findUnique({ where: { householdId: household.id } }),
  ]);

  const planned = rows.filter((row) => row.status === "PLANNED");

  if (planned.length === 0) {
    // "Nothing today" has two completely different causes, and telling them
    // apart is the difference between a useful page and a dead end. An empty
    // household needs to add an activity; a household whose activities are all
    // Mon-Fri, looking at this on a Saturday, needs to be told that — otherwise
    // it reads as the module being broken.
    const active = await db.activity.findMany({
      where: { householdId: household.id, status: "ACTIVE" },
      orderBy: { startMinute: "asc" },
      include: { subjectMember: true },
    });

    if (active.length > 0) {
      const cancelled = rows.filter((row) => row.status === "CANCELLED");
      return (
        <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tracking-tight">{brief.greeting}</p>
              <p className="mt-1 text-sm text-neutral-400">
                Nothing is scheduled for {zonedWeekday(now, ctx.timeZone, true)}.
              </p>
            </div>
            {canCoordinate && <RecalculateButton />}
          </div>

          {cancelled.length > 0 && (
            <Card className="border-amber-400/20 bg-amber-500/5">
              <p className="text-sm text-neutral-300">
                {cancelled.length} thing{cancelled.length === 1 ? " was" : "s were"}{" "}
                cancelled for today. {cancelled[0].notes ?? ""}
              </p>
            </Card>
          )}

          <Card>
            <p className="text-sm font-medium">
              Your {active.length} activit{active.length === 1 ? "y runs" : "ies run"} on
              other days
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-neutral-400">
              {active.map((activity) => (
                <li key={activity.id}>
                  <span className="text-neutral-300">
                    {activity.subjectMember
                      ? `${activity.subjectMember.name}'s ${activity.name}`
                      : activity.name}
                  </span>{" "}
                  · {describeWeekdays(parseWeekdays(activity.weekdays))} ·{" "}
                  <span className="tabular-nums">
                    {formatClock(activity.startMinute)}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/app/day/activities"
              className="mt-4 inline-block text-sm text-indigo-300 underline underline-offset-2"
            >
              Edit which days these run →
            </Link>
          </Card>
        </div>
      );
    }

    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
        <Card className="border-indigo-400/20 bg-indigo-500/5">
          <p className="font-semibold">Start with one activity.</p>
          <p className="mt-2 text-sm text-neutral-400">
            DayOS turns the things that repeat — the school run, dance on
            Tuesdays, the Wednesday carpool — into a plan that knows who is
            responsible and when they need to leave.
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            Add the school pickup first. It&apos;s the one with the highest cost
            of being forgotten, and everything else in the module gets easier
            once one activity exists to hang it on.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/app/day/activities"
              className="text-sm text-indigo-300 underline underline-offset-2"
            >
              Add an activity →
            </Link>
            <RecalculateButton />
          </div>
        </Card>
      </div>
    );
  }

  const assigneeOptions = [
    ...members.map((m) => ({ key: `member:${m.id}`, name: m.name, external: false })),
    ...contacts.map((c) => ({ key: `contact:${c.id}`, name: c.name, external: true })),
  ];

  // People who are down for something today but have no way to be reached.
  // Surfaced at the top rather than discovered when a reminder silently fails.
  const unreachable = members.filter((m) => {
    const responsibleToday = planned.some((row) => row.responsibleMemberId === m.id);
    if (!responsibleToday) return false;
    return !m.channels.some((c) => isAutomatable(c.channel));
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight">{brief.greeting}</p>
          <p className="mt-1 text-sm text-neutral-400">
            {planned.length} thing{planned.length === 1 ? "" : "s"} on today
            {brief.nextDeparture
              ? ` · first departure ${brief.nextDeparture.leaveClock} (${brief.nextDeparture.inWords})`
              : ""}
          </p>
        </div>
        {canCoordinate && <RecalculateButton />}
      </div>

      {brief.conflicts.length > 0 && (
        <Card className="border-red-400/20 bg-red-500/5">
          <p className="text-sm font-semibold text-red-300">
            {brief.conflicts.length === 1 ? "One clash" : `${brief.conflicts.length} clashes`} today
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-neutral-300">
            {brief.conflicts.map((conflict, i) => (
              <li key={i}>{conflict.message}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">
            Counted from when each trip has to leave, not from when the event
            starts — which is why a calendar shows these as fine.
          </p>
        </Card>
      )}

      {brief.unassigned.length > 0 && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <p className="text-sm text-neutral-300">
            Nobody is down for {brief.unassigned.map((l) => l.title).join(", ")}.
          </p>
        </Card>
      )}

      {unreachable.length > 0 && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <p className="text-sm text-neutral-300">
            {unreachable.map((m) => m.name).join(", ")}{" "}
            {unreachable.length === 1 ? "is" : "are"} responsible for something
            today but {unreachable.length === 1 ? "has" : "have"} no channel
            LifeOS can send to. Reminders will only appear in the app.
          </p>
          <Link
            href="/settings"
            className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
          >
            Add a channel →
          </Link>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {planned.map((row) => {
          const responsibleName =
            row.responsibleMember?.name ?? row.responsibleContact?.name ?? null;
          const isYours = row.responsibleMemberId === member.id;
          const title = row.activity.subjectMember
            ? `${row.activity.subjectMember.name}'s ${row.activity.name}`
            : row.activity.name;

          return (
            <Card
              key={row.id}
              className={clsx(
                "flex flex-col gap-3",
                isYours && "border-indigo-400/25 bg-indigo-500/[0.06]"
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">
                    <span className="tabular-nums text-neutral-400">
                      {formatInstant(row.startAt, ctx.timeZone)}
                    </span>{" "}
                    {title}
                  </p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {responsibleName ?? "Nobody assigned"}
                    {row.activity.place ? ` · ${row.activity.place.label}` : ""}
                  </p>
                </div>
                <ConfirmButtons
                  occurrenceId={row.id}
                  state={row.confirmationState}
                  canRespond={
                    row.activity.requiresConfirmation && (isYours || canCoordinate)
                  }
                />
              </div>

              {row.activity.travelRequired && (
                <div className="rounded-xl bg-black/20 px-3 py-2 text-sm">
                  {row.leaveAt && row.travelMinutes != null ? (
                    <>
                      <span className="text-neutral-200">
                        Leave {formatInstant(row.leaveAt, ctx.timeZone)}
                      </span>
                      <span className="text-neutral-500">
                        {" "}
                        · {row.travelMinutes} min drive
                        {row.originPlace ? ` from ${row.originPlace.label}` : ""}
                        {row.originConfidence && row.originConfidence !== "CHAINED"
                          ? " (assumed starting point)"
                          : ""}
                      </span>
                      <span
                        className={clsx(
                          "ml-2 text-xs",
                          minutesBetween(now, row.leaveAt) < 0
                            ? "text-red-400"
                            : minutesBetween(now, row.leaveAt) < 20
                              ? "text-amber-300"
                              : "text-neutral-600"
                        )}
                      >
                        {describeMinutes(minutesBetween(now, row.leaveAt))}
                      </span>
                    </>
                  ) : (
                    <span className="text-neutral-500">
                      {row.activity.place
                        ? "No travel estimate yet — recalculate to price this trip."
                        : "No location on this activity, so there's no leave time."}
                    </span>
                  )}
                </div>
              )}

              {canCoordinate && (
                <ReassignControl
                  occurrenceId={row.id}
                  current={assigneeKey(row.responsibleMemberId, row.responsibleContactId)}
                  options={assigneeOptions}
                />
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-neutral-600">
        {routingEnabled()
          ? "Travel times are live, re-checked as each departure gets close."
          : "Travel times are estimates — no routing key is configured, so every drive is assumed to take about 20 minutes."}
        {prefs?.proactiveEnabled
          ? " Reminders are on."
          : " Proactive reminders are off; turn them on in settings to get the morning brief and departure alerts."}
      </p>
    </div>
  );
}
