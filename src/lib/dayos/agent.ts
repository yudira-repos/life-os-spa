import { db } from "@/lib/db";
import { startOfDay } from "@/lib/travelos/dates";
import {
  computeDeparture,
  departureMessage,
  retimeMessage,
  shouldRetimeAlert,
  type DeparturePlan,
} from "@/lib/dayos/leave";
import {
  escalationMessage,
  nextEscalationStep,
  type EscalationRung,
} from "@/lib/dayos/escalation";
import { renderBriefText } from "@/lib/dayos/brief";
import {
  formatInstant,
  minutesBetween,
  todayIn,
  zonedMinuteOfDay,
} from "@/lib/dayos/time";
import { sendOnce, type DispatchKind, type Recipient, type Channel } from "@/lib/dayos/notify";
import {
  briefFor,
  dayContext,
  materializeDay,
  planFromOccurrence,
  refreshDepartures,
} from "@/lib/dayos/service";

// The proactive loop.
//
// This is the part of DayOS that runs when nobody is looking at the app, and
// therefore the part with the most ways to be annoying. Three rules keep it
// honest, and all three are enforced here rather than left to the caller:
//
//   1. IT IS OPT-IN. `proactiveEnabled` defaults to false. A household
//      discovers this feature by turning it on, never by being messaged at
//      6:55 AM by software they were still evaluating.
//   2. EVERY SEND IS IDEMPOTENT. Nothing here tracks what it has done in
//      memory. The NotificationDispatch unique key is the only source of
//      truth about whether a message went out, so running the tick twice in
//      the same minute — which a cron and a retry will do — sends nothing
//      twice.
//   3. IT ONLY LOOKS AT THE NEXT FEW HOURS. Departures more than
//      LOOKAHEAD_MINUTES away are not re-priced, because a routing estimate
//      for tonight taken this morning is worth nothing and costs money.
//
// The tick is deliberately a plain async function rather than a job framework.
// It is called from a route the platform's scheduler hits every few minutes,
// which is the smallest thing that works on Railway today and the right seam
// for a real queue later.

/** Departures further out than this are left alone until a later tick. */
export const LOOKAHEAD_MINUTES = 150;

/** How close to the brief time a tick may be and still send it. */
export const BRIEF_FIRE_WINDOW_MINUTES = 10;

export interface TickResult {
  householdId: string;
  skipped?: string;
  briefsSent: number;
  departureAlerts: number;
  retimeAlerts: number;
  escalations: number;
  errors: string[];
}

export async function tickHousehold(
  householdId: string,
  now: Date = new Date()
): Promise<TickResult> {
  const result: TickResult = {
    householdId,
    briefsSent: 0,
    departureAlerts: 0,
    retimeAlerts: 0,
    escalations: 0,
    errors: [],
  };

  const prefs = await db.dayPreferences.findUnique({ where: { householdId } });
  if (!prefs || !prefs.proactiveEnabled) {
    result.skipped = "Proactive messaging is off for this household.";
    return result;
  }

  const ctx = await dayContext(householdId);
  const today = todayIn(ctx.timeZone, now);
  const localMinute = zonedMinuteOfDay(now, ctx.timeZone);

  try {
    await materializeDay(householdId, today);
  } catch (error) {
    result.errors.push(`materialize: ${String(error)}`);
  }

  // --- Morning brief -------------------------------------------------------
  if (
    prefs.briefEnabled &&
    localMinute >= prefs.morningBriefMinute &&
    localMinute < prefs.morningBriefMinute + BRIEF_FIRE_WINDOW_MINUTES
  ) {
    try {
      // The brief is the one moment worth pricing the WHOLE day for. Everywhere
      // else this loop deliberately only looks a couple of hours ahead, but a
      // brief that says "no travel estimate yet" against the 5 PM dance class
      // is not a brief — the leave times are the reason to read it. One refresh
      // per household per day is a price worth paying for that.
      await refreshDepartures(householdId, today, now);
      result.briefsSent += await sendBriefs(householdId, today, now, localMinute);
    } catch (error) {
      result.errors.push(`brief: ${String(error)}`);
    }
  }

  // --- Departures ----------------------------------------------------------
  const upcoming = await db.activityOccurrence.findMany({
    where: {
      householdId,
      day: startOfDay(today),
      status: "PLANNED",
      startAt: { gt: now },
    },
    orderBy: { startAt: "asc" },
    include: {
      activity: { include: { place: true, subjectMember: true } },
      responsibleMember: { include: { channels: true } },
      responsibleContact: true,
    },
  });

  // Selected on START time, not on leaveAt.
  //
  // Filtering on leaveAt looks more precise and is a deadlock: an occurrence
  // has no leaveAt until a refresh computes one, and the refresh would never
  // run because nothing qualified. Everything sat at "no travel estimate yet"
  // forever. A departure is always before its event, so a start-time window is
  // a superset of the leaveAt window — and it is the only one that can select
  // an occurrence that has never been priced.
  const imminent = upcoming.filter(
    (occ) => minutesBetween(now, occ.startAt) <= LOOKAHEAD_MINUTES
  );

  // Re-price only what's close enough for the answer to mean something.
  if (imminent.length > 0) {
    try {
      await refreshDepartures(householdId, today, now);
    } catch (error) {
      result.errors.push(`refresh: ${String(error)}`);
    }
  }

  const refreshed = await db.activityOccurrence.findMany({
    where: { id: { in: imminent.map((o) => o.id) } },
    include: {
      activity: { include: { place: true, subjectMember: true } },
      responsibleMember: { include: { channels: true } },
      responsibleContact: true,
    },
  });

  for (const occ of refreshed) {
    if (!occ.leaveAt || occ.travelMinutes == null) continue;

    const recipients = await recipientsFor(occ.responsibleMember, occ.responsibleContact);
    const msgCtx = {
      activityName: occ.activity.name,
      subjectName: occ.activity.subjectMember?.name ?? null,
      destinationLabel: occ.activity.place?.label ?? null,
      timeZone: ctx.timeZone,
    };

    // Rebuilt from the stored plan, never recomputed from the activity — see
    // planFromOccurrence() for why those two are not the same thing.
    const plan = planFromOccurrence(occ, ctx, occ.activity.prepMinutes, now);
    if (!plan) continue;

    // Phase message — PREPARE and DRIVE_NOW each fire at most once, enforced
    // by the dispatch key rather than by a flag on the occurrence.
    const kind: DispatchKind | null =
      plan.phase === "PREPARE" ? "PREPARE" : plan.phase === "DRIVE_NOW" ? "DRIVE_NOW" : null;

    if (kind && recipients.length > 0) {
      const body = departureMessage(plan, msgCtx);
      let told = false;
      for (const recipient of recipients) {
        const outcome = await sendOnce({
          occurrenceId: occ.id,
          kind,
          recipient,
          body,
          localMinuteOfDay: localMinute,
        });
        if (outcome.sent) {
          result.departureAlerts += 1;
          told = true;
        }
      }
      if (told) await recordTold(occ.id, plan.travelMinutes, now);
    }

    // Traffic change against what was last communicated, not against the last
    // computation — a change nobody was told about isn't a change to them.
    const lastTold = lastCommunicatedPlan(occ, plan, now);
    if (lastTold) {
      const verdict = shouldRetimeAlert({
        previous: lastTold,
        current: plan,
        alertsAlreadySent: occ.retimeAlertsSent,
        now,
      });
      if (verdict.notify && recipients.length > 0) {
        const body = retimeMessage(verdict, plan, msgCtx);
        let sentAny = false;
        for (const recipient of recipients) {
          const outcome = await sendOnce({
            occurrenceId: occ.id,
            // Distinct key per alert so a second, genuinely different traffic
            // change can still be reported.
            kind: `RETIME` as DispatchKind,
            recipient: { ...recipient, key: `${recipient.key}#${occ.retimeAlertsSent}` },
            body,
            localMinuteOfDay: localMinute,
          });
          if (outcome.sent) sentAny = true;
        }
        if (sentAny) {
          result.retimeAlerts += 1;
          await db.activityOccurrence.update({
            where: { id: occ.id },
            data: {
              retimeAlertsSent: { increment: 1 },
              lastToldTravelMinutes: plan.travelMinutes,
              lastToldAt: now,
            },
          });
        }
      }
    }

    await db.activityOccurrence.update({
      where: { id: occ.id },
      data: { phase: plan.phase },
    });

    // --- Confirmation ladder ----------------------------------------------
    const step = nextEscalationStep({
      requiresConfirmation: occ.activity.requiresConfirmation,
      state: occ.confirmationState as never,
      sent: parseRungs(occ.escalationsSent),
      leaveAt: occ.leaveAt,
      now,
      policy: {
        askLeadMinutes: prefs.askLeadMinutes,
        remindLeadMinutes: prefs.remindLeadMinutes,
        escalateLeadMinutes: prefs.escalateLeadMinutes,
        uncoveredLeadMinutes: prefs.uncoveredLeadMinutes,
      },
      hasOtherAdults: await hasOtherAdults(householdId, occ.responsibleMemberId),
      hasGroup: occ.activity.notifyGroup,
    });

    if (step.act) {
      const audience = await audienceFor(
        householdId,
        step.audience,
        occ.responsibleMemberId,
        occ.activity.id
      );
      const body = escalationMessage(step, {
        activityName: occ.activity.name,
        subjectName: occ.activity.subjectMember?.name ?? null,
        responsibleName:
          occ.responsibleMember?.name ?? occ.responsibleContact?.name ?? "Nobody",
        startClock: formatInstant(occ.startAt, ctx.timeZone),
        leaveClock: formatInstant(occ.leaveAt, ctx.timeZone),
      });

      let sentAny = false;
      for (const recipient of audience) {
        const outcome = await sendOnce({
          occurrenceId: occ.id,
          kind: step.rung as DispatchKind,
          recipient,
          body,
          localMinuteOfDay: localMinute,
        });
        if (outcome.sent) sentAny = true;
      }
      if (sentAny) {
        result.escalations += 1;
        await db.activityOccurrence.update({
          where: { id: occ.id },
          data: {
            escalationsSent: [...parseRungs(occ.escalationsSent), step.rung].join(","),
            confirmationState: step.nextState,
          },
        });
      }
    }
  }

  return result;
}

/** Every household with proactive messaging on. The cron entry point. */
export async function tickAll(now: Date = new Date()): Promise<TickResult[]> {
  const households = await db.dayPreferences.findMany({
    where: { proactiveEnabled: true },
    select: { householdId: true },
  });

  const out: TickResult[] = [];
  for (const row of households) {
    try {
      out.push(await tickHousehold(row.householdId, now));
    } catch (error) {
      out.push({
        householdId: row.householdId,
        briefsSent: 0,
        departureAlerts: 0,
        retimeAlerts: 0,
        escalations: 0,
        errors: [String(error)],
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

function parseRungs(csv: string): EscalationRung[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is EscalationRung =>
      ["ASK", "REMIND", "ESCALATE", "BROADCAST", "UNCOVERED"].includes(s)
    );
}

/**
 * The plan as last described to a person.
 *
 * Comparing against the last COMPUTED plan would fire an alert for a change the
 * household never heard about; comparing against the last COMMUNICATED one is
 * what "traffic is up 12 minutes" actually means to the reader.
 *
 * An earlier version read the number back out of the message text. That was
 * wrong in a way worth recording: the morning brief covers every trip of the
 * day in ONE message, anchored to a single occurrence, so every other trip it
 * described had no dispatch row of its own to read — and re-timing silently
 * never fired for any of them.
 */
function lastCommunicatedPlan(
  occurrence: { lastToldTravelMinutes: number | null },
  current: DeparturePlan,
  now: Date
): DeparturePlan | null {
  const minutes = occurrence.lastToldTravelMinutes;
  if (minutes == null || minutes <= 0) return null;

  return computeDeparture({
    eventStartAt: current.eventStartAt,
    travelMinutes: minutes,
    arrivalBufferMinutes: current.arrivalBufferMinutes,
    prepMinutes: current.prepMinutes,
    now,
  });
}

async function hasOtherAdults(
  householdId: string,
  responsibleMemberId: string | null
): Promise<boolean> {
  const count = await db.householdMember.count({
    where: {
      householdId,
      role: { in: ["OWNER", "ADULT"] },
      ...(responsibleMemberId ? { id: { not: responsibleMemberId } } : {}),
    },
  });
  return count > 0;
}

async function audienceFor(
  householdId: string,
  audience: "RESPONSIBLE" | "OTHER_ADULTS" | "GROUP" | "OWNER",
  responsibleMemberId: string | null,
  activityId: string
): Promise<Recipient[]> {
  if (audience === "RESPONSIBLE") {
    const member = responsibleMemberId
      ? await db.householdMember.findUnique({
          where: { id: responsibleMemberId },
          include: { channels: true },
        })
      : null;
    return recipientsFor(member, null);
  }

  if (audience === "OTHER_ADULTS" || audience === "OWNER") {
    const members = await db.householdMember.findMany({
      where: {
        householdId,
        role: audience === "OWNER" ? "OWNER" : { in: ["OWNER", "ADULT"] },
        ...(responsibleMemberId && audience === "OTHER_ADULTS"
          ? { id: { not: responsibleMemberId } }
          : {}),
      },
      include: { channels: true },
    });
    const out: Recipient[] = [];
    for (const member of members) out.push(...(await recipientsFor(member, null)));
    return out;
  }

  // GROUP — everyone in the coordination group behind this activity's rotation.
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: {
      rotation: {
        include: {
          group: {
            include: {
              members: {
                include: { member: { include: { channels: true } }, contact: true },
              },
            },
          },
        },
      },
    },
  });

  const out: Recipient[] = [];
  for (const link of activity?.rotation?.group?.members ?? []) {
    out.push(...(await recipientsFor(link.member ?? null, link.contact ?? null)));
  }
  return out;
}

type MemberWithChannels = {
  id: string;
  name: string;
  channels: {
    channel: string;
    address: string;
    isPrimary: boolean;
    quietFromMinute: number | null;
    quietToMinute: number | null;
  }[];
} | null;

type ContactRow = { id: string; name: string; channel: string; channelAddress: string | null } | null;

/**
 * Where to actually reach someone.
 *
 * Returns an empty list rather than falling back to a household-wide broadcast
 * when a person has no usable channel. Sending "you have pickup" to everyone
 * because we couldn't reach one person is how a family learns to ignore the
 * notifications. The UI's job is to make the gap visible before the day
 * arrives; see the unreachable warning on the Today page.
 */
async function recipientsFor(
  member: MemberWithChannels,
  contact: ContactRow
): Promise<Recipient[]> {
  if (member) {
    const channels = [...member.channels].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary)
    );
    const primary = channels[0];
    if (!primary) return [];
    return [
      {
        key: `member:${member.id}`,
        displayName: member.name,
        channel: primary.channel as Channel,
        address: primary.address,
        quietFromMinute: primary.quietFromMinute,
        quietToMinute: primary.quietToMinute,
      },
    ];
  }

  if (contact && contact.channelAddress && contact.channel !== "NONE") {
    return [
      {
        key: `contact:${contact.id}`,
        displayName: contact.name,
        channel: contact.channel as Channel,
        address: contact.channelAddress,
      },
    ];
  }

  return [];
}

/** Remember what the household was just told, so the next change is measurable. */
async function recordTold(occurrenceId: string, travelMinutes: number, now: Date) {
  await db.activityOccurrence.update({
    where: { id: occurrenceId },
    data: { lastToldTravelMinutes: travelMinutes, lastToldAt: now },
  });
}

async function sendBriefs(
  householdId: string,
  day: Date,
  now: Date,
  localMinute: number
): Promise<number> {
  const adults = await db.householdMember.findMany({
    where: { householdId, role: { in: ["OWNER", "ADULT"] } },
    include: { channels: true },
  });

  let sent = 0;
  for (const adult of adults) {
    const recipients = await recipientsFor(adult, null);
    if (recipients.length === 0) continue;

    const brief = await briefFor(
      householdId,
      adult.id,
      adult.name.split(" ")[0] ?? adult.name,
      day,
      now
    );
    if (brief.isEmpty) continue;

    const body = renderBriefText(brief);
    for (const recipient of recipients) {
      // The brief isn't tied to one occurrence, so it hangs off the first one
      // of the day — which is also what makes it idempotent per day.
      const anchor = brief.lines[0]?.occurrenceId;
      if (!anchor) continue;
      const outcome = await sendOnce({
        occurrenceId: anchor,
        kind: "BRIEF",
        recipient,
        body,
        localMinuteOfDay: localMinute,
      });
      if (outcome.sent) {
        sent += 1;
        // The brief quotes a leave time for every trip of the day, so every one
        // of them has now been communicated — not just the occurrence the
        // dispatch row happens to hang off.
        for (const occ of await db.activityOccurrence.findMany({
          where: { householdId, day: startOfDay(day), status: "PLANNED", travelMinutes: { not: null } },
          select: { id: true, travelMinutes: true },
        })) {
          await db.activityOccurrence.update({
            where: { id: occ.id },
            data: { lastToldTravelMinutes: occ.travelMinutes, lastToldAt: now },
          });
        }
      }
    }
  }
  return sent;
}
