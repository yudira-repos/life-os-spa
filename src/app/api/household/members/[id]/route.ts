import { NextResponse } from "next/server";
import { getCurrentHousehold } from "@/lib/session";
import { db } from "@/lib/db";
import { SUPPORTED_GRADES } from "@/lib/kidsos/curriculum";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const household = await getCurrentHousehold();
  if (!household) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const member = await db.householdMember.findFirst({ where: { id, householdId: household.id } });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const data: { grade?: number | null; interests?: string | null } = {};

  if ("grade" in body) {
    const grade = body.grade === null || body.grade === "" ? null : Number(body.grade);
    if (grade !== null && !SUPPORTED_GRADES.includes(grade as (typeof SUPPORTED_GRADES)[number])) {
      return NextResponse.json({ error: "Grade must be 3-6" }, { status: 400 });
    }
    data.grade = grade;
  }

  if ("interests" in body) {
    data.interests = typeof body.interests === "string" ? body.interests.trim().slice(0, 300) : null;
  }

  const updated = await db.householdMember.update({ where: { id }, data });
  return NextResponse.json(updated);
}
