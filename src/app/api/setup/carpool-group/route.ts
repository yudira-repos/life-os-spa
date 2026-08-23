import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";

// The carpool group: who is in it, and where its daily post goes.
//
// Broadcasting is off until somebody deliberately turns it on. The switch is
// separate from the address on purpose — pasting a group id should not start
// messaging four other families, and there is no undo on a sent WhatsApp
// message.

/** Baileys group ids look like "120363043211234567@g.us". */
const JID = /^[0-9]{10,25}@g\.us$/;

export async function GET() {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  const group = await db.coordinationGroup.findFirst({
    where: { householdId: guard.household.id, kind: "CARPOOL" },
    orderBy: { createdAt: "asc" },
    include: {
      members: { orderBy: { orderIndex: "asc" }, include: { member: true, contact: true } },
    },
  });

  if (!group) return NextResponse.json({ exists: false });

  return NextResponse.json({
    exists: true,
    id: group.id,
    name: group.name,
    channel: group.channel,
    channelAddress: group.channelAddress ?? "",
    broadcastEnabled: group.broadcastEnabled,
    members: group.members.map((m) => ({
      name: m.member?.name ?? m.contact?.name ?? "Unknown",
      external: Boolean(m.contactId),
    })),
  });
}

export async function PUT(request: Request) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "School carpool";
  const address = typeof body.channelAddress === "string" ? body.channelAddress.trim() : "";
  const wantsBroadcast = body.broadcastEnabled === true;

  if (address && !JID.test(address)) {
    return NextResponse.json(
      {
        error:
          "That doesn't look like a WhatsApp group id. It ends in @g.us — run `openclaw channels status whatsapp` to find it.",
      },
      { status: 400 }
    );
  }
  if (wantsBroadcast && !address) {
    return NextResponse.json(
      { error: "Add the group id before turning broadcasting on — there's nowhere to send it yet." },
      { status: 400 }
    );
  }

  const existing = await db.coordinationGroup.findFirst({
    where: { householdId: guard.household.id, kind: "CARPOOL" },
    orderBy: { createdAt: "asc" },
  });

  const data = {
    name,
    channel: address ? "WHATSAPP" : "NONE",
    channelAddress: address || null,
    broadcastEnabled: wantsBroadcast,
  };

  const group = existing
    ? await db.coordinationGroup.update({ where: { id: existing.id }, data })
    : await db.coordinationGroup.create({
        data: { householdId: guard.household.id, kind: "CARPOOL", ...data },
      });

  // Keep membership in step with everyone who actually holds a slot on one of
  // the group's rotations. Derived rather than hand-managed, so the roster and
  // the group can't drift apart.
  const slots = await db.rotationSlot.findMany({
    where: { rotation: { householdId: guard.household.id, groupId: group.id } },
    select: { memberId: true, contactId: true },
  });
  const seen = new Set<string>();
  const unique = slots.filter((s) => {
    const key = s.memberId ? `m:${s.memberId}` : `c:${s.contactId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await db.coordinationGroupMember.deleteMany({ where: { groupId: group.id } });
  for (const [i, slot] of unique.entries()) {
    await db.coordinationGroupMember.create({
      data: {
        groupId: group.id,
        memberId: slot.memberId,
        contactId: slot.contactId,
        orderIndex: i,
      },
    });
  }

  return NextResponse.json({
    saved: true,
    id: group.id,
    broadcastEnabled: group.broadcastEnabled,
    memberCount: unique.length,
  });
}
