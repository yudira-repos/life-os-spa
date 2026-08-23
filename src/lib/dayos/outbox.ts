import { db } from "@/lib/db";

// The WhatsApp handoff point.
//
// Why a queue at all: the WhatsApp session is a paired device inside the
// OpenClaw gateway, and the gateway's only HTTP endpoints are
// /v1/chat/completions and /v1/responses — both of which run an agent. There
// is no "send to channel" HTTP API, so a web server physically cannot push a
// WhatsApp message. The gateway pulls from here instead.
//
// The three rules this file exists to enforce:
//
//   1. Exactly once. A crash between the send and the acknowledgement is the
//      normal failure. Claiming is a conditional UPDATE, so two drains racing
//      cannot both take the same row.
//   2. Never late. A departure alert delivered after the departure is worse
//      than none — it is actively misleading. Urgent rows carry an expiry.
//   3. Never silently dropped. A row that fails keeps its error, so "why
//      didn't I get the alert" has an answer.

export type OutboxKind =
  | "BRIEF"
  | "AI_NEWS"
  | "DRIVE_NOW"
  | "PREPARE"
  | "RETIME"
  | "ASK"
  | "REMIND"
  | "ESCALATE"
  | "UNCOVERED"
  | "CARPOOL";

/** Kinds that must never arrive late, and the window they stay useful for. */
const EXPIRY_MINUTES: Partial<Record<OutboxKind, number>> = {
  DRIVE_NOW: 15,
  RETIME: 20,
  UNCOVERED: 30,
  PREPARE: 45,
};

export const URGENT_OUTBOX_KINDS: OutboxKind[] = ["DRIVE_NOW", "RETIME", "UNCOVERED"];

/** A claimed row this long without an ack is assumed orphaned by a crash. */
export const CLAIM_GRACE_MINUTES = 5;

export interface EnqueueRequest {
  toAddress: string;
  body: string;
  kind: OutboxKind;
  /**
   * Stable per logical message — "brief:<memberId>:2026-08-24", not a uuid.
   * A second enqueue with the same key is a no-op, which is what makes the
   * scheduler safe to run twice.
   */
  dedupeKey: string;
  now?: Date;
}

export type EnqueueResult =
  | { queued: true; id: string }
  | { queued: false; reason: "DUPLICATE" | "NO_ADDRESS" | "OPTED_OUT" };

/** Which preference toggle governs each kind. */
const PREF_FOR_KIND: Record<OutboxKind, "calendarBrief" | "leaveNowAlerts" | "aiNewsBrief" | null> = {
  BRIEF: "calendarBrief",
  AI_NEWS: "aiNewsBrief",
  DRIVE_NOW: "leaveNowAlerts",
  PREPARE: "leaveNowAlerts",
  RETIME: "leaveNowAlerts",
  ASK: "leaveNowAlerts",
  REMIND: "leaveNowAlerts",
  ESCALATE: "leaveNowAlerts",
  UNCOVERED: "leaveNowAlerts",
  // A group post is not addressed to a household member, so no personal
  // preference governs it. Group broadcasting is controlled by the group's
  // own broadcastEnabled flag instead.
  CARPOOL: null,
};

/**
 * Does the person at this address still want this kind of message?
 *
 * Enforced HERE rather than at either call site, because this is the one
 * function both of them go through: DayOS calls it directly for departure
 * alerts, and the FastAPI LifeOS reaches it over HTTP for briefs. A preference
 * checked in only one of those places is a preference that silently doesn't
 * work half the time.
 *
 * An address with no matching member — a carpool group, a contact who is not
 * in the household — is allowed. Absence of a preference row is not opting out.
 */
async function optedOut(toAddress: string, kind: OutboxKind): Promise<boolean> {
  const pref = PREF_FOR_KIND[kind];
  if (!pref) return false;

  const channel = await db.memberChannel.findFirst({
    where: { channel: "WHATSAPP", address: toAddress },
    select: { member: { select: { notificationPrefs: true } } },
  });
  const prefs = channel?.member.notificationPrefs;
  // No channel row, or no preferences row, means defaults apply — and the
  // schema defaults are the source of truth for those.
  if (!channel) return false;
  if (!prefs) return pref === "aiNewsBrief";

  return prefs[pref] === false;
}

export async function enqueueWhatsapp(req: EnqueueRequest): Promise<EnqueueResult> {
  const to = req.toAddress?.trim();
  if (!to) return { queued: false, reason: "NO_ADDRESS" };

  if (await optedOut(to, req.kind)) return { queued: false, reason: "OPTED_OUT" };

  const now = req.now ?? new Date();
  const expiryMinutes = EXPIRY_MINUTES[req.kind];
  const urgent = URGENT_OUTBOX_KINDS.includes(req.kind);

  try {
    const row = await db.whatsappOutbox.create({
      data: {
        toAddress: to,
        body: req.body,
        kind: req.kind,
        urgent,
        dedupeKey: req.dedupeKey,
        expiresAt: expiryMinutes
          ? new Date(now.getTime() + expiryMinutes * 60_000)
          : null,
      },
    });
    return { queued: true, id: row.id };
  } catch {
    // Unique violation on dedupeKey. Already queued, already sent, or already
    // failed — all three mean "do not queue it again".
    return { queued: false, reason: "DUPLICATE" };
  }
}

export interface ClaimedMessage {
  id: string;
  to: string;
  body: string;
  kind: string;
}

/**
 * Take up to `limit` messages for delivery.
 *
 * Urgent first, then oldest first: with a backlog, "leave now" must not queue
 * behind a morning brief. Expired rows are retired in the same pass rather
 * than being sent — see rule 2.
 */
export async function claimPending(limit = 20, now: Date = new Date()): Promise<ClaimedMessage[]> {
  // Release rows a previous drain claimed and never acknowledged.
  await db.whatsappOutbox.updateMany({
    where: {
      status: "CLAIMED",
      claimedAt: { lt: new Date(now.getTime() - CLAIM_GRACE_MINUTES * 60_000) },
    },
    data: { status: "PENDING", claimedAt: null },
  });

  await db.whatsappOutbox.updateMany({
    where: { status: { in: ["PENDING", "CLAIMED"] }, expiresAt: { lt: now } },
    data: { status: "EXPIRED", lastError: "Expired before it could be delivered." },
  });

  const candidates = await db.whatsappOutbox.findMany({
    where: { status: "PENDING" },
    orderBy: [{ urgent: "desc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true, toAddress: true, body: true, kind: true },
  });

  const claimed: ClaimedMessage[] = [];
  for (const row of candidates) {
    // Conditional on status, so a concurrent drain loses the race rather than
    // sending the same message twice.
    const { count } = await db.whatsappOutbox.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "CLAIMED", claimedAt: now, attempts: { increment: 1 } },
    });
    if (count === 1) {
      claimed.push({ id: row.id, to: row.toAddress, body: row.body, kind: row.kind });
    }
  }
  return claimed;
}

export async function markSent(ids: string[], now: Date = new Date()): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await db.whatsappOutbox.updateMany({
    where: { id: { in: ids }, status: "CLAIMED" },
    data: { status: "SENT", sentAt: now, lastError: null },
  });
  return count;
}

/** Failed rows go back to PENDING so the next tick retries, up to MAX_ATTEMPTS. */
export const MAX_ATTEMPTS = 4;

export async function markFailed(
  failures: { id: string; error?: string }[]
): Promise<{ retrying: number; givenUp: number }> {
  let retrying = 0;
  let givenUp = 0;
  for (const failure of failures) {
    const row = await db.whatsappOutbox.findUnique({
      where: { id: failure.id },
      select: { attempts: true },
    });
    const exhausted = (row?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;
    await db.whatsappOutbox.updateMany({
      where: { id: failure.id, status: "CLAIMED" },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        claimedAt: null,
        lastError: failure.error?.slice(0, 500) ?? "Delivery failed.",
      },
    });
    if (exhausted) givenUp += 1;
    else retrying += 1;
  }
  return { retrying, givenUp };
}
