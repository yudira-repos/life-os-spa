import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";

export async function GET() {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  try {
    const members = await db.householdMember.findMany({
      where: { householdId: guard.household.id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(members);
  } catch (error) {
    console.error("Error fetching household members:", error);
    return NextResponse.json(
      { error: "Failed to fetch household members" },
      { status: 500 }
    );
  }
}
