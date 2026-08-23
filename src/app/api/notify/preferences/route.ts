import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireDayAccess } from "@/lib/dayos/authz";

// A person's own notification settings.
//
// Session-authenticated, not service-authenticated: this is the surface a
// human uses. A member may only ever change their OWN row — an adult must not
// be able to silence another adult's departure alerts from a settings page,
// and a coordinator role does not change that.

export const dynamic = "force-dynamic";

/** E.164. WhatsApp will not accept anything else, so reject it here where it can be explained. */
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export async function GET() {
  const access = await requireDayAccess();
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: 401 });

  const [channel, prefs] = await Promise.all([
    db.memberChannel.findUnique({
      where: { memberId_channel: { memberId: access.member.id, channel: "WHATSAPP" } },
    }),
    db.memberNotificationPrefs.findUnique({ where: { memberId: access.member.id } }),
  ]);

  return NextResponse.json({
    whatsappNumber: channel?.address ?? "",
    quietFromMinute: channel?.quietFromMinute ?? null,
    quietToMinute: channel?.quietToMinute ?? null,
    calendarBrief: prefs?.calendarBrief ?? true,
    leaveNowAlerts: prefs?.leaveNowAlerts ?? true,
    aiNewsBrief: prefs?.aiNewsBrief ?? false,
  });
}

export async function PUT(request: Request) {
  const access = await requireDayAccess();
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const memberId = access.member.id;
  const raw = typeof body.whatsappNumber === "string" ? body.whatsappNumber : "";

  if (raw.trim()) {
    const address = normalizePhone(raw);
    if (!address) {
      return NextResponse.json(
        { error: "Enter the number with its country code, e.g. +1 415 555 0100." },
        { status: 400 }
      );
    }
    const quietFrom = Number.isInteger(body.quietFromMinute) ? body.quietFromMinute : null;
    const quietTo = Number.isInteger(body.quietToMinute) ? body.quietToMinute : null;

    await db.memberChannel.upsert({
      where: { memberId_channel: { memberId, channel: "WHATSAPP" } },
      create: {
        memberId,
        channel: "WHATSAPP",
        address,
        quietFromMinute: quietFrom,
        quietToMinute: quietTo,
        // Nothing has proved this number reaches this person yet. Recorded
        // honestly rather than assumed — the first delivery failure is how a
        // typo surfaces, and the UI says so.
        verified: false,
      },
      update: { address, quietFromMinute: quietFrom, quietToMinute: quietTo },
    });
  } else {
    // Clearing the number is how someone turns WhatsApp off entirely.
    await db.memberChannel.deleteMany({ where: { memberId, channel: "WHATSAPP" } });
  }

  const toggles = {
    calendarBrief: body.calendarBrief !== false,
    leaveNowAlerts: body.leaveNowAlerts !== false,
    aiNewsBrief: body.aiNewsBrief === true,
  };

  await db.memberNotificationPrefs.upsert({
    where: { memberId },
    create: { memberId, ...toggles },
    update: toggles,
  });

  return NextResponse.json({ saved: true, ...toggles });
}
