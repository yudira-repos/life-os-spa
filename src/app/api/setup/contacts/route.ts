import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";

// The people outside the household who share a school run.
//
// Deliberately NOT HouseholdMember rows. A carpool parent has no login, is not
// governed by this household's roles, and must never be swept up by anything
// that iterates "the family". They can be assigned a run and named in a group
// message; that is the whole of their presence here.
//
// Contact details are optional. A parent whose only presence is a name still
// works — the rota shows who has the run, and LifeOS simply cannot message them.

const RELATIONSHIPS = new Set([
  "CARPOOL_PARENT", "GRANDPARENT", "SITTER", "COACH", "OTHER",
]);

export async function GET() {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  const contacts = await db.externalContact.findMany({
    where: { householdId: guard.household.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(contacts);
}

export async function POST(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const existing = await db.externalContact.findFirst({
    where: { householdId: guard.household.id, name },
  });
  if (existing) {
    return NextResponse.json(
      { error: `${name} is already in your contacts.` },
      { status: 409 }
    );
  }

  const relationship = RELATIONSHIPS.has(body.relationship)
    ? body.relationship
    : "CARPOOL_PARENT";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  const contact = await db.externalContact.create({
    data: {
      householdId: guard.household.id,
      name,
      relationship,
      phone: phone || null,
      // A phone number alone does not mean LifeOS may message them. Channel
      // stays NONE until somebody deliberately turns it on.
      channel: "NONE",
    },
  });

  return NextResponse.json(contact, { status: 201 });
}

export async function DELETE(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const contact = await db.externalContact.findFirst({
    where: { id, householdId: guard.household.id },
  });
  if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Refuse rather than cascade. Deleting a contact who holds slots would blank
  // those runs silently, and "nobody is assigned to Wednesday pickup" is not
  // something anyone should discover on a Wednesday.
  const slots = await db.rotationSlot.count({ where: { contactId: id } });
  if (slots > 0) {
    return NextResponse.json(
      {
        error: `${contact.name} is on ${slots} rotation slot${slots === 1 ? "" : "s"}. Remove them from the rotation first.`,
      },
      { status: 409 }
    );
  }

  await db.externalContact.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
