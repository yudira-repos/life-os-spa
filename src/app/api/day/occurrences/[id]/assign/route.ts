import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assertOccurrenceInHousehold, guardDayRoute } from "@/lib/dayos/authz";
import { reassignOccurrence, refreshDepartures, splitAssigneeKey } from "@/lib/dayos/service";

/**
 * Reassign one occurrence — "Divya is taking her today".
 *
 * Coordinator only: this commits another adult's afternoon, and it can point
 * at an external carpool parent who never signed up for LifeOS.
 *
 * Reassigning re-plans the departure, because the new person may be starting
 * from somewhere else entirely — the leave time that was right for a parent at
 * the office is wrong for one at home, and leaving the old number on screen
 * would be worse than showing none.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const occurrence = await assertOccurrenceInHousehold(guard.household.id, id);
  if (!occurrence) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { assignee?: string | null };
  const assignee = body.assignee ?? null;

  // Validate the target belongs to this household before writing it — an
  // assignment is the one field that can point at a person outside it.
  if (assignee) {
    const { memberId, contactId } = splitAssigneeKey(assignee);
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
        { error: "That person isn't part of this household." },
        { status: 400 }
      );
    }
  }

  const updated = await reassignOccurrence(occurrence.id, assignee);
  await refreshDepartures(guard.household.id, occurrence.day, new Date());

  const fresh = await db.activityOccurrence.findUnique({
    where: { id: updated.id },
    include: { responsibleMember: true, responsibleContact: true },
  });

  return NextResponse.json({
    id: updated.id,
    responsible:
      fresh?.responsibleMember?.name ?? fresh?.responsibleContact?.name ?? null,
    leaveAt: fresh?.leaveAt ?? null,
    travelMinutes: fresh?.travelMinutes ?? null,
    note: "Departure recalculated from the new person's starting point.",
  });
}
