import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentHousehold } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const household = await getCurrentHousehold();
  if (!user || !household) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json();
  const name: string = body.name?.trim();
  const role: string = body.role;
  if (!name || !["ADULT", "CHILD", "GUEST"].includes(role)) {
    return NextResponse.json({ error: "Invalid member" }, { status: 400 });
  }

  const grade = body.grade ? Number(body.grade) : null;

  const member = await db.householdMember.create({
    data: {
      householdId: household.id,
      name,
      role: role as "ADULT" | "CHILD" | "GUEST",
      birthdate: body.birthdate ? new Date(body.birthdate) : null,
      grade: role === "CHILD" && grade ? grade : null,
      interests: role === "CHILD" && body.interests ? String(body.interests).trim().slice(0, 300) : null,
    },
  });

  return NextResponse.json(member);
}
