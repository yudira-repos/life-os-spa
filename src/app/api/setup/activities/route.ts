import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";
import { dayContext } from "@/lib/dayos/service";
import { todayIn } from "@/lib/dayos/time";

/**
 * Wire a school run into the carpool group automatically.
 *
 * Marking an activity as drop-off or pickup IS the statement that it's a shared
 * run, so making somebody then find a separate screen to link its rotation to a
 * group would be a step that exists only because of how the tables are shaped.
 * The group is created on first use and the rotation is pointed at it here.
 */
async function linkRotationToCarpoolGroup(householdId: string, rotationId: string | null) {
  if (!rotationId) return;

  const group =
    (await db.coordinationGroup.findFirst({
      where: { householdId, kind: "CARPOOL" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })) ??
    (await db.coordinationGroup.create({
      data: { householdId, kind: "CARPOOL", name: "School carpool" },
      select: { id: true },
    }));

  await db.rotation.updateMany({
    where: { id: rotationId, householdId, groupId: null },
    data: { groupId: group.id },
  });
}

export async function POST(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const {
    name,
    category,
    subjectMemberId,
    placeId,
    startMinute,
    durationMinutes,
    weekdays,
    requiresConfirmation,
    rotationId,
    carpoolRole,
  } = body;

  // Validate inputs
  if (!name?.trim()) {
    return NextResponse.json(
      { error: "Activity name is required" },
      { status: 400 }
    );
  }

  if (startMinute < 0 || startMinute >= 1440) {
    return NextResponse.json(
      { error: "Start time must be a valid time in the day" },
      { status: 400 }
    );
  }

  if (durationMinutes && (durationMinutes < 0 || durationMinutes > 1440)) {
    return NextResponse.json(
      { error: "Duration must be between 0 and 1440 minutes" },
      { status: 400 }
    );
  }

  // Validate weekdays format (CSV of 0-6)
  if (weekdays && weekdays.trim()) {
    const days = weekdays.split(",").map((d: string) => d.trim());
    if (!days.every((d: string) => /^\d$/.test(d) && parseInt(d) >= 0 && parseInt(d) <= 6)) {
      return NextResponse.json(
        { error: "Weekdays must be 0-6 (Sunday=0)" },
        { status: 400 }
      );
    }
  }

  // If subject member is specified, verify they belong to this household
  if (subjectMemberId) {
    const member = await db.householdMember.findFirst({
      where: { id: subjectMemberId, householdId: guard.household.id },
    });
    if (!member) {
      return NextResponse.json(
        { error: "Invalid subject member" },
        { status: 400 }
      );
    }
  }

  // If place is specified, verify it belongs to this household
  if (placeId) {
    const place = await db.place.findFirst({
      where: { id: placeId, householdId: guard.household.id },
    });
    if (!place) {
      return NextResponse.json(
        { error: "Invalid place" },
        { status: 400 }
      );
    }
  }

  // If rotation is specified, verify it belongs to this household
  if (rotationId) {
    const rotation = await db.rotation.findFirst({
      where: { id: rotationId, householdId: guard.household.id },
    });
    if (!rotation) {
      return NextResponse.json(
        { error: "Invalid rotation" },
        { status: 400 }
      );
    }
  }

  // effectiveFrom is a CALENDAR DAY, not an instant. Storing `new Date()` here
  // put a mid-afternoon timestamp in the column, which is strictly greater than
  // the UTC-midnight day materializeDay() compares against — so an activity
  // added today could never appear on today's plan, and one added after ~5pm
  // Pacific landed on tomorrow's UTC date and slipped a whole day.
  const ctx = await dayContext(guard.household.id);

  try {
    const activity = await db.activity.create({
      data: {
        householdId: guard.household.id,
        name: name.trim(),
        category: category || "OTHER",
        status: "ACTIVE",
        subjectMemberId: subjectMemberId || null,
        placeId: placeId || null,
        rotationId: rotationId || null,
        startMinute,
        durationMinutes: durationMinutes || null,
        weekdays: weekdays?.trim() || "",
        effectiveFrom: todayIn(ctx.timeZone),
        effectiveTo: null,
        travelRequired: true,
        requiresConfirmation: requiresConfirmation || false,
        // DROPOFF | PICKUP. Only set for a shared school run — it is what
        // labels the run in the message the carpool group reads.
        carpoolRole:
          carpoolRole === "DROPOFF" || carpoolRole === "PICKUP" ? carpoolRole : null,
      },
      include: {
        place: true,
        subjectMember: true,
        rotation: true,
      },
    });

    if (activity.carpoolRole) {
      await linkRotationToCarpoolGroup(guard.household.id, activity.rotationId);
    }

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    console.error("Error creating activity:", error);
    return NextResponse.json(
      { error: "Failed to create activity" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  try {
    const activities = await db.activity.findMany({
      where: { householdId: guard.household.id },
      include: {
        place: true,
        subjectMember: true,
        rotation: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { id, rotationId, carpoolRole } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Activity ID is required" },
      { status: 400 }
    );
  }

  // Verify activity belongs to this household
  const activity = await db.activity.findFirst({
    where: { id, householdId: guard.household.id },
  });

  if (!activity) {
    return NextResponse.json(
      { error: "Activity not found" },
      { status: 404 }
    );
  }

  // If rotation is specified, verify it belongs to this household
  if (rotationId) {
    const rotation = await db.rotation.findFirst({
      where: { id: rotationId, householdId: guard.household.id },
    });
    if (!rotation) {
      return NextResponse.json(
        { error: "Invalid rotation" },
        { status: 400 }
      );
    }
  }

  try {
    const updated = await db.activity.update({
      where: { id },
      data: {
        rotationId: rotationId || null,
        ...(carpoolRole === undefined
          ? {}
          : {
              carpoolRole:
                carpoolRole === "DROPOFF" || carpoolRole === "PICKUP" ? carpoolRole : null,
            }),
      },
      include: {
        place: true,
        subjectMember: true,
        rotation: true,
      },
    });

    if (updated.carpoolRole) {
      await linkRotationToCarpoolGroup(guard.household.id, updated.rotationId);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating activity:", error);
    return NextResponse.json(
      { error: "Failed to update activity" },
      { status: 500 }
    );
  }
}
