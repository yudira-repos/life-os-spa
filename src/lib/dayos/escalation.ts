// Confirmation and escalation.
//
// A reminder that nobody reads is indistinguishable from no reminder at all,
// and the failure mode this module is supposed to prevent — a child standing
// outside a school at 3:30 because both parents assumed the other one had it —
// happens precisely when everyone believes the plan is fine. So responsibilities
// that matter ask for an acknowledgement, and silence is treated as a problem
// rather than as consent.
//
// The ladder, in time order relative to the DEPARTURE (not the event):
//
//   ASK        leaveAt − askLeadMinutes      "You have pickup today. Confirm?"
//   REMIND     leaveAt − remindLeadMinutes   only if still unanswered
//   ESCALATE   leaveAt − escalateLeadMinutes unanswered → tell the other adults
//   BROADCAST  immediately on decline        → ask the group for a taker
//   UNCOVERED  leaveAt − uncoveredLeadMin    nobody took it → tell the owner
//
// Two rules keep this from becoming spam:
//
//   1. Only activities marked `requiresConfirmation` enter the ladder at all.
//      Defaulting every gym session into an escalation chain trains people to
//      swipe the notifications away, which breaks the ones that matter.
//   2. Each rung fires at most once per occurrence. The state carries what has
//      already been sent; this function never re-derives it from the clock.
//
// Pure: `now` and the prior state come in, one action goes out.

import { minutesBetween } from "@/lib/dayos/time";

export type ConfirmationState =
  | "NOT_REQUIRED"
  | "PENDING"
  | "CONFIRMED"
  | "DECLINED"
  | "REASSIGNED"
  | "UNCOVERED";

export type EscalationRung = "ASK" | "REMIND" | "ESCALATE" | "BROADCAST" | "UNCOVERED";

export interface EscalationPolicy {
  askLeadMinutes: number;
  remindLeadMinutes: number;
  escalateLeadMinutes: number;
  uncoveredLeadMinutes: number;
}

export const DEFAULT_ESCALATION_POLICY: EscalationPolicy = {
  askLeadMinutes: 120,
  remindLeadMinutes: 45,
  escalateLeadMinutes: 25,
  uncoveredLeadMinutes: 10,
};

export interface EscalationInput {
  requiresConfirmation: boolean;
  state: ConfirmationState;
  /** Rungs already sent for this occurrence. */
  sent: EscalationRung[];
  leaveAt: Date;
  now: Date;
  policy?: EscalationPolicy;
  /** Someone other than the responsible person to escalate to. */
  hasOtherAdults: boolean;
  /** A carpool or family group that can be asked to take it over. */
  hasGroup: boolean;
}

export type EscalationAudience = "RESPONSIBLE" | "OTHER_ADULTS" | "GROUP" | "OWNER";

export type EscalationAction =
  | { act: false; reason: string }
  | {
      act: true;
      rung: EscalationRung;
      audience: EscalationAudience;
      /** Whether the message should carry Confirm / Can't do it buttons. */
      requestReply: boolean;
      nextState: ConfirmationState;
      reason: string;
    };

export function nextEscalationStep(input: EscalationInput): EscalationAction {
  const policy = input.policy ?? DEFAULT_ESCALATION_POLICY;
  const sent = new Set(input.sent);
  const minutesToLeave = minutesBetween(input.now, input.leaveAt);

  if (!input.requiresConfirmation) {
    return { act: false, reason: "This activity doesn't ask for confirmation." };
  }
  if (input.state === "CONFIRMED" || input.state === "REASSIGNED") {
    return { act: false, reason: "Already settled — someone has it." };
  }

  // A decline is the one event that doesn't wait for a clock. The turnaround
  // window is the whole value: asking the group at leaveAt − 3 min is theatre.
  if (input.state === "DECLINED" && !sent.has("BROADCAST")) {
    if (!input.hasGroup && !input.hasOtherAdults) {
      return {
        act: true,
        rung: "UNCOVERED",
        audience: "OWNER",
        requestReply: false,
        nextState: "UNCOVERED",
        reason: "Declined, and there's nobody else in the household to ask.",
      };
    }
    return {
      act: true,
      rung: "BROADCAST",
      audience: input.hasGroup ? "GROUP" : "OTHER_ADULTS",
      requestReply: true,
      nextState: "DECLINED",
      reason: "Declined — asking who can take it.",
    };
  }

  if (
    input.state === "DECLINED" &&
    sent.has("BROADCAST") &&
    !sent.has("UNCOVERED") &&
    minutesToLeave <= policy.uncoveredLeadMinutes
  ) {
    return {
      act: true,
      rung: "UNCOVERED",
      audience: "OWNER",
      requestReply: false,
      nextState: "UNCOVERED",
      reason: "Nobody has taken this and departure is imminent.",
    };
  }

  if (input.state !== "PENDING") {
    return { act: false, reason: `Nothing to do in state ${input.state}.` };
  }

  if (
    !sent.has("ESCALATE") &&
    minutesToLeave <= policy.escalateLeadMinutes &&
    input.hasOtherAdults
  ) {
    return {
      act: true,
      rung: "ESCALATE",
      audience: "OTHER_ADULTS",
      requestReply: true,
      nextState: "PENDING",
      reason: "Still unanswered close to departure.",
    };
  }
  if (!sent.has("REMIND") && minutesToLeave <= policy.remindLeadMinutes) {
    return {
      act: true,
      rung: "REMIND",
      audience: "RESPONSIBLE",
      requestReply: true,
      nextState: "PENDING",
      reason: "First ask went unanswered.",
    };
  }
  if (!sent.has("ASK") && minutesToLeave <= policy.askLeadMinutes) {
    return {
      act: true,
      rung: "ASK",
      audience: "RESPONSIBLE",
      requestReply: true,
      nextState: "PENDING",
      reason: "Time to confirm who's doing this.",
    };
  }

  return {
    act: false,
    reason: `Too early — ${Math.round(minutesToLeave)} min before departure.`,
  };
}

export interface EscalationCopyContext {
  activityName: string;
  subjectName?: string | null;
  responsibleName: string;
  startClock: string;
  leaveClock: string;
}

export function escalationMessage(
  action: Extract<EscalationAction, { act: true }>,
  ctx: EscalationCopyContext
): string {
  const who = ctx.subjectName ? `${ctx.subjectName}'s ` : "";
  switch (action.rung) {
    case "ASK":
      return `${who}${ctx.activityName} at ${ctx.startClock} — you're down for it today. Leave by ${ctx.leaveClock}. Confirm?`;
    case "REMIND":
      return `Still need a yes on ${who}${ctx.activityName} at ${ctx.startClock}. Departure is ${ctx.leaveClock}.`;
    case "ESCALATE":
      return `${ctx.responsibleName} hasn't confirmed ${who}${ctx.activityName} at ${ctx.startClock}. Can one of you cover if needed?`;
    case "BROADCAST":
      return `${ctx.responsibleName} can't do ${who}${ctx.activityName} today (${ctx.startClock}). Can anyone take it?`;
    case "UNCOVERED":
      return `Nobody has taken ${who}${ctx.activityName} at ${ctx.startClock}. Departure was ${ctx.leaveClock} — this one needs a person.`;
  }
}
