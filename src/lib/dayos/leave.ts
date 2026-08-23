// The leave-time engine.
//
// This is the module's whole reason to exist. A calendar says "dance at 5:00".
// A person needs "leave at 4:18". The gap between those two sentences is the
// product.
//
//   arriveBy = eventStart − arrivalBuffer      (parking, walking in, signing in)
//   leaveAt  = arriveBy   − travelMinutes
//   readyAt  = leaveAt    − prepMinutes        (shoes, water bottle, the kid)
//
// Pure: no database, no network, no clock of its own. `now` is always passed
// in, which is what makes the phase machine testable and the reminders
// reproducible.
//
// THE FIXED POINT, stated because it is the bug every version of this feature
// ships with first: travel time depends on when you leave, and when you leave
// depends on travel time. Asking a routing API "how long is it right now" for
// an event two hours out gives you the current traffic, not the traffic you
// will actually sit in — and at 3 PM for a 5 PM event that is routinely wrong
// by fifteen minutes in the wrong direction. `solveDeparture()` below closes
// the loop: estimate, compute a departure, re-estimate FOR that departure,
// repeat until it stops moving. Two iterations is almost always enough; three
// is the cap.

import { addMinutes, describeMinutes, formatInstant, minutesBetween } from "@/lib/dayos/time";

export const DEFAULT_ARRIVAL_BUFFER_MIN = 10;
export const DEFAULT_PREP_MIN = 10;

/** How far ahead of leaveAt the "prepare to leave" nudge fires. */
export const PREPARE_LEAD_MIN = 15;

/** "Drive now" stays live this long past leaveAt before it becomes "late". */
export const DRIVE_NOW_GRACE_MIN = 5;

/** Past this much after leaveAt, the reminder is about being late, not leaving. */
export const LATE_GRACE_MIN = 20;

export type DeparturePhase =
  | "SCHEDULED"
  | "PREPARE"
  | "DRIVE_NOW"
  | "RUNNING_LATE"
  | "PASSED";

export interface DepartureInput {
  eventStartAt: Date;
  travelMinutes: number;
  arrivalBufferMinutes?: number;
  prepMinutes?: number;
  now: Date;
}

export interface DeparturePlan {
  eventStartAt: Date;
  arriveBy: Date;
  leaveAt: Date;
  readyAt: Date;
  travelMinutes: number;
  arrivalBufferMinutes: number;
  prepMinutes: number;
  /** Negative once leaveAt has passed. */
  minutesUntilLeave: number;
  phase: DeparturePhase;
  /** Where you'd actually arrive if you left at `now`. */
  etaIfLeavingNow: Date;
  /** Positive = late by this many minutes if you leave now. */
  lateByMinutes: number;
}

export function computeDeparture(input: DepartureInput): DeparturePlan {
  const arrivalBufferMinutes = input.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MIN;
  const prepMinutes = input.prepMinutes ?? DEFAULT_PREP_MIN;
  const travelMinutes = Math.max(0, Math.round(input.travelMinutes));

  const arriveBy = addMinutes(input.eventStartAt, -arrivalBufferMinutes);
  const leaveAt = addMinutes(arriveBy, -travelMinutes);
  const readyAt = addMinutes(leaveAt, -prepMinutes);

  const minutesUntilLeave = minutesBetween(input.now, leaveAt);
  const etaIfLeavingNow = addMinutes(input.now, travelMinutes);
  const lateByMinutes = minutesBetween(input.eventStartAt, etaIfLeavingNow);

  return {
    eventStartAt: input.eventStartAt,
    arriveBy,
    leaveAt,
    readyAt,
    travelMinutes,
    arrivalBufferMinutes,
    prepMinutes,
    minutesUntilLeave,
    phase: phaseFor(minutesUntilLeave, minutesBetween(input.now, input.eventStartAt)),
    etaIfLeavingNow,
    lateByMinutes,
  };
}

export function phaseFor(minutesUntilLeave: number, minutesUntilEvent: number): DeparturePhase {
  if (minutesUntilEvent <= 0) return "PASSED";
  if (minutesUntilLeave > PREPARE_LEAD_MIN) return "SCHEDULED";
  if (minutesUntilLeave > DRIVE_NOW_GRACE_MIN) return "PREPARE";
  if (minutesUntilLeave > -LATE_GRACE_MIN) return "DRIVE_NOW";
  return "RUNNING_LATE";
}

// ---------------------------------------------------------------------------
// The fixed point
// ---------------------------------------------------------------------------

export interface SolveResult extends DeparturePlan {
  /** How many provider estimates it took. 1 means it converged immediately. */
  iterations: number;
  /** True when the loop hit the cap without settling — the plan is still usable. */
  converged: boolean;
}

export const MAX_SOLVE_ITERATIONS = 3;
/** Departure times within this of each other are the same answer. */
export const CONVERGENCE_MINUTES = 1;

/**
 * Solve leaveAt against a routing estimate that itself depends on leaveAt.
 *
 * `estimate(departAt)` is the injected provider — routing.ts in production, a
 * hand-written traffic curve in the tests. It is called at most
 * MAX_SOLVE_ITERATIONS times, which bounds both latency and API spend.
 */
export function solveDeparture(
  base: Omit<DepartureInput, "travelMinutes">,
  estimate: (departAt: Date) => number
): SolveResult {
  // Seed from a departure of "the event start minus the buffer" — i.e. assume
  // zero travel — so the first probe already asks about roughly the right hour
  // rather than about now.
  let departAt = addMinutes(
    base.eventStartAt,
    -(base.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MIN)
  );
  let plan = computeDeparture({ ...base, travelMinutes: estimate(departAt) });
  let iterations = 1;
  let converged = false;

  while (iterations < MAX_SOLVE_ITERATIONS) {
    if (Math.abs(minutesBetween(departAt, plan.leaveAt)) <= CONVERGENCE_MINUTES) {
      converged = true;
      break;
    }
    departAt = plan.leaveAt;
    plan = computeDeparture({ ...base, travelMinutes: estimate(departAt) });
    iterations += 1;
    if (Math.abs(minutesBetween(departAt, plan.leaveAt)) <= CONVERGENCE_MINUTES) {
      converged = true;
      break;
    }
  }

  return { ...plan, iterations, converged };
}

// ---------------------------------------------------------------------------
// Re-assessment: when a changed estimate is worth a second message
// ---------------------------------------------------------------------------

/**
 * Same doctrine as PropertyOS's price-jump rule: a threshold in absolute terms
 * AND in relative terms, because either alone cries wolf. Two minutes on a
 * 12-minute school run is noise; two minutes on a 90-minute airport run is
 * nothing. Both must clear for a re-alert.
 */
export const RETIME_MIN_DELTA_MINUTES = 5;
export const RETIME_MIN_DELTA_RATIO = 0.15;

/** Hard cap on traffic updates per occurrence, whatever the deltas say. */
export const MAX_RETIME_ALERTS = 2;

export type RetimeVerdict =
  | { notify: false; reason: string; deltaMinutes: number }
  | {
      notify: true;
      reason: string;
      deltaMinutes: number;
      direction: "WORSE" | "BETTER";
      urgent: boolean;
    };

export interface RetimeInput {
  previous: DeparturePlan;
  current: DeparturePlan;
  alertsAlreadySent: number;
  now: Date;
}

export function shouldRetimeAlert(input: RetimeInput): RetimeVerdict {
  const deltaMinutes = input.current.travelMinutes - input.previous.travelMinutes;
  const abs = Math.abs(deltaMinutes);
  const ratio = input.previous.travelMinutes > 0 ? abs / input.previous.travelMinutes : 1;

  if (input.current.phase === "PASSED") {
    return { notify: false, reason: "The event has already started.", deltaMinutes };
  }

  // The one case that overrides every threshold and the send cap: the new
  // estimate says you should ALREADY have left. Staying quiet there to respect
  // a rate limit is the single worst thing this engine could do.
  const nowPastLeave = minutesBetween(input.now, input.current.leaveAt) <= 0;
  const wasFuture = minutesBetween(input.now, input.previous.leaveAt) > 0;
  if (nowPastLeave && wasFuture && deltaMinutes > 0) {
    return {
      notify: true,
      reason: "Traffic moved the departure into the past — leave now.",
      deltaMinutes,
      direction: "WORSE",
      urgent: true,
    };
  }

  if (input.alertsAlreadySent >= MAX_RETIME_ALERTS) {
    return {
      notify: false,
      reason: `Already sent ${input.alertsAlreadySent} traffic updates for this trip.`,
      deltaMinutes,
    };
  }
  if (abs < RETIME_MIN_DELTA_MINUTES) {
    return {
      notify: false,
      reason: `${abs.toFixed(0)} min change is below the ${RETIME_MIN_DELTA_MINUTES} min floor.`,
      deltaMinutes,
    };
  }
  if (ratio < RETIME_MIN_DELTA_RATIO) {
    return {
      notify: false,
      reason: `${abs.toFixed(0)} min is only ${(ratio * 100).toFixed(0)}% of a ${
        input.previous.travelMinutes
      } min drive.`,
      deltaMinutes,
    };
  }

  return {
    notify: true,
    reason:
      deltaMinutes > 0
        ? `Traffic is ${abs} min heavier than when this was planned.`
        : `Traffic cleared — ${abs} min lighter than planned.`,
    deltaMinutes,
    direction: deltaMinutes > 0 ? "WORSE" : "BETTER",
    urgent: false,
  };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export interface MessageContext {
  activityName: string;
  /** "Ayuktha" — who the activity is for, when that isn't the recipient. */
  subjectName?: string | null;
  destinationLabel?: string | null;
  timeZone: string;
}

/**
 * The message for a phase. Deliberately a pure function of the plan so the
 * same wording is produced whether it goes to Telegram, WhatsApp or the UI —
 * and so a test can assert the exact string.
 */
export function departureMessage(plan: DeparturePlan, ctx: MessageContext): string {
  const tz = ctx.timeZone;
  const who = ctx.subjectName ? `${ctx.subjectName}'s ` : "";
  const where = ctx.destinationLabel ? ` at ${ctx.destinationLabel}` : "";
  const start = formatInstant(plan.eventStartAt, tz);
  const leave = formatInstant(plan.leaveAt, tz);

  switch (plan.phase) {
    case "SCHEDULED":
      return (
        `${who}${ctx.activityName} starts at ${start}${where}. ` +
        `Traffic is ${plan.travelMinutes} min right now — plan to leave by ${leave}.`
      );
    case "PREPARE":
      return (
        `Heads up — leave ${describeMinutes(plan.minutesUntilLeave)} for ` +
        `${who}${ctx.activityName} (${leave}). ${plan.travelMinutes} min drive${where}.`
      );
    case "DRIVE_NOW":
      return (
        `Drive now for ${who}${ctx.activityName}. ` +
        `Leaving in the next few minutes gets you there by ` +
        `${formatInstant(plan.etaIfLeavingNow, tz)}, ahead of ${start}.`
      );
    case "RUNNING_LATE":
      return (
        `Running late for ${who}${ctx.activityName}. Leaving now arrives ` +
        `${formatInstant(plan.etaIfLeavingNow, tz)} — about ` +
        `${Math.round(plan.lateByMinutes)} min after the ${start} start.`
      );
    case "PASSED":
      return `${who}${ctx.activityName} started at ${start}.`;
  }
}

export function retimeMessage(
  verdict: Extract<RetimeVerdict, { notify: true }>,
  plan: DeparturePlan,
  ctx: MessageContext
): string {
  const leave = formatInstant(plan.leaveAt, ctx.timeZone);
  const who = ctx.subjectName ? `${ctx.subjectName}'s ` : "";
  if (verdict.urgent) {
    return `Traffic jumped ${verdict.deltaMinutes} min for ${who}${ctx.activityName}. Leave now — the planned ${leave} departure has already passed.`;
  }
  return verdict.direction === "WORSE"
    ? `Traffic is up ${Math.abs(verdict.deltaMinutes)} min for ${who}${ctx.activityName}. Leave by ${leave} instead.`
    : `Traffic cleared for ${who}${ctx.activityName} — you have until ${leave} now.`;
}
