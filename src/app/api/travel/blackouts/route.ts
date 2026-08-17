import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute } from "@/lib/travelos/authz";
import { parseDay } from "@/lib/travelos/dates";

export async function POST(request: Request) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const startDate = parseDay(body?.startDate);
  const endDate = parseDay(body?.endDate) ?? startDate;

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Both dates are required." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  }

  let memberId: string | null = null;
  if (typeof body?.memberId === "string" && body.memberId) {
    const member = await db.householdMember.findFirst({
      where: { id: body.memberId, householdId: guard.household.id },
    });
    if (!member) return NextResponse.json({ error: "Unknown member" }, { status: 400 });
    memberId = member.id;
  }

  const blackout = await db.blackoutPeriod.create({
    data: {
      householdId: guard.household.id,
      memberId,
      startDate,
      endDate,
      reason: typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) || null : null,
    },
  });

  return NextResponse.json({ id: blackout.id });
}
