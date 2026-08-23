// The morning brief, and the conflict scan behind it.
//
// The brief is the product's daily promise: one message that answers "what
// does my family need me to do today" without anyone opening an app. It is
// composed here as STRUCTURE, not as a string — the same brief renders to
// Telegram text, to the Today page, and to a push notification, and building
// it as prose in one place and re-parsing it in another is how those three
// drift apart.
//
// Nothing in this file talks to a model. A language model rewriting the brief
// is a fine later addition (FinancialOS's explain.ts is the precedent: the
// rules decide, the model only rewrites the why) but the facts — who, when,
// where, leave by — are computed, never generated. A hallucinated pickup time
// is worse than no brief.
//
// Pure: no database, no clock.

import { describeMinutes, formatInstant, minutesBetween } from "@/lib/dayos/time";
import type { DeparturePlan } from "@/lib/dayos/leave";
import type { OriginResult } from "@/lib/dayos/origin";

export interface BriefOccurrence {
  id: string;
  activityName: string;
  /** The child or family member the activity is FOR. */
  subjectName: string | null;
  /** Who is doing it. Null means nobody is assigned yet. */
  responsibleId: string | null;
  responsibleName: string | null;
  startAt: Date;
  endAt: Date | null;
  placeLabel: string | null;
  travelRequired: boolean;
  plan: DeparturePlan | null;
  origin: OriginResult | null;
  requiresConfirmation: boolean;
  confirmed: boolean;
  /**
   * Why there is no departure plan, when there isn't one. "No travel estimate
   * yet" is true and useless; the reader needs to know whether that's a missing
   * address, a person outside the household, or just a trip nobody has priced.
   */
  travelNote?: string | null;
}

export type ConflictSeverity = "CLASH" | "TIGHT";

export interface Conflict {
  severity: ConflictSeverity;
  personId: string;
  personName: string;
  first: BriefOccurrence;
  second: BriefOccurrence;
  /** Minutes between the first ending and the second departure. Negative = overlap. */
  gapMinutes: number;
  message: string;
}

/** Below this, being in both places is possible but nothing may go wrong. */
export const TIGHT_GAP_MINUTES = 20;

/**
 * One person, two commitments they cannot both keep.
 *
 * The interval that matters is [leaveAt, endAt] — not [startAt, endAt]. A
 * 3:15 pickup with a 25-minute drive occupies the parent from 2:50, and a
 * 2:30 meeting that ends at 3:00 is already a clash even though the calendar
 * shows no overlap at all. Comparing event times alone is exactly the check a
 * calendar already does, and exactly the one that misses this.
 */
export function detectConflicts(occurrences: BriefOccurrence[]): Conflict[] {
  const byPerson = new Map<string, BriefOccurrence[]>();
  for (const occ of occurrences) {
    if (!occ.responsibleId) continue;
    const list = byPerson.get(occ.responsibleId) ?? [];
    list.push(occ);
    byPerson.set(occ.responsibleId, list);
  }

  const conflicts: Conflict[] = [];

  for (const [personId, list] of byPerson) {
    const sorted = [...list].sort(
      (a, b) => occupiedFrom(a).getTime() - occupiedFrom(b).getTime()
    );
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const first = sorted[i];
      const second = sorted[i + 1];
      const firstEnd = occupiedUntil(first);
      const secondStart = occupiedFrom(second);
      const gapMinutes = Math.round(minutesBetween(firstEnd, secondStart));

      if (gapMinutes >= TIGHT_GAP_MINUTES) continue;

      const personName = first.responsibleName ?? "Someone";
      const severity: ConflictSeverity = gapMinutes < 0 ? "CLASH" : "TIGHT";
      conflicts.push({
        severity,
        personId,
        personName,
        first,
        second,
        gapMinutes,
        message:
          severity === "CLASH"
            ? `${personName} is down for both ${labelOf(first)} and ${labelOf(second)} — they overlap by ${Math.abs(gapMinutes)} min.`
            : `${personName} has only ${gapMinutes} min between ${labelOf(first)} and leaving for ${labelOf(second)}.`,
      });
    }
  }

  return conflicts;
}

function labelOf(occ: BriefOccurrence): string {
  return occ.subjectName ? `${occ.subjectName}'s ${occ.activityName}` : occ.activityName;
}

/** When this commitment starts taking up the person's time. */
function occupiedFrom(occ: BriefOccurrence): Date {
  return occ.plan?.leaveAt ?? occ.startAt;
}

/** When they're free again. Falls back to the start when no end is known. */
function occupiedUntil(occ: BriefOccurrence): Date {
  return occ.endAt ?? occ.startAt;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export interface BriefLine {
  occurrenceId: string;
  clock: string;
  title: string;
  responsibleName: string | null;
  /** "leave 3:00 PM · 24 min drive from Work" */
  departureNote: string | null;
  needsConfirmation: boolean;
  unassigned: boolean;
}

export interface DailyBrief {
  dayLabel: string;
  greeting: string;
  lines: BriefLine[];
  conflicts: Conflict[];
  /** Responsibilities belonging to the person the brief is addressed to. */
  yours: BriefLine[];
  /** Things nobody has picked up. Surfaced first — this is the failure case. */
  unassigned: BriefLine[];
  /** The next departure of the day, if there is one. */
  nextDeparture: { occurrenceId: string; leaveClock: string; inWords: string } | null;
  isEmpty: boolean;
}

export interface BriefContext {
  recipientId: string;
  recipientFirstName: string;
  timeZone: string;
  now: Date;
  dayLabel: string;
}

export function composeBrief(
  occurrences: BriefOccurrence[],
  ctx: BriefContext
): DailyBrief {
  const sorted = [...occurrences].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const lines: BriefLine[] = sorted.map((occ) => ({
    occurrenceId: occ.id,
    clock: formatInstant(occ.startAt, ctx.timeZone),
    title: labelOf(occ),
    responsibleName: occ.responsibleName,
    departureNote: departureNote(occ, ctx.timeZone),
    needsConfirmation: occ.requiresConfirmation && !occ.confirmed,
    unassigned: !occ.responsibleId,
  }));

  const yours = lines.filter(
    (line, i) => sorted[i].responsibleId === ctx.recipientId
  );
  const unassigned = lines.filter((line) => line.unassigned);

  const upcoming = sorted
    .filter((occ) => occ.plan && occ.plan.leaveAt > ctx.now)
    .sort((a, b) => a.plan!.leaveAt.getTime() - b.plan!.leaveAt.getTime())[0];

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ctx.timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(ctx.now)
  );

  return {
    dayLabel: ctx.dayLabel,
    greeting:
      hour < 12
        ? `Good morning, ${ctx.recipientFirstName}.`
        : hour < 18
          ? `Good afternoon, ${ctx.recipientFirstName}.`
          : `Good evening, ${ctx.recipientFirstName}.`,
    lines,
    conflicts: detectConflicts(sorted),
    yours,
    unassigned,
    nextDeparture: upcoming
      ? {
          occurrenceId: upcoming.id,
          leaveClock: formatInstant(upcoming.plan!.leaveAt, ctx.timeZone),
          inWords: describeMinutes(minutesBetween(ctx.now, upcoming.plan!.leaveAt)),
        }
      : null,
    isEmpty: sorted.length === 0,
  };
}

function departureNote(occ: BriefOccurrence, timeZone: string): string | null {
  if (!occ.travelRequired) return null;
  if (!occ.plan) {
    if (occ.travelNote) return occ.travelNote;
    return occ.placeLabel
      ? `${occ.placeLabel} — not priced yet`
      : "No location on file, so no leave time";
  }
  const from = occ.origin?.place ? ` from ${occ.origin.place.label}` : "";
  const hedge = occ.origin && occ.origin.confidence !== "CHAINED" ? " (assumed)" : "";
  return `leave ${formatInstant(occ.plan.leaveAt, timeZone)} · ${occ.plan.travelMinutes} min drive${from}${hedge}`;
}

/** Render the structured brief as plain text for a chat channel. */
export function renderBriefText(brief: DailyBrief): string {
  if (brief.isEmpty) {
    return `${brief.greeting}\n\nNothing scheduled for ${brief.dayLabel}.`;
  }

  const out: string[] = [`${brief.greeting}`, "", `Here's ${brief.dayLabel}:`, ""];

  for (const line of brief.lines) {
    const who = line.unassigned
      ? "— nobody assigned"
      : line.responsibleName
        ? `— ${line.responsibleName}`
        : "";
    out.push(`${line.clock}  ${line.title} ${who}`.trimEnd());
    if (line.departureNote) out.push(`         ${line.departureNote}`);
  }

  if (brief.unassigned.length > 0) {
    out.push("", `Nobody is down for: ${brief.unassigned.map((l) => l.title).join(", ")}.`);
  }
  for (const conflict of brief.conflicts) {
    out.push("", conflict.message);
  }
  if (brief.nextDeparture) {
    out.push(
      "",
      `First departure is ${brief.nextDeparture.leaveClock} (${brief.nextDeparture.inWords}). I'll watch traffic and say when to drive.`
    );
  }

  return out.join("\n");
}
