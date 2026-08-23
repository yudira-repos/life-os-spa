// Whose turn is it.
//
// Two rotation shapes cover every real carpool and chore rota:
//
//   FIXED_WEEKDAY — Monday is always Ravi, Tuesday is always Parent A.
//                   Most school carpools are this. Trivially predictable,
//                   which is the point: people plan their week around it.
//
//   ROUND_ROBIN   — an ordered roster that advances one step per occurrence.
//                   Used where the activity doesn't happen on fixed weekdays
//                   (a class that moves, a rota over four parents and three
//                   sessions a week). Anchored to a date so it is a pure
//                   function of the calendar and never drifts: recomputing
//                   next March gives the same answer as computing it today.
//
// THE OVERRIDE DESIGN DECISION, stated once because it is the thing that
// decides whether people trust the rota:
//
// "Divya is taking her today" and "swap my Wednesday with Divya" are NOT the
// same operation, and collapsing them into one is how a rotation quietly
// becomes unfair. A COVER is one-directional — someone does your turn and you
// still owe it. A SWAP is two records that exchange two specific dates, so
// both people's turn counts stay level. `debtFor()` below reports the
// resulting imbalance, and the agent says "Divya has covered for you twice
// this month" instead of silently letting it accumulate.

import { dayKey, parseDay } from "@/lib/travelos/dates";
import { weekdayIndex } from "@/lib/dayos/time";
import type { Weekday } from "@/lib/dayos/recurrence";

export type RotationKind = "FIXED_WEEKDAY" | "ROUND_ROBIN";

/**
 * A person who can be assigned. Either a household member (has a LifeOS
 * login, or at least a member row) or an external contact — the other parents
 * in a carpool are real participants and refusing to model them would make
 * the whole feature useless.
 */
export interface Assignee {
  id: string;
  name: string;
  kind: "MEMBER" | "CONTACT";
}

export interface RotationSlot {
  /** Required for FIXED_WEEKDAY; ignored for ROUND_ROBIN. */
  weekday?: Weekday;
  /** Position in the roster. Required for ROUND_ROBIN; ties broken by index. */
  orderIndex: number;
  assigneeId: string;
}

export interface Rotation {
  id: string;
  kind: RotationKind;
  /** The date the round-robin started counting from. */
  anchorDay: Date;
  slots: RotationSlot[];
}

export type OverrideKind = "COVER" | "SWAP";

export interface AssignmentOverride {
  day: Date;
  assigneeId: string;
  kind: OverrideKind;
  /** For SWAP: the other date in the exchange. */
  swappedWithDay?: Date;
  /** Who the roster originally had. Kept so debt is computable after the fact. */
  replacedAssigneeId?: string;
  note?: string;
}

export type AssignmentSource = "ROSTER" | "COVER" | "SWAP" | "UNASSIGNED";

export interface Assignment {
  day: Date;
  assigneeId: string | null;
  source: AssignmentSource;
  /** Who the rotation itself points at, before any override. */
  rosterAssigneeId: string | null;
  reason: string;
}

/**
 * The roster's own answer for a day, ignoring overrides.
 *
 * `occurrenceIndex` is how many times the activity has happened since the
 * anchor (0 for the first). The caller computes it from the recurrence — the
 * rotation deliberately doesn't know the schedule, so a rotation can be shared
 * between two activities that run on different days.
 */
export function rosterAssigneeFor(
  rotation: Rotation,
  day: Date,
  occurrenceIndex: number
): string | null {
  if (rotation.slots.length === 0) return null;

  if (rotation.kind === "FIXED_WEEKDAY") {
    const wd = weekdayIndex(day);
    const slot = rotation.slots
      .filter((s) => s.weekday === wd)
      .sort((a, b) => a.orderIndex - b.orderIndex)[0];
    return slot?.assigneeId ?? null;
  }

  const roster = [...rotation.slots].sort((a, b) => a.orderIndex - b.orderIndex);
  if (occurrenceIndex < 0) return null;
  return roster[occurrenceIndex % roster.length].assigneeId;
}

/** The roster's answer, then any override applied on top, with the reason. */
export function resolveAssignment(
  rotation: Rotation,
  day: Date,
  occurrenceIndex: number,
  overrides: AssignmentOverride[] = [],
  nameOf: (assigneeId: string) => string = (id) => id
): Assignment {
  const rosterAssigneeId = rosterAssigneeFor(rotation, day, occurrenceIndex);
  const key = dayKey(day);
  const override = overrides.find((o) => dayKey(o.day) === key);

  if (!override) {
    return {
      day,
      assigneeId: rosterAssigneeId,
      source: rosterAssigneeId ? "ROSTER" : "UNASSIGNED",
      rosterAssigneeId,
      reason: rosterAssigneeId
        ? `${nameOf(rosterAssigneeId)} by the rotation`
        : "Nobody is assigned — the rotation has no slot for this day",
    };
  }

  const replaced = override.replacedAssigneeId ?? rosterAssigneeId;
  const reason =
    override.kind === "SWAP" && override.swappedWithDay
      ? `${nameOf(override.assigneeId)} — swapped with ${
          replaced ? nameOf(replaced) : "the roster"
        } for ${dayKey(override.swappedWithDay)}`
      : `${nameOf(override.assigneeId)} is covering${
          replaced ? ` for ${nameOf(replaced)}` : ""
        }`;

  return {
    day,
    assigneeId: override.assigneeId,
    source: override.kind,
    rosterAssigneeId,
    reason: override.note ? `${reason} (${override.note})` : reason,
  };
}

/**
 * Build the two override records that exchange two dates.
 *
 * Returns null when either date has no roster assignee — there is nothing to
 * exchange, and writing a half-swap would leave a record that can never be
 * reconciled. The caller should fall back to a COVER and say so.
 */
export function planSwap(
  rotation: Rotation,
  dayA: Date,
  indexA: number,
  dayB: Date,
  indexB: number,
  note?: string
): [AssignmentOverride, AssignmentOverride] | null {
  const a = rosterAssigneeFor(rotation, dayA, indexA);
  const b = rosterAssigneeFor(rotation, dayB, indexB);
  if (!a || !b || a === b) return null;

  return [
    {
      day: dayA,
      assigneeId: b,
      kind: "SWAP",
      swappedWithDay: dayB,
      replacedAssigneeId: a,
      note,
    },
    {
      day: dayB,
      assigneeId: a,
      kind: "SWAP",
      swappedWithDay: dayA,
      replacedAssigneeId: b,
      note,
    },
  ];
}

export function planCover(
  rotation: Rotation,
  day: Date,
  occurrenceIndex: number,
  coveringAssigneeId: string,
  note?: string
): AssignmentOverride {
  return {
    day,
    assigneeId: coveringAssigneeId,
    kind: "COVER",
    replacedAssigneeId: rosterAssigneeFor(rotation, day, occurrenceIndex) ?? undefined,
    note,
  };
}

export interface TurnBalance {
  assigneeId: string;
  /** Turns the rotation gave them. */
  owed: number;
  /** Turns they actually took, after covers and swaps. */
  taken: number;
  /**
   * taken - owed. Positive means they've done more than their share; negative
   * means someone has been covering for them. A swap moves both numbers, so it
   * nets to zero — which is exactly the difference from a cover.
   */
  net: number;
}

/** Fairness over a set of already-resolved assignments. */
export function debtFor(assignments: Assignment[]): TurnBalance[] {
  const balances = new Map<string, TurnBalance>();
  const ensure = (id: string) => {
    let row = balances.get(id);
    if (!row) {
      row = { assigneeId: id, owed: 0, taken: 0, net: 0 };
      balances.set(id, row);
    }
    return row;
  };

  for (const a of assignments) {
    if (a.rosterAssigneeId) ensure(a.rosterAssigneeId).owed += 1;
    if (a.assigneeId) ensure(a.assigneeId).taken += 1;
  }
  for (const row of balances.values()) row.net = row.taken - row.owed;

  return [...balances.values()].sort((x, y) => x.net - y.net);
}

/**
 * How many times the activity has occurred between the anchor and `day`,
 * given the days it occurs on. This is the round-robin's index input, and it
 * is the caller's job to pass the SAME occurrence list every time — that's
 * what makes the rotation reproducible.
 */
export function occurrenceIndexFor(occurrenceDays: Date[], day: Date): number {
  const key = dayKey(day);
  const sorted = [...occurrenceDays].sort((a, b) => a.getTime() - b.getTime());
  return sorted.findIndex((d) => dayKey(d) === key);
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = parseDay(a);
  const db = parseDay(b);
  return Boolean(da && db && dayKey(da) === dayKey(db));
}
