// Composing the message a carpool group actually reads.
//
// This is deliberately NOT the household brief. brief.ts writes for people who
// live here: it knows their addresses, their prior commitments, when to leave
// and how bad the traffic is. A carpool group is four families who agreed to
// share a school run, and the only things they consented to share are WHO has
// the run and WHEN. So this module renders exactly that and nothing else — no
// leave times, no origins, no travel estimates, no home addresses.
//
// The output crosses two trust boundaries, which is why it is a pure function
// with no database access:
//
//   1. It is sent to people outside the household. Everything here is visible
//      to every other family, forever, in a thread nobody can unsend from.
//   2. It is relayed by an LLM agent (OpenClaw), which is told to send
//      `reply_text` verbatim. A model must never be the thing that decides
//      whether pickup is at 3:30 or 4:45.
//
// Format follows the existing OpenClaw house style in workspace/AGENTS.md:
// bullets only, no markdown tables, no code fences — those render as literal
// characters in WhatsApp and Telegram.

import { formatClock, type MinuteOfDay } from "@/lib/dayos/time";

/** One run — a drop-off or a pickup — as the group needs to see it. */
export interface CarpoolRun {
  kind: "DROPOFF" | "PICKUP";
  /** Whoever is actually doing it today, override applied. */
  responsibleName: string | null;
  startMinute: MinuteOfDay;
  /** ROSTER | COVER | SWAP | DEFAULT | MANUAL | UNASSIGNED */
  source: string;
  /** Who the rota had, when someone else is covering. */
  replacedName?: string | null;
  /** Free text from the override — "Aarti is travelling". */
  note?: string | null;
  /** True when the school calendar or a skip removed this run. */
  cancelled?: boolean;
  cancelledReason?: string | null;
}

export interface CarpoolMessageInput {
  groupName: string;
  /** "Monday 24 August" — rendered by the caller, which knows the zone. */
  dayLabel: string;
  runs: CarpoolRun[];
}

export interface CarpoolMessage {
  /** Sent verbatim to the group. Empty string means: send nothing. */
  reply_text: string;
  /** Nothing is scheduled — the caller should skip the post entirely. */
  empty: boolean;
  /** Runs with nobody against them. The reason a human should look. */
  unassigned: number;
}

function label(kind: CarpoolRun["kind"]): string {
  return kind === "DROPOFF" ? "Drop-off" : "Pickup";
}

/**
 * One line per run.
 *
 *   • Drop-off 8:00 AM — Divya
 *   • Pickup 3:30 PM — Pranav (covering for Nitya)
 *
 * A swap says so, because "Pranav" appearing on a Thursday with no explanation
 * is the exact thing that makes somebody text the group to check.
 */
export function renderRun(run: CarpoolRun): string {
  const head = `• ${label(run.kind)} ${formatClock(run.startMinute)}`;

  if (run.cancelled) {
    return `${head} — cancelled${run.cancelledReason ? ` (${run.cancelledReason})` : ""}`;
  }

  if (!run.responsibleName) {
    return `${head} — nobody assigned yet`;
  }

  let line = `${head} — ${run.responsibleName}`;

  if (run.source === "SWAP" && run.replacedName) {
    line += ` (swapped with ${run.replacedName})`;
  } else if (run.source === "COVER" && run.replacedName) {
    line += ` (covering for ${run.replacedName})`;
  }

  if (run.note) line += ` — ${run.note}`;
  return line;
}

export function composeCarpoolMessage(input: CarpoolMessageInput): CarpoolMessage {
  const runs = [...input.runs].sort((a, b) => a.startMinute - b.startMinute);
  const live = runs.filter((r) => !r.cancelled);

  // Nothing on today. Posting "no runs today" into a group every weekend and
  // school holiday is how a useful channel becomes one people mute.
  if (runs.length === 0 || live.length === 0) {
    return {
      reply_text: runs.length === 0 ? "" : buildCancelledOnly(input, runs),
      empty: runs.length === 0,
      unassigned: 0,
    };
  }

  const unassigned = live.filter((r) => !r.responsibleName).length;

  const lines = [`${input.groupName} — ${input.dayLabel}`, ""];
  for (const run of runs) lines.push(renderRun(run));

  if (unassigned > 0) {
    lines.push("");
    lines.push(
      unassigned === 1
        ? "One run has nobody against it — can someone pick it up?"
        : `${unassigned} runs have nobody against them — can someone pick them up?`
    );
  }

  return { reply_text: lines.join("\n"), empty: false, unassigned };
}

/**
 * Everything today was cancelled. Worth saying out loud exactly once — a
 * silent no-post is indistinguishable from the bot being broken, and on the
 * morning of a snow day that ambiguity costs somebody a wasted drive.
 */
function buildCancelledOnly(input: CarpoolMessageInput, runs: CarpoolRun[]): string {
  const reason = runs.find((r) => r.cancelledReason)?.cancelledReason;
  return [
    `${input.groupName} — ${input.dayLabel}`,
    "",
    `• No school run today${reason ? ` — ${reason}` : ""}`,
  ].join("\n");
}
