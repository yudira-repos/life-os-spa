import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isServiceRequest } from "@/lib/dayos/service-auth";

// Where the FastAPI LifeOS reads a person's WhatsApp number and what they have
// asked to receive.
//
// DayOS owns notification preferences — one place a person edits them, in the
// app they already log into. The two services have separate user tables, so
// email is the join key. It is the only identifier both sides already have,
// and it is why this endpoint takes an email rather than an id.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isServiceRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const member = await db.householdMember.findFirst({
    where: { user: { email } },
    include: { channels: true, notificationPrefs: true },
  });

  if (!member) {
    // Not an error. A LifeOS user who is not in a DayOS household simply has
    // no WhatsApp preferences, and the caller should carry on with its other
    // channels rather than treat this as a failure.
    return NextResponse.json({ found: false, whatsapp: null, prefs: null });
  }

  const whatsapp = member.channels.find((c) => c.channel === "WHATSAPP");
  const prefs = member.notificationPrefs;

  return NextResponse.json({
    found: true,
    memberId: member.id,
    name: member.name,
    whatsapp: whatsapp
      ? {
          address: whatsapp.address,
          verified: whatsapp.verified,
          quietFromMinute: whatsapp.quietFromMinute,
          quietToMinute: whatsapp.quietToMinute,
        }
      : null,
    // Defaults mirror the schema, so a member who has never opened the
    // settings page still behaves predictably.
    prefs: {
      calendarBrief: prefs?.calendarBrief ?? true,
      leaveNowAlerts: prefs?.leaveNowAlerts ?? true,
      aiNewsBrief: prefs?.aiNewsBrief ?? false,
    },
  });
}
