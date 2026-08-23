import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { dayContext, materializeDay, occurrencesForDay } from "@/lib/dayos/service";
import { todayIn, zonedMinuteOfDay } from "@/lib/dayos/time";
import { parseDay } from "@/lib/travelos/dates";
import { composeCarpoolMessage, type CarpoolRun } from "@/lib/dayos/carpool";

// Today's school run, rendered for the carpool group's own thread.
//
// Called by the OpenClaw gateway's cron, not by a browser — so it is guarded
// by the shared secret OpenClaw already carries for the FastAPI LifeOS
// (X-LifeOS-Api-Key / OPENCLAW_API_SECRET) rather than by a session cookie.
// Reusing that secret is deliberate: one more secret to rotate is one more
// secret that quietly stops matching.
//
// The response is shaped { reply_text } to match the convention in
// openclaw/workspace/skills/lifeos/SKILL.md — the agent relays reply_text
// verbatim and composes nothing, so no model is ever between the rota and the
// group's understanding of who has pickup.

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.OPENCLAW_API_SECRET?.trim();
  // Fail CLOSED. An unset secret must not mean an open endpoint — this one
  // reads out a child's daily location and timing.
  if (!expected) return false;

  const provided = request.headers.get("x-lifeos-api-key")?.trim() ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const groupId = url.searchParams.get("group");
  const dayParam = url.searchParams.get("day");

  const group = await db.coordinationGroup.findFirst({
    where: groupId ? { id: groupId } : { broadcastEnabled: true },
    orderBy: { createdAt: "asc" },
  });

  if (!group) {
    return NextResponse.json(
      { error: "No carpool group is set up for broadcasting." },
      { status: 404 }
    );
  }

  const ctx = await dayContext(group.householdId);
  const now = new Date();
  const day = dayParam ? parseDay(dayParam) : todayIn(ctx.timeZone, now);
  if (!day) {
    return NextResponse.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  }

  // Build the day before reading it. The cron fires at 06:30 and nobody has
  // necessarily opened the app since the activities changed.
  await materializeDay(group.householdId, day);

  const rows = await occurrencesForDay(group.householdId, day);

  // Only this group's runs. An occurrence belongs to the carpool when its
  // activity is driven by a rotation that belongs to the group — the same
  // link the roster itself uses, so the message can never disagree with the
  // page.
  const activities = await db.activity.findMany({
    where: { householdId: group.householdId, rotation: { groupId: group.id } },
    select: { id: true, carpoolRole: true },
  });
  const roleByActivity = new Map(activities.map((a) => [a.id, a.carpoolRole]));

  const runs: CarpoolRun[] = rows
    .filter((row) => roleByActivity.has(row.activityId))
    .map((row) => ({
      kind: roleByActivity.get(row.activityId) === "PICKUP" ? "PICKUP" : "DROPOFF",
      responsibleName:
        row.responsibleMember?.name ?? row.responsibleContact?.name ?? null,
      startMinute: zonedMinuteOfDay(row.startAt, ctx.timeZone),
      source: row.assignmentSource,
      replacedName: null,
      note: null,
      cancelled: row.status === "CANCELLED",
      cancelledReason: row.notes,
    }));

  // Who the rota HAD, for the runs somebody is covering. Read from the
  // override rather than recomputed, so the message and the audit trail can
  // never drift apart.
  const covered = runs.some((r) => r.source === "SWAP" || r.source === "COVER");
  if (covered) {
    const overrides = await db.assignmentOverride.findMany({
      where: { rotation: { groupId: group.id }, day },
      include: { replacedMember: true },
    });
    const replacedContactIds = overrides
      .map((o) => o.replacedContactId)
      .filter((id): id is string => Boolean(id));
    const contacts = replacedContactIds.length
      ? await db.externalContact.findMany({
          where: { id: { in: replacedContactIds } },
          select: { id: true, name: true },
        })
      : [];
    const contactName = new Map(contacts.map((c) => [c.id, c.name]));

    // One override per rotation per day, and at most one run per rotation
    // per day, so first-match is exact rather than a guess.
    for (const run of runs) {
      if (run.source !== "SWAP" && run.source !== "COVER") continue;
      const override = overrides.shift();
      if (!override) break;
      run.replacedName =
        override.replacedMember?.name ??
        (override.replacedContactId
          ? (contactName.get(override.replacedContactId) ?? null)
          : null);
      run.note = override.note;
    }
  }

  const dayLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", // `day` is already the household's calendar day at UTC midnight.
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day);

  const message = composeCarpoolMessage({
    groupName: group.name,
    dayLabel,
    runs,
  });

  return NextResponse.json({
    reply_text: message.reply_text,
    empty: message.empty,
    unassigned: message.unassigned,
    group: { id: group.id, name: group.name, channel: group.channel, address: group.channelAddress },
    day: dayLabel,
  });
}
