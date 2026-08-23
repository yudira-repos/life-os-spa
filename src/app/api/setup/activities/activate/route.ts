import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";

export async function POST() {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  try {
    const result = await db.activity.updateMany({
      where: { 
        householdId: guard.household.id,
        status: { not: "ACTIVE" }
      },
      data: { status: "ACTIVE" },
    });

    return NextResponse.json({
      success: true,
      activated: result.count,
      message: `${result.count} activity(ies) activated`,
    });
  } catch (error) {
    console.error("Error activating activities:", error);
    return NextResponse.json(
      { error: "Failed to activate activities" },
      { status: 500 }
    );
  }
}
