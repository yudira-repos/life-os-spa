import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardFinancialRoute, requireString } from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";
import { encryptSecret } from "@/lib/financialos/crypto";
import {
  exchangePublicToken,
  getItemInstitution,
  PlaidNotConfiguredError,
} from "@/lib/financialos/plaid";
import { syncItem } from "@/lib/financialos/sync";

// Step two of Plaid Link: the browser hands us a short-lived public token,
// we exchange it server-side for the long-lived access token.
//
// The access token NEVER goes back to the browser and is never written in
// plaintext. It's encrypted before it touches the database, in the same
// statement that creates the row.

export async function POST(request: Request) {
  const guard = await guardFinancialRoute("LINK_ITEM_COMPLETE");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  try {
    const body = await request.json();
    const publicToken = requireString(body?.publicToken, "publicToken", 500);

    const { accessToken, itemId } = await exchangePublicToken(publicToken);

    // Same institution linked twice — update rather than creating a duplicate
    // Item that would double-count every balance.
    const existing = await db.plaidItem.findUnique({ where: { itemId } });
    if (existing && existing.householdId !== household.id) {
      return NextResponse.json(
        { error: "That account is already linked to a different household." },
        { status: 409 }
      );
    }

    const institution = await getItemInstitution(accessToken).catch(() => ({
      institutionId: null,
      institutionName: null,
      consentExpiresAt: null,
    }));

    const item = await db.plaidItem.upsert({
      where: { itemId },
      create: {
        householdId: household.id,
        itemId,
        accessTokenEnc: encryptSecret(accessToken),
        institutionId: institution.institutionId,
        institutionName: institution.institutionName,
        consentExpiresAt: institution.consentExpiresAt,
        linkedByUserId: user.id,
        status: "GOOD",
      },
      update: {
        accessTokenEnc: encryptSecret(accessToken),
        institutionName: institution.institutionName,
        consentExpiresAt: institution.consentExpiresAt,
        status: "GOOD",
        statusDetail: null,
        // A re-link means the old cursor may be invalid; a null cursor makes
        // the next sync a full refresh, which the upserts make safe.
        cursor: null,
      },
    });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "LINK_ITEM_COMPLETE",
      resource: "ITEM",
      resourceId: item.id,
      meta: { institutionId: institution.institutionId },
    });

    // First sync inline so the user sees accounts immediately rather than an
    // empty page that fills in later.
    const result = await syncItem(item);

    return NextResponse.json({
      itemId: item.id,
      institutionName: item.institutionName,
      sync: result,
    });
  } catch (error) {
    if (error instanceof PlaidNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[financialos] token exchange failed", error);
    return NextResponse.json(
      { error: "Could not finish connecting that account." },
      { status: 502 }
    );
  }
}
