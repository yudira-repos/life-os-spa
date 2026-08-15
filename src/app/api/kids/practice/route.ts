import { NextResponse } from "next/server";
import { getCurrentHousehold } from "@/lib/session";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { recordPracticeResult } from "@/lib/kidsos/progress";

export async function POST(request: Request) {
  const household = await getCurrentHousehold();
  if (!household) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const { childId, conceptCode, correct, total, durationSeconds } = body as {
    childId: string;
    conceptCode: string;
    correct: number;
    total: number;
    durationSeconds: number;
  };

  if (!childId || !conceptCode || typeof correct !== "number" || typeof total !== "number") {
    return NextResponse.json({ error: "Invalid practice submission" }, { status: 400 });
  }

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });

  const result = await recordPracticeResult({
    childId,
    conceptCode,
    correct: Math.max(0, Math.min(correct, total)),
    total: Math.max(1, total),
    durationSeconds: Math.max(0, durationSeconds || 0),
  });

  return NextResponse.json(result);
}
