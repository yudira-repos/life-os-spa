import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute, assertWindowInHousehold } from "@/lib/travelos/authz";

const STATUSES = ["SUGGESTED", "SHORTLISTED", "CONFIRMED", "DISMISSED"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const window = await assertWindowInHousehold(guard.household.id, id);
  if (!window) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  if (!STATUSES.includes(body?.status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }

  await db.travelWindow.update({
    where: { id: window.id },
    data: { status: body.status },
  });

  return NextResponse.json({ ok: true });
}
