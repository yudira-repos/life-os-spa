import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";
import { splitAssigneeKey } from "@/lib/dayos/service";
import { parseDay, startOfDay } from "@/lib/travelos/dates";

// Rotations — the two shapes a real family rota actually takes.
//
//   FIXED_WEEKDAY  "Aarti has Mondays." The slot carries a weekday.
//   ROUND_ROBIN    "We take it in turns." The slots are an ORDER, and the
//                  anchor day is turn zero.
//
// Round robin is the one that needs care. The turn is counted from the anchor
// over the activity's own occurrence days, so the same Friday always resolves
// to the same person no matter when you ask. Which is why the anchor is
// required for a round robin and moving it re-phases the whole rota — the API
// says so rather than letting somebody discover it.
//
// Assignees are "member:<id>" or "contact:<id>", so a rota can mix the family
// with the other parents in the carpool. That mixing is the point.

interface SlotInput {
  weekday?: number | null;
  assignee: string;
}

export async function GET() {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  const rotations = await db.rotation.findMany({
    where: { householdId: guard.household.id },
    orderBy: { name: "asc" },
    include: {
      slots: {
        orderBy: { orderIndex: "asc" },
        include: { member: true, contact: true },
      },
    },
  });

  return NextResponse.json(
    rotations.map((rotation) => ({
      id: rotation.id,
      name: rotation.name,
      kind: rotation.kind,
      anchorDay: rotation.anchorDay,
      groupId: rotation.groupId,
      slots: rotation.slots.map((slot) => ({
        weekday: slot.weekday,
        orderIndex: slot.orderIndex,
        assignee: slot.memberId ? `member:${slot.memberId}` : `contact:${slot.contactId}`,
        name: slot.member?.name ?? slot.contact?.name ?? "Unassigned",
        external: Boolean(slot.contactId),
      })),
    }))
  );
}

export async function POST(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A rotation name is required." }, { status: 400 });

  const kind = body.kind === "ROUND_ROBIN" ? "ROUND_ROBIN" : "FIXED_WEEKDAY";
  const slots: SlotInput[] = Array.isArray(body.slots) ? body.slots : [];
  if (slots.length === 0) {
    return NextResponse.json({ error: "Assign at least one person." }, { status: 400 });
  }

  // A round robin's turn counting starts here, so it cannot be guessed.
  const anchorDay = kind === "ROUND_ROBIN" ? parseDay(body.anchorDay) : startOfDay(new Date());
  if (!anchorDay) {
    return NextResponse.json(
      { error: "A round robin needs a start date — the first day of the cycle." },
      { status: 400 }
    );
  }

  if (kind === "FIXED_WEEKDAY") {
    const seen = new Set<number>();
    for (const slot of slots) {
      if (!Number.isInteger(slot.weekday) || slot.weekday! < 0 || slot.weekday! > 6) {
        return NextResponse.json(
          { error: "Every slot in a weekday rotation needs a day." },
          { status: 400 }
        );
      }
      if (seen.has(slot.weekday!)) {
        return NextResponse.json(
          { error: "Two people are assigned to the same weekday." },
          { status: 400 }
        );
      }
      seen.add(slot.weekday!);
    }
  }

  // Everyone named has to belong to this household or its contacts — an
  // assignment is the one field that can point outside the family.
  const resolved: { memberId: string | null; contactId: string | null; weekday: number | null }[] = [];
  for (const slot of slots) {
    const { memberId, contactId } = splitAssigneeKey(slot.assignee ?? null);
    const found = memberId
      ? await db.householdMember.findFirst({
          where: { id: memberId, householdId: guard.household.id },
        })
      : contactId
        ? await db.externalContact.findFirst({
            where: { id: contactId, householdId: guard.household.id },
          })
        : null;
    if (!found) {
      return NextResponse.json(
        { error: "One of the people on this rotation isn't in your household or contacts." },
        { status: 400 }
      );
    }
    resolved.push({
      memberId,
      contactId,
      weekday: kind === "FIXED_WEEKDAY" ? (slot.weekday ?? null) : null,
    });
  }

  const groupId =
    typeof body.groupId === "string" && body.groupId
      ? (await db.coordinationGroup.findFirst({
          where: { id: body.groupId, householdId: guard.household.id },
          select: { id: true },
        }))?.id ?? null
      : null;

  const rotation = await db.rotation.create({
    data: {
      householdId: guard.household.id,
      name,
      kind,
      anchorDay,
      groupId,
      slots: {
        // orderIndex IS the turn order for a round robin, so it comes from the
        // order the person listed them in, not from anything incidental.
        create: resolved.map((slot, i) => ({ ...slot, orderIndex: i })),
      },
    },
    include: { slots: { orderBy: { orderIndex: "asc" }, include: { member: true, contact: true } } },
  });

  return NextResponse.json(
    {
      id: rotation.id,
      name: rotation.name,
      kind: rotation.kind,
      anchorDay: rotation.anchorDay,
      groupId: rotation.groupId,
      slots: rotation.slots.map((slot) => ({
        weekday: slot.weekday,
        orderIndex: slot.orderIndex,
        assignee: slot.memberId ? `member:${slot.memberId}` : `contact:${slot.contactId}`,
        name: slot.member?.name ?? slot.contact?.name ?? "Unassigned",
        external: Boolean(slot.contactId),
      })),
    },
    { status: 201 }
  );
}

export async function DELETE(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const rotation = await db.rotation.findFirst({
    where: { id, householdId: guard.household.id },
  });
  if (!rotation) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const activities = await db.activity.count({ where: { rotationId: id } });
  if (activities > 0) {
    return NextResponse.json(
      {
        error: `${activities} activit${activities === 1 ? "y uses" : "ies use"} this rotation. Point them elsewhere first.`,
      },
      { status: 409 }
    );
  }

  await db.rotation.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
