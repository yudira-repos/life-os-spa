import { NextResponse } from "next/server";
import { guardTravelRoute } from "@/lib/travelos/authz";
import { regenerateWindows } from "@/lib/travelos/service";

export async function POST() {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const result = await regenerateWindows(guard.household.id);

  return NextResponse.json({
    windowCount: result.windows.length,
    created: result.created,
    updated: result.updated,
    childrenCovered: result.childrenCovered,
    // Said explicitly so an empty list is never a mystery.
    note:
      result.childrenCovered === 0
        ? "No confirmed school calendars yet — upload one and review the dates to get windows."
        : undefined,
  });
}
