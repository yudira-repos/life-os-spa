import { NextResponse, type NextRequest } from "next/server";
import {
  assertOccurrenceInHousehold,
  canRespondToOccurrence,
  guardDayRoute,
} from "@/lib/dayos/authz";
import { setConfirmation } from "@/lib/dayos/service";

/**
 * Confirm or decline a responsibility.
 *
 * Guarded at VIEW level on purpose: the person a job is assigned to can always
 * answer for it, whatever their role. See canRespondToOccurrence() — a
 * teenager asked to walk their sibling home has to be able to say no, and a
 * silent no is the failure mode this whole module exists to prevent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const occurrence = await assertOccurrenceInHousehold(guard.household.id, id);
  if (!occurrence) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (
    !canRespondToOccurrence(guard.member, occurrence.responsibleMemberId, guard.canCoordinate)
  ) {
    return NextResponse.json(
      { error: "Only the person responsible, or an adult, can answer this." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    response?: string;
    note?: string;
  };
  const response = body.response?.toUpperCase();
  if (response !== "CONFIRM" && response !== "DECLINE") {
    return NextResponse.json(
      { error: "response must be CONFIRM or DECLINE." },
      { status: 400 }
    );
  }

  const updated = await setConfirmation(
    occurrence.id,
    response === "CONFIRM" ? "CONFIRMED" : "DECLINED",
    body.note
  );

  return NextResponse.json({
    id: updated.id,
    confirmationState: updated.confirmationState,
    // A decline is not the end of the interaction — the next tick asks the
    // group. Saying so here means the person who declined knows they've been
    // heard rather than wondering whether they've just abandoned their child.
    next:
      updated.confirmationState === "DECLINED"
        ? "Asking the rest of the group who can take it."
        : "Confirmed — you'll get a reminder when it's time to leave.",
  });
}
