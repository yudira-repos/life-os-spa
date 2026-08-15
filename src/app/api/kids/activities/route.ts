import { NextResponse } from "next/server";
import { getCurrentHousehold } from "@/lib/session";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const household = await getCurrentHousehold();
  if (!household) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const { childId, activityKey, status } = body as {
    childId: string;
    activityKey: string;
    status: "INTERESTED" | "ACTIVE" | "REMOVE";
  };

  if (!childId || !activityKey || !status) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });

  if (status === "REMOVE") {
    await db.childActivity.deleteMany({ where: { childId, activityKey } });
    return NextResponse.json({ ok: true });
  }

  const record = await db.childActivity.upsert({
    where: { childId_activityKey: { childId, activityKey } },
    create: { childId, activityKey, status },
    update: { status },
  });

  return NextResponse.json(record);
}
