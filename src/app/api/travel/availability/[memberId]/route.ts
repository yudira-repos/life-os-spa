import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute } from "@/lib/travelos/authz";

// PTO balances. PLAN tier — an adult's leave balance is their business, not
// household-wide information, and it feeds directly into the ranking.

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { memberId } = await params;
  const member = await db.householdMember.findFirst({
    where: {
      id: memberId,
      householdId: guard.household.id,
      role: { in: ["OWNER", "ADULT"] },
    },
  });
  if (!member) {
    return NextResponse.json({ error: "Adult member not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const perYear = clamp(body?.ptoDaysPerYear, 0, 365, 15);
  const data = {
    ptoDaysPerYear: perYear,
    // Remaining can't exceed the annual allowance — a typo there would
    // silently make windows look affordable that aren't.
    ptoDaysRemaining: Math.min(clamp(body?.ptoDaysRemaining, 0, 365, perYear), perYear),
    notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 300) || null : null,
  };

  await db.travelAvailability.upsert({
    where: { memberId: member.id },
    create: { memberId: member.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}
