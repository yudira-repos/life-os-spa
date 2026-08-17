import { NextResponse } from "next/server";
import { guardFinancialRoute } from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";
import { assertItemInHousehold } from "@/lib/financialos/authz";
import { createLinkToken, PlaidNotConfiguredError } from "@/lib/financialos/plaid";
import { encryptionConfigured } from "@/lib/financialos/crypto";
import { accessTokenFor } from "@/lib/financialos/sync";

export async function POST(request: Request) {
  const guard = await guardFinancialRoute("LINK_ITEM_START");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  // Refuse to start a link flow we couldn't securely finish. Better to fail
  // here with a clear message than to obtain an access token and then have
  // nowhere safe to put it.
  if (!encryptionConfigured()) {
    return NextResponse.json(
      {
        error:
          "FINANCIAL_ENC_KEY is not configured. Bank credentials can't be stored securely, so linking is disabled. Generate a key with: openssl rand -base64 32",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const reauthItemId: string | undefined = body?.itemId;

  try {
    // Update mode: re-authenticating an existing Item after LOGIN_REQUIRED.
    let accessToken: string | undefined;
    if (reauthItemId) {
      const item = await assertItemInHousehold(household.id, reauthItemId);
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      accessToken = accessTokenFor(item);
    }

    const linkToken = await createLinkToken({
      clientUserId: user.id,
      householdName: household.name,
      accessToken,
    });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "LINK_ITEM_START",
      resource: "ITEM",
      resourceId: reauthItemId ?? null,
      meta: { mode: reauthItemId ? "update" : "new" },
    });

    return NextResponse.json({ linkToken });
  } catch (error) {
    if (error instanceof PlaidNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[financialos] link token failed", error);
    return NextResponse.json(
      { error: "Could not start the bank connection. Try again in a moment." },
      { status: 502 }
    );
  }
}
