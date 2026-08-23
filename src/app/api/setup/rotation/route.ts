import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { name, slots } = body;

  // Validate inputs
  if (!name?.trim()) {
    return NextResponse.json(
      { error: "Rotation name is required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(slots) || slots.length === 0) {
    return NextResponse.json(
      { error: "At least one slot is required" },
      { status: 400 }
    );
  }

  // Validate each slot
  for (const slot of slots) {
    if (slot.weekday < 0 || slot.weekday > 6) {
      return NextResponse.json(
        { error: `Invalid weekday: ${slot.weekday}` },
        { status: 400 }
      );
    }
    if (slot.memberId) {
      const member = await db.householdMember.findFirst({
        where: { id: slot.memberId, householdId: guard.household.id },
      });
      if (!member) {
        return NextResponse.json(
          { error: `Invalid member in slot for weekday ${slot.weekday}` },
          { status: 400 }
        );
      }
    }
  }

  try {
    const rotation = await db.rotation.create({
      data: {
        householdId: guard.household.id,
        name: name.trim(),
        kind: "FIXED_WEEKDAY",
        anchorDay: new Date(),
      },
    });

    // Create rotation slots
    const createdSlots = await Promise.all(
      slots.map((slot, index) =>
        db.rotationSlot.create({
          data: {
            rotationId: rotation.id,
            weekday: slot.weekday,
            orderIndex: index,
            memberId: slot.memberId || null,
          },
        })
      )
    );

    return NextResponse.json(
      {
        ...rotation,
        slots: createdSlots,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating rotation:", error);
    return NextResponse.json(
      { error: "Failed to create rotation" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  try {
    const rotations = await db.rotation.findMany({
      where: { householdId: guard.household.id },
      include: {
        slots: {
          include: {
            member: true,
          },
          orderBy: { weekday: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(rotations);
  } catch (error) {
    console.error("Error fetching rotations:", error);
    return NextResponse.json(
      { error: "Failed to fetch rotations" },
      { status: 500 }
    );
  }
}
