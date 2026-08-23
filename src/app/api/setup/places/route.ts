import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { label, kind, address, parkingBufferMinutes } = body;

  // Validate inputs
  if (!label?.trim()) {
    return NextResponse.json(
      { error: "Place name is required" },
      { status: 400 }
    );
  }

  if (!address?.trim()) {
    return NextResponse.json(
      { error: "Address is required" },
      { status: 400 }
    );
  }

  if (parkingBufferMinutes < 0 || parkingBufferMinutes > 120) {
    return NextResponse.json(
      { error: "Parking buffer must be between 0 and 120 minutes" },
      { status: 400 }
    );
  }

  try {
    const place = await db.place.create({
      data: {
        householdId: guard.household.id,
        label: label.trim(),
        kind: kind || "CUSTOM",
        address: address.trim(),
        parkingBufferMinutes: parkingBufferMinutes || 0,
      },
    });

    return NextResponse.json(place, { status: 201 });
  } catch (error) {
    console.error("Error creating place:", error);
    return NextResponse.json(
      { error: "Failed to create place" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  try {
    const places = await db.place.findMany({
      where: { householdId: guard.household.id },
      orderBy: { label: "asc" },
    });

    return NextResponse.json(places);
  } catch (error) {
    console.error("Error fetching places:", error);
    return NextResponse.json(
      { error: "Failed to fetch places" },
      { status: 500 }
    );
  }
}
