import { NextResponse } from "next/server";
import { isServiceRequest } from "@/lib/dayos/service-auth";
import {
  claimPending,
  enqueueWhatsapp,
  markFailed,
  markSent,
  type OutboxKind,
} from "@/lib/dayos/outbox";

// The WhatsApp outbox, from both ends.
//
//   POST  — the FastAPI LifeOS enqueues a brief or a news digest.
//   GET   — the OpenClaw gateway claims what is due.
//   PATCH — the gateway reports what it actually managed to send.
//
// GET is a claiming read, not a plain one: it mutates. That is deliberate, and
// it is why the drain is a single caller on a cron rather than anything a
// browser touches.

export const dynamic = "force-dynamic";

const KINDS = new Set<OutboxKind>([
  "BRIEF", "AI_NEWS", "DRIVE_NOW", "PREPARE", "RETIME",
  "ASK", "REMIND", "ESCALATE", "UNCOVERED", "CARPOOL",
]);

export async function POST(request: Request) {
  if (!isServiceRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { to, text, kind, dedupeKey } = body as Record<string, unknown>;

  if (typeof to !== "string" || !to.trim()) {
    return NextResponse.json({ error: "to is required" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof dedupeKey !== "string" || !dedupeKey.trim()) {
    // Required rather than generated: a caller that cannot name the message it
    // is sending cannot be protected from sending it twice.
    return NextResponse.json({ error: "dedupeKey is required" }, { status: 400 });
  }
  const resolvedKind = typeof kind === "string" && KINDS.has(kind as OutboxKind)
    ? (kind as OutboxKind)
    : "BRIEF";

  const result = await enqueueWhatsapp({
    toAddress: to,
    body: text,
    kind: resolvedKind,
    dedupeKey,
  });

  // A duplicate is success from the caller's point of view: the message the
  // caller wanted delivered is already on its way. So is an opt-out — the
  // recipient's preference was honoured, which is the system working. Only a
  // missing address is the caller's problem to fix.
  const ok = result.queued || result.reason === "DUPLICATE" || result.reason === "OPTED_OUT";
  return NextResponse.json(
    result.queued
      ? { queued: true, id: result.id }
      : { queued: false, reason: result.reason },
    { status: ok ? 200 : 400 }
  );
}

export async function GET(request: Request) {
  if (!isServiceRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limit = Math.min(
    Number(new URL(request.url).searchParams.get("limit") ?? 20) || 20,
    100
  );
  const messages = await claimPending(limit);
  return NextResponse.json({ messages, count: messages.length });
}

export async function PATCH(request: Request) {
  if (!isServiceRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const sent = Array.isArray(body.sent) ? body.sent.filter((x: unknown) => typeof x === "string") : [];
  const failed = Array.isArray(body.failed)
    ? body.failed
        .filter((f: unknown): f is { id: string; error?: string } =>
          Boolean(f) && typeof (f as { id?: unknown }).id === "string")
        .map((f: { id: string; error?: string }) => ({ id: f.id, error: f.error }))
    : [];

  const markedSent = await markSent(sent);
  const { retrying, givenUp } = await markFailed(failed);

  return NextResponse.json({ sent: markedSent, retrying, givenUp });
}
