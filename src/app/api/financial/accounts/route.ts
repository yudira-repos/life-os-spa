import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  guardFinancialRoute,
  requireString,
  optionalString,
  optionalInt,
  optionalFloat,
  oneOf,
  errorResponse,
} from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";
import { maskAccountNumber } from "@/lib/financialos/crypto";
import { parseMoneyToCents } from "@/lib/financialos/money";

const ACCOUNT_TYPES = ["DEPOSITORY", "CREDIT", "LOAN", "INVESTMENT", "OTHER"] as const;
const VISIBILITIES = ["HOUSEHOLD", "OWNER_ONLY"] as const;

// Manual accounts. Not everything can be linked — a 401(k) at a provider Plaid
// doesn't support, a rental property, a family loan — and a net worth figure
// that silently omits them is worse than no figure.
export async function POST(request: Request) {
  const guard = await guardFinancialRoute("CREATE_ACCOUNT");
  if (!guard.ok) return guard.response;
  const { user, household, member } = guard.context;

  try {
    const body = await request.json();

    const name = requireString(body?.name, "Account name", 120);
    const type = oneOf(body?.type, ACCOUNT_TYPES, "DEPOSITORY");
    const balanceCents =
      typeof body?.balance === "string"
        ? (parseMoneyToCents(body.balance) ?? 0)
        : optionalInt(body?.balanceCents, 0);

    // Liabilities are stored negative, so net worth is a plain sum everywhere.
    const isLiability = type === "CREDIT" || type === "LOAN";
    const normalizedBalance = isLiability
      ? -Math.abs(balanceCents)
      : balanceCents;

    const account = await db.financialAccount.create({
      data: {
        householdId: household.id,
        name,
        type,
        subtype: optionalString(body?.subtype, 60),
        // Only ever the last 4, even if someone pastes a full number in.
        mask: maskAccountNumber(optionalString(body?.accountNumber, 40)),
        currentBalanceCents: normalizedBalance,
        interestRateApr: optionalFloat(body?.interestRateApr, 0) || null,
        isManual: true,
        ownerMemberId: optionalString(body?.ownerMemberId, 40) ?? member.id,
        visibility: oneOf(body?.visibility, VISIBILITIES, "HOUSEHOLD"),
        includeInNetWorth: body?.includeInNetWorth !== false,
        lastRefreshedAt: new Date(),
      },
    });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "CREATE_ACCOUNT",
      resource: "ACCOUNT",
      resourceId: account.id,
      meta: { type, manual: true },
    });

    return NextResponse.json({ id: account.id });
  } catch (error) {
    return errorResponse(error);
  }
}
