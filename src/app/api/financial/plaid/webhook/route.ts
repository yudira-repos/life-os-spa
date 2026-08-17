import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncItem } from "@/lib/financialos/sync";
import { auditFinancial } from "@/lib/financialos/audit";

// Plaid's webhook. Note what's deliberately absent: any authentication of the
// caller beyond matching a known item_id.
//
// That's acceptable ONLY because this endpoint takes no action based on the
// payload's contents. It looks up an Item we already have, and re-syncs it
// from Plaid using our own stored credential. The worst an attacker can do by
// forging a webhook is cause us to fetch our own data slightly early.
//
// If this endpoint ever starts writing values FROM the payload, it must start
// verifying the JWT in the Plaid-Verification header first. That's the line.

export async function POST(request: Request) {
  let payload: {
    webhook_type?: string;
    webhook_code?: string;
    item_id?: string;
    error?: { error_code?: string; error_message?: string };
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { webhook_type: type, webhook_code: code, item_id: itemId } = payload;
  if (!itemId) return NextResponse.json({ received: true });

  const item = await db.plaidItem.findUnique({ where: { itemId } });
  if (!item) {
    // Unknown Item — acknowledge so Plaid stops retrying, do nothing else.
    return NextResponse.json({ received: true });
  }

  if (type === "TRANSACTIONS") {
    switch (code) {
      case "SYNC_UPDATES_AVAILABLE":
      case "INITIAL_UPDATE":
      case "HISTORICAL_UPDATE":
      case "DEFAULT_UPDATE":
        await syncItem(item);
        break;
      default:
        break;
    }
  }

  if (type === "ITEM") {
    if (code === "ERROR" && payload.error?.error_code === "ITEM_LOGIN_REQUIRED") {
      await db.plaidItem.update({
        where: { id: item.id },
        data: {
          status: "LOGIN_REQUIRED",
          statusDetail: payload.error?.error_message ?? "Re-authentication required",
        },
      });
    }
    if (code === "PENDING_EXPIRATION") {
      await db.plaidItem.update({
        where: { id: item.id },
        data: { status: "PENDING_EXPIRATION" },
      });
    }
    if (code === "USER_PERMISSION_REVOKED") {
      await db.plaidItem.update({
        where: { id: item.id },
        data: { status: "REVOKED", statusDetail: "Access revoked by the account holder" },
      });
    }
  }

  await auditFinancial({
    householdId: item.householdId,
    action: "SYNC_TRANSACTIONS",
    resource: "ITEM",
    resourceId: item.id,
    meta: { source: "webhook", webhookType: type ?? null, webhookCode: code ?? null },
  });

  return NextResponse.json({ received: true });
}
