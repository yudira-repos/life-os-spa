import { NextResponse } from "next/server";
import { getCurrentHousehold } from "@/lib/session";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const household = await getCurrentHousehold();
  if (!household) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const { childId, careerKey, action } = body as {
    childId: string;
    careerKey: string;
    action: "add" | "remove";
  };

  if (!childId || !careerKey || !action) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });

  if (action === "remove") {
    await db.childCareerInterest.deleteMany({ where: { childId, careerKey } });
    return NextResponse.json({ ok: true });
  }

  const record = await db.childCareerInterest.upsert({
    where: { childId_careerKey: { childId, careerKey } },
    create: { childId, careerKey },
    update: {},
  });

  return NextResponse.json(record);
}
