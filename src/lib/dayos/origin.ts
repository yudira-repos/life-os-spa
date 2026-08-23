// Where is this person actually starting from?
//
// Computing a departure from Home when the responsible parent is at the office
// produces a leave time that is confidently, uselessly wrong — and one wrong
// "drive now" is enough for someone to stop trusting the next fifty. So the
// origin is inferred, and the inference carries its confidence all the way to
// the message.
//
// The order, most reliable first:
//
//   1. CHAINED   — they have an earlier commitment today that ends too close
//                  to this one to get home in between. Origin is that place.
//                  This is the only branch we actually KNOW something in.
//   2. SCHEDULE  — no prior commitment, but it's a weekday inside their stated
//                  working hours and they have a work place on file.
//   3. DEFAULT   — home.
//
// A SCHEDULE or DEFAULT origin is a guess, and the UI says "assuming you're
// leaving from work" rather than presenting it as fact. Pure: no database.

import { minutesBetween } from "@/lib/dayos/time";
import type { MinuteOfDay } from "@/lib/dayos/time";

export type OriginConfidence = "CHAINED" | "SCHEDULE" | "DEFAULT";

export interface PlaceRef {
  id: string;
  label: string;
  address: string;
}

/** An earlier commitment for the same person on the same day. */
export interface PriorCommitment {
  id: string;
  place: PlaceRef;
  /** When they're free to leave it. */
  endsAt: Date;
}

export interface WorkingHours {
  /** Sunday = 0. Typically [1,2,3,4,5]. */
  weekdays: number[];
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
}

export interface OriginInput {
  /** When they'd need to set off, from the current best plan. */
  leaveAt: Date;
  /** The local weekday of leaveAt, Sunday = 0. */
  leaveWeekday: number;
  /** The local wall-clock minute of leaveAt. */
  leaveMinuteOfDay: MinuteOfDay;
  priorCommitments: PriorCommitment[];
  homePlace: PlaceRef | null;
  workPlace: PlaceRef | null;
  workingHours?: WorkingHours | null;
}

export interface OriginResult {
  place: PlaceRef | null;
  confidence: OriginConfidence;
  /** Shown to the user verbatim when the origin isn't Home. */
  explanation: string;
  /** The commitment this was chained from, when confidence is CHAINED. */
  chainedFrom?: PriorCommitment;
}

/**
 * How much slack a person needs between one commitment ending and a departure
 * before it's plausible they went home first. Below this, they're still there.
 * Deliberately generous — assuming someone dashed home in 20 minutes and
 * routing from Home is the exact failure this function exists to prevent.
 */
export const CHAIN_SLACK_MINUTES = 45;

export function resolveOrigin(input: OriginInput): OriginResult {
  // 1. Chained — the latest commitment that ends before departure and doesn't
  //    leave enough slack to have gone home.
  const priors = input.priorCommitments
    .filter((c) => c.endsAt <= input.leaveAt)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());

  const chained = priors.find(
    (c) => minutesBetween(c.endsAt, input.leaveAt) < CHAIN_SLACK_MINUTES
  );
  if (chained) {
    const gap = Math.round(minutesBetween(chained.endsAt, input.leaveAt));
    return {
      place: chained.place,
      confidence: "CHAINED",
      explanation: `Leaving from ${chained.place.label} — only ${gap} min after that ends.`,
      chainedFrom: chained,
    };
  }

  // 2. Schedule — inside stated working hours, with a work address on file.
  const hours = input.workingHours;
  if (
    input.workPlace &&
    hours &&
    hours.weekdays.includes(input.leaveWeekday) &&
    input.leaveMinuteOfDay >= hours.startMinute &&
    input.leaveMinuteOfDay <= hours.endMinute
  ) {
    return {
      place: input.workPlace,
      confidence: "SCHEDULE",
      explanation: `Assuming you're leaving from ${input.workPlace.label} — it's a workday.`,
    };
  }

  // 3. Default.
  return {
    place: input.homePlace,
    confidence: "DEFAULT",
    explanation: input.homePlace
      ? `Leaving from ${input.homePlace.label}.`
      : "No starting address on file — add Home in settings to get a leave time.",
  };
}

/** Whether the UI should invite the user to correct the origin. */
export function shouldConfirmOrigin(result: OriginResult): boolean {
  return result.confidence !== "CHAINED" && result.place !== null;
}
