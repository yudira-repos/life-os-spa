import { db } from "@/lib/db";
import { addDays, dayKey, startOfDay } from "@/lib/travelos/dates";
import {
  parseWeekdays,
  expandOccurrences,
  type Weekday,
} from "@/lib/dayos/recurrence";
import {
  occurrenceIndexFor,
  resolveAssignment,
  type AssignmentOverride as EngineOverride,
  type Rotation as EngineRotation,
} from "@/lib/dayos/rotation";
import {
  computeDeparture,
  solveDeparture,
  type DeparturePlan,
} from "@/lib/dayos/leave";
import { resolveOrigin, type OriginResult, type PlaceRef } from "@/lib/dayos/origin";
import {
  composeBrief,
  type BriefOccurrence,
  type DailyBrief,
} from "@/lib/dayos/brief";
import {
  estimateTravel,
  type RoutePoint,
  type TravelEstimateResult,
} from "@/lib/dayos/routing";
import { noSchoolDays, tripDaysAway } from "@/lib/dayos/integrations";
import { todayIn, zonedTimeToUtc, zonedMinuteOfDay, weekdayIndex } from "@/lib/dayos/time";

// Database orchestration. Every engine in this module (time, recurrence,
// rotation, leave, origin, brief, escalation) is pure and database-free so it
// can be verified with a hand-written household; this is the one file where
// they meet Prisma.
//
// The central operation is materializeDay(): expand the household's active
// activities into ActivityOccurrence rows for one calendar day. It is
// idempotent and re-runnable, and it treats a human decision as sacred — the
// two things it will never overwrite are:
//
//   1. a confirmation state that a person has answered
//   2. a responsible person that was set by hand (assignmentSource MANUAL)
//
// Everything else — the resolved instant, the roster's answer, the travel
// estimate — is recomputed, because those are derivations and should track
// their inputs.

export interface DayContext {
  householdId: string;
  timeZone: string;
  arrivalBufferMinutes: number;
  prepMinutes: number;
}

export async function dayContext(householdId: string): Promise<DayContext> {
  const prefs = await db.dayPreferences.upsert({
    where: { householdId },
    create: { householdId },
    update: {},
  });
  return {
    householdId,
    timeZone: prefs.timeZone,
    arrivalBufferMinutes: prefs.defaultArrivalBufferMinutes,
    prepMinutes: prefs.defaultPrepMinutes,
  };
}

/** "member:abc" / "contact:def" — one namespace for both kinds of assignee. */
export function assigneeKey(memberId: string | null, contactId: string | null): string | null {
  if (memberId) return `member:${memberId}`;
  if (contactId) return `contact:${contactId}`;
  return null;
}

export function splitAssigneeKey(key: string | null): {
  memberId: string | null;
  contactId: string | null;
} {
  if (!key) return { memberId: null, contactId: null };
  const [kind, id] = key.split(":");
  return {
    memberId: kind === "member" ? id : null,
    contactId: kind === "contact" ? id : null,
  };
}

// ---------------------------------------------------------------------------
// Materializing a day
// ---------------------------------------------------------------------------

export interface MaterializeResult {
  day: string;
  created: number;
  updated: number;
  skippedAway: boolean;
  unassigned: number;
}

export async function materializeDay(
  householdId: string,
  day: Date
): Promise<MaterializeResult> {
  const ctx = await dayContext(householdId);
  const target = startOfDay(day);

  const away = await tripDaysAway(householdId, target, target);
  if (away.length > 0) {
    // The family is on a confirmed trip. Cancel rather than delete, so the
    // record of what would have happened survives.
    await db.activityOccurrence.updateMany({
      where: { householdId, day: target, status: "PLANNED" },
      data: { status: "CANCELLED", notes: "Household is away on a confirmed trip." },
    });
    return { day: dayKey(target), created: 0, updated: 0, skippedAway: true, unassigned: 0 };
  }

  const activities = await db.activity.findMany({
    where: {
      householdId,
      status: "ACTIVE",
      // `lt: target + 1 day` rather than `lte: target`: rows written before
      // effectiveFrom was normalized carry a time-of-day component, and an
      // activity that became effective at 3pm today is effective today.
      effectiveFrom: { lt: addDays(target, 1) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: target } }],
    },
    include: {
      skips: true,
      rotation: { include: { slots: true, overrides: true } },
    },
  });

  const noSchool = await noSchoolDays(householdId, target, target);

  let created = 0;
  let updated = 0;
  let unassigned = 0;

  for (const activity of activities) {
    const weekdays = parseWeekdays(activity.weekdays);
    const recurrence = {
      weekdays,
      effectiveFrom: startOfDay(activity.effectiveFrom),
      effectiveTo: activity.effectiveTo ? startOfDay(activity.effectiveTo) : null,
      skipDays: activity.skips.map((s) => startOfDay(s.day)),
      schoolDaysOnly: activity.schoolDaysOnly,
      noSchoolDays: noSchool,
    };

    if (expandOccurrences(recurrence, target, target).length === 0) continue;

    const startAt = zonedTimeToUtc(target, activity.startMinute, ctx.timeZone);
    const endAt = activity.durationMinutes
      ? new Date(startAt.getTime() + activity.durationMinutes * 60_000)
      : null;

    const assignment = await resolveResponsible(activity, recurrence, target);
    if (!assignment.key) unassigned += 1;
    const { memberId, contactId } = splitAssigneeKey(assignment.key);

    const existing = await db.activityOccurrence.findUnique({
      where: { activityId_day: { activityId: activity.id, day: target } },
    });

    if (!existing) {
      await db.activityOccurrence.create({
        data: {
          householdId,
          activityId: activity.id,
          day: target,
          startAt,
          endAt,
          responsibleMemberId: memberId,
          responsibleContactId: contactId,
          assignmentSource: assignment.source,
          confirmationState: activity.requiresConfirmation ? "PENDING" : "NOT_REQUIRED",
        },
      });
      created += 1;
      continue;
    }

    // A hand-set responsible person and an answered confirmation are human
    // decisions. Recomputation must not touch either.
    const keepAssignment =
      existing.assignmentSource === "MANUAL" ||
      existing.confirmationState === "CONFIRMED" ||
      existing.confirmationState === "REASSIGNED";

    await db.activityOccurrence.update({
      where: { id: existing.id },
      data: {
        startAt,
        endAt,
        ...(keepAssignment
          ? {}
          : {
              responsibleMemberId: memberId,
              responsibleContactId: contactId,
              assignmentSource: assignment.source,
            }),
      },
    });
    updated += 1;
  }

  return { day: dayKey(target), created, updated, skippedAway: false, unassigned };
}

type ActivityWithRotation = Awaited<ReturnType<typeof loadActivityShape>>;
async function loadActivityShape() {
  return db.activity.findFirstOrThrow({
    include: { skips: true, rotation: { include: { slots: true, overrides: true } } },
  });
}

async function resolveResponsible(
  activity: ActivityWithRotation,
  recurrence: Parameters<typeof expandOccurrences>[0],
  day: Date
): Promise<{ key: string | null; source: string }> {
  if (!activity.rotation) {
    const key = assigneeKey(activity.defaultResponsibleMemberId, null);
    return { key, source: key ? "DEFAULT" : "UNASSIGNED" };
  }

  const rotation = activity.rotation;

  // The round-robin index has to be counted over the SAME occurrence list
  // every time or the rota drifts. Count from the rotation's anchor.
  const anchor = startOfDay(rotation.anchorDay);
  const occurrenceDays =
    rotation.kind === "ROUND_ROBIN"
      ? expandOccurrences(
          { ...recurrence, effectiveFrom: maxDate(recurrence.effectiveFrom, anchor) },
          maxDate(recurrence.effectiveFrom, anchor),
          day
        ).map((o) => o.day)
      : [];

  const engineRotation: EngineRotation = {
    id: rotation.id,
    kind: rotation.kind === "ROUND_ROBIN" ? "ROUND_ROBIN" : "FIXED_WEEKDAY",
    anchorDay: anchor,
    slots: rotation.slots.map((slot) => ({
      weekday: slot.weekday == null ? undefined : (slot.weekday as Weekday),
      orderIndex: slot.orderIndex,
      assigneeId: assigneeKey(slot.memberId, slot.contactId) ?? `slot:${slot.id}`,
    })),
  };

  const overrides: EngineOverride[] = rotation.overrides
    .filter((o) => dayKey(o.day) === dayKey(day))
    .map((o): EngineOverride => ({
      day: startOfDay(o.day),
      assigneeId: assigneeKey(o.assigneeMemberId, o.assigneeContactId) ?? "",
      kind: o.kind === "SWAP" ? "SWAP" : "COVER",
      swappedWithDay: o.swappedWithDay ? startOfDay(o.swappedWithDay) : undefined,
      replacedAssigneeId:
        assigneeKey(o.replacedMemberId, o.replacedContactId) ?? undefined,
      note: o.note ?? undefined,
    }))
    .filter((o) => o.assigneeId.length > 0);

  const index = occurrenceIndexFor(occurrenceDays, day);
  const resolved = resolveAssignment(engineRotation, day, index, overrides);

  return {
    key: resolved.assigneeId,
    source: resolved.source,
  };
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

// ---------------------------------------------------------------------------
// Departure planning
// ---------------------------------------------------------------------------

export interface RefreshResult {
  planned: number;
  skippedNoPlace: number;
  estimates: { occurrenceId: string; minutes: number; quality: string }[];
}

/**
 * Recompute leave times for a day's occurrences that need travel.
 *
 * Ordered by start time, because the origin of the second trip depends on
 * where the first one leaves you — see origin.ts. Computing them out of order
 * produces a plan that routes a parent home between two commitments they never
 * went home between.
 */
export async function refreshDepartures(
  householdId: string,
  day: Date,
  now: Date = new Date()
): Promise<RefreshResult> {
  const ctx = await dayContext(householdId);
  const target = startOfDay(day);

  const occurrences = await db.activityOccurrence.findMany({
    where: { householdId, day: target, status: "PLANNED" },
    orderBy: { startAt: "asc" },
    include: {
      activity: { include: { place: true, originPlace: true } },
      responsibleMember: { include: { dayProfile: { include: { homePlace: true, workPlace: true } } } },
    },
  });

  const result: RefreshResult = { planned: 0, skippedNoPlace: 0, estimates: [] };

  // Prior commitments per person, built up as we walk the day forward.
  const priorByPerson = new Map<string, { id: string; place: PlaceRef; endsAt: Date }[]>();

  for (const occ of occurrences) {
    const destination = occ.activity.place;
    const personKey = assigneeKey(occ.responsibleMemberId, occ.responsibleContactId);

    if (!occ.activity.travelRequired || !destination) {
      if (personKey && destination) {
        pushPrior(priorByPerson, personKey, {
          id: occ.id,
          place: toPlaceRef(destination),
          endsAt: occ.endAt ?? occ.startAt,
        });
      }
      if (occ.activity.travelRequired && !destination) result.skippedNoPlace += 1;
      continue;
    }

    const profile = occ.responsibleMember?.dayProfile ?? null;
    const homePlace = profile?.homePlace ? toPlaceRef(profile.homePlace) : null;
    const workPlace = profile?.workPlace ? toPlaceRef(profile.workPlace) : null;

    const arrivalBuffer =
      (occ.activity.arrivalBufferMinutes ?? ctx.arrivalBufferMinutes) +
      destination.parkingBufferMinutes;
    const prep = occ.activity.prepMinutes ?? ctx.prepMinutes;

    // A first pass with no travel time, purely to get a departure ballpark the
    // origin inference can reason about.
    const seed = computeDeparture({
      eventStartAt: occ.startAt,
      travelMinutes: 0,
      arrivalBufferMinutes: arrivalBuffer,
      prepMinutes: prep,
      now,
    });

    const origin: OriginResult = occ.activity.originPlace
      ? {
          place: toPlaceRef(occ.activity.originPlace),
          confidence: "CHAINED",
          explanation: `Leaving from ${occ.activity.originPlace.label} — pinned on this activity.`,
        }
      : resolveOrigin({
          leaveAt: seed.leaveAt,
          leaveWeekday: weekdayIndex(target),
          leaveMinuteOfDay: zonedMinuteOfDay(seed.leaveAt, ctx.timeZone),
          priorCommitments: personKey ? (priorByPerson.get(personKey) ?? []) : [],
          homePlace,
          workPlace,
          workingHours: profile
            ? {
                weekdays: parseWeekdays(profile.workWeekdays),
                startMinute: profile.workStartMinute,
                endMinute: profile.workEndMinute,
              }
            : null,
        });

    if (!origin.place) {
      await db.activityOccurrence.update({
        where: { id: occ.id },
        data: { originConfidence: origin.confidence, travelMinutes: null, leaveAt: null },
      });
      result.skippedNoPlace += 1;
      continue;
    }

    let lastEstimate: TravelEstimateResult | null = null;
    const originPoint: RoutePoint = {
      key: origin.place.id.startsWith("addr:") ? origin.place.id : origin.place.id,
      address: origin.place.address,
    };
    const destinationPoint: RoutePoint = {
      key: destination.id,
      address: destination.address,
    };

    // solveDeparture wants a synchronous estimator, and the routing cache is
    // async. Pre-warming the two buckets the solver can ask about keeps the
    // engine pure and the number of provider calls bounded and visible.
    const warmed = await warmEstimates(
      householdId,
      originPoint,
      destinationPoint,
      occ.startAt,
      arrivalBuffer,
      ctx.timeZone
    );
    lastEstimate = warmed.primary;

    const plan: DeparturePlan = solveDeparture(
      {
        eventStartAt: occ.startAt,
        arrivalBufferMinutes: arrivalBuffer,
        prepMinutes: prep,
        now,
      },
      (departAt) => warmed.lookup(departAt)
    );

    await db.activityOccurrence.update({
      where: { id: occ.id },
      data: {
        originPlaceId: origin.place.id.startsWith("addr:") ? null : origin.place.id,
        originConfidence: origin.confidence,
        travelMinutes: plan.travelMinutes,
        leaveAt: plan.leaveAt,
        arriveBy: plan.arriveBy,
        estimateComputedAt: now,
        estimateConverged: true,
        phase: plan.phase,
      },
    });

    result.planned += 1;
    result.estimates.push({
      occurrenceId: occ.id,
      minutes: plan.travelMinutes,
      quality: lastEstimate?.quality ?? "MOCK",
    });

    if (personKey) {
      pushPrior(priorByPerson, personKey, {
        id: occ.id,
        place: toPlaceRef(destination),
        endsAt: occ.endAt ?? occ.startAt,
      });
    }
  }

  return result;
}

/**
 * Price the one or two departure buckets the solver can land in, then hand the
 * engine a synchronous lookup over them. Two calls is the ceiling per
 * occurrence per refresh, whatever the traffic curve does.
 */
async function warmEstimates(
  householdId: string,
  origin: RoutePoint,
  destination: RoutePoint,
  eventStartAt: Date,
  arrivalBuffer: number,
  timeZone: string
): Promise<{
  primary: TravelEstimateResult;
  lookup: (departAt: Date) => number;
}> {
  const seedDepart = new Date(eventStartAt.getTime() - arrivalBuffer * 60_000);
  const first = await estimateTravel(householdId, origin, destination, seedDepart, timeZone);

  const refinedDepart = new Date(seedDepart.getTime() - first.minutes * 60_000);
  const second = await estimateTravel(
    householdId,
    origin,
    destination,
    refinedDepart,
    timeZone
  );

  return {
    primary: second,
    lookup: (departAt: Date) =>
      departAt.getTime() >= seedDepart.getTime() - 60_000 ? first.minutes : second.minutes,
  };
}

function pushPrior(
  map: Map<string, { id: string; place: PlaceRef; endsAt: Date }[]>,
  key: string,
  entry: { id: string; place: PlaceRef; endsAt: Date }
) {
  const list = map.get(key) ?? [];
  list.push(entry);
  map.set(key, list);
}

function toPlaceRef(place: { id: string; label: string; address: string }): PlaceRef {
  return { id: place.id, label: place.label, address: place.address };
}

// ---------------------------------------------------------------------------
// Reading a day
// ---------------------------------------------------------------------------

/**
 * Rebuild a DeparturePlan from what was actually stored for an occurrence.
 *
 * Every message about a trip has to quote the SAME leave time, and the only way
 * to guarantee that is to derive it from the stored plan rather than recompute
 * it from the activity. Recomputing looks equivalent and isn't: the arrival
 * buffer that produced `leaveAt` is the activity's buffer PLUS the destination's
 * parking buffer, and a caller that reaches for `activity.arrivalBufferMinutes`
 * silently drops the second half. That shipped once and produced a morning
 * brief and a departure reminder eight minutes apart for the same school run,
 * which is precisely the kind of thing that makes someone stop trusting all of
 * it.
 *
 * Returns null when the occurrence has never been priced.
 */
export function planFromOccurrence(
  occurrence: {
    startAt: Date;
    arriveBy: Date | null;
    leaveAt: Date | null;
    travelMinutes: number | null;
  },
  ctx: { arrivalBufferMinutes: number; prepMinutes: number },
  activityPrepMinutes: number | null,
  now: Date
): DeparturePlan | null {
  if (!occurrence.leaveAt || occurrence.travelMinutes == null) return null;

  // The buffer that was actually applied, read back off the stored arrival.
  const arrivalBufferMinutes = occurrence.arriveBy
    ? Math.round(
        (occurrence.startAt.getTime() - occurrence.arriveBy.getTime()) / 60_000
      )
    : ctx.arrivalBufferMinutes;

  return computeDeparture({
    eventStartAt: occurrence.startAt,
    travelMinutes: occurrence.travelMinutes,
    arrivalBufferMinutes,
    prepMinutes: activityPrepMinutes ?? ctx.prepMinutes,
    now,
  });
}

export async function occurrencesForDay(householdId: string, day: Date) {
  return db.activityOccurrence.findMany({
    where: { householdId, day: startOfDay(day) },
    orderBy: { startAt: "asc" },
    include: {
      activity: { include: { place: true, subjectMember: true } },
      responsibleMember: true,
      responsibleContact: true,
      originPlace: true,
    },
  });
}

export async function briefFor(
  householdId: string,
  recipientMemberId: string,
  recipientFirstName: string,
  day: Date,
  now: Date = new Date()
): Promise<DailyBrief> {
  const ctx = await dayContext(householdId);
  const rows = await occurrencesForDay(householdId, day);

  const occurrences: BriefOccurrence[] = rows
    .filter((row) => row.status === "PLANNED")
    .map((row) => ({
      id: row.id,
      activityName: row.activity.name,
      subjectName: row.activity.subjectMember?.name ?? null,
      responsibleId: assigneeKey(row.responsibleMemberId, row.responsibleContactId),
      responsibleName:
        row.responsibleMember?.name ?? row.responsibleContact?.name ?? null,
      startAt: row.startAt,
      endAt: row.endAt,
      placeLabel: row.activity.place?.label ?? null,
      travelRequired: row.activity.travelRequired,
      plan: planFromOccurrence(row, ctx, row.activity.prepMinutes, now),
      origin: row.originPlace
        ? {
            place: toPlaceRef(row.originPlace),
            confidence:
              (row.originConfidence as OriginResult["confidence"]) ?? "DEFAULT",
            explanation: "",
          }
        : null,
      requiresConfirmation: row.activity.requiresConfirmation,
      confirmed: row.confirmationState === "CONFIRMED",
      travelNote: travelNoteFor(row),
    }));

  return composeBrief(occurrences, {
    recipientId: `member:${recipientMemberId}`,
    recipientFirstName,
    timeZone: ctx.timeZone,
    now,
    dayLabel: labelForDay(startOfDay(day), todayIn(ctx.timeZone, now)),
  });
}

/**
 * Why a trip has no leave time. Each of these is a different thing for the
 * reader to do about it, so they get different words.
 */
function travelNoteFor(row: {
  leaveAt: Date | null;
  travelMinutes: number | null;
  responsibleContactId: string | null;
  responsibleMemberId: string | null;
  originConfidence: string | null;
  activity: { travelRequired: boolean; place: { label: string } | null };
}): string | null {
  if (!row.activity.travelRequired) return null;
  if (row.leaveAt && row.travelMinutes != null) return null;

  if (!row.activity.place) return "No location on this activity, so no leave time";
  if (row.responsibleContactId) {
    return `${row.activity.place.label} — driven by someone outside the household, so there's no starting point to time`;
  }
  if (!row.responsibleMemberId) {
    return `${row.activity.place.label} — nobody assigned, so there's nobody to time`;
  }
  if (row.originConfidence === "DEFAULT") {
    return `${row.activity.place.label} — no home address on file for the driver`;
  }
  return `${row.activity.place.label} — not priced yet`;
}

function labelForDay(day: Date, today: Date): string {
  if (dayKey(day) === dayKey(today)) return "today";
  if (dayKey(day) === dayKey(addDays(today, 1))) return "tomorrow";
  return day.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Writes a person makes
// ---------------------------------------------------------------------------

export async function setConfirmation(
  occurrenceId: string,
  state: "CONFIRMED" | "DECLINED",
  note?: string
) {
  return db.activityOccurrence.update({
    where: { id: occurrenceId },
    data: {
      confirmationState: state,
      confirmedAt: state === "CONFIRMED" ? new Date() : null,
      notes: note ?? undefined,
    },
  });
}

/**
 * Reassign one occurrence by hand. Marked MANUAL so no later recomputation
 * silently puts the rota's answer back — the most confusing thing this module
 * could do is quietly undo a change a person just made.
 */
export async function reassignOccurrence(
  occurrenceId: string,
  assigneeKeyValue: string | null
) {
  const { memberId, contactId } = splitAssigneeKey(assigneeKeyValue);
  return db.activityOccurrence.update({
    where: { id: occurrenceId },
    data: {
      responsibleMemberId: memberId,
      responsibleContactId: contactId,
      assignmentSource: assigneeKeyValue ? "MANUAL" : "UNASSIGNED",
      confirmationState: "REASSIGNED",
    },
  });
}

/** Materialize and plan a window of days in one go. Used by the tick and by setup. */
export async function planWindow(
  householdId: string,
  from: Date,
  days: number,
  now: Date = new Date()
) {
  const out: MaterializeResult[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = addDays(startOfDay(from), i);
    out.push(await materializeDay(householdId, day));
  }
  // Departures are only worth computing for today and tomorrow — traffic
  // estimates for next Thursday are noise, and each one costs a provider call.
  await refreshDepartures(householdId, startOfDay(from), now);
  if (days > 1) {
    await refreshDepartures(householdId, addDays(startOfDay(from), 1), now);
  }
  return out;
}
