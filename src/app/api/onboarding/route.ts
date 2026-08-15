import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { seedDefaultEntitlements } from "@/lib/entitlements";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const existing = await db.household.findFirst({ where: { ownerId: userId } });
  if (existing) {
    return NextResponse.json({ error: "Household already exists" }, { status: 409 });
  }

  const body = await request.json();
  const householdName: string = body.householdName?.trim();
  if (!householdName) {
    return NextResponse.json({ error: "Household name is required" }, { status: 400 });
  }

  const household = await db.household.create({
    data: { name: householdName, ownerId: userId },
  });

  // The signed-in user is always an OWNER member of their own household.
  await db.householdMember.create({
    data: { householdId: household.id, userId, name: "Me", role: "OWNER" },
  });

  const member = body.member as { name?: string; role?: string; birthdate?: string } | null;
  if (member?.name) {
    await db.householdMember.create({
      data: {
        householdId: household.id,
        name: member.name,
        role: member.role === "ADULT" ? "ADULT" : "CHILD",
        birthdate: member.birthdate ? new Date(member.birthdate) : null,
      },
    });
  }

  await seedDefaultEntitlements(household.id);

  return NextResponse.json({ householdId: household.id });
}
