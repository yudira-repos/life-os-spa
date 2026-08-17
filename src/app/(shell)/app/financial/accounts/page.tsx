import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { PlaidLinkButton } from "@/components/financialos/PlaidLinkButton";
import { SyncButton } from "@/components/financialos/SyncButton";
import {
  ManualAccountForm,
  UnlinkItemButton,
} from "@/components/financialos/AccountControls";
import { requireFinancialAccess, accountVisibilityWhere } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";
import { formatCents } from "@/lib/financialos/money";
import { plaidConfigured } from "@/lib/financialos/plaid";
import { encryptionConfigured } from "@/lib/financialos/crypto";

const TYPE_LABELS: Record<string, string> = {
  DEPOSITORY: "Cash & savings",
  INVESTMENT: "Investments",
  CREDIT: "Credit cards",
  LOAN: "Loans",
  OTHER: "Other",
};

export default async function AccountsPage() {
  const access = await requireFinancialAccess();
  if (!access.ok) return null;
  const { household, user, member, isOwner } = access;
  const scope = { memberId: member.id, isOwner };

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "VIEW_ACCOUNTS",
    resource: "ACCOUNT",
  });

  const [items, accounts] = await Promise.all([
    db.plaidItem.findMany({
      where: { householdId: household.id },
      orderBy: { createdAt: "asc" },
    }),
    db.financialAccount.findMany({
      where: { householdId: household.id, ...accountVisibilityWhere(scope) },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  const configured = plaidConfigured() && encryptionConfigured();
  const byType = new Map<string, typeof accounts>();
  for (const account of accounts) {
    const list = byType.get(account.type) ?? [];
    list.push(account);
    byType.set(account.type, list);
  }

  return (
    <div className="flex flex-col gap-6">
      {!configured && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <p className="font-semibold">Bank linking isn&apos;t configured yet.</p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-400">
            {!plaidConfigured() && (
              <li>
                • Set <code className="text-neutral-300">PLAID_CLIENT_ID</code>,{" "}
                <code className="text-neutral-300">PLAID_SECRET</code> and{" "}
                <code className="text-neutral-300">PLAID_ENV</code> from your Plaid
                dashboard.
              </li>
            )}
            {!encryptionConfigured() && (
              <li>
                • Set <code className="text-neutral-300">FINANCIAL_ENC_KEY</code> —
                generate one with{" "}
                <code className="text-neutral-300">openssl rand -base64 32</code>.
                Without it we refuse to store bank tokens at all.
              </li>
            )}
          </ul>
          <p className="mt-2 text-sm text-neutral-400">
            You can still add accounts manually below and use every other part of
            the module.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {configured && <PlaidLinkButton />}
        {items.length > 0 && <SyncButton />}
      </div>

      {items.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Connected institutions
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {items.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {item.institutionName ?? "Linked institution"}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {item.lastSyncedAt
                        ? `Last synced ${item.lastSyncedAt.toLocaleString("en-US")}`
                        : "Not synced yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.status === "LOGIN_REQUIRED" ? (
                      <>
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-300">
                          Reconnect needed
                        </span>
                        <PlaidLinkButton
                          mode="update"
                          itemId={item.id}
                          variant="secondary"
                          label="Reconnect"
                        />
                      </>
                    ) : item.status === "GOOD" ? (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-300">
                        Connected
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] text-rose-300">
                        {item.status}
                      </span>
                    )}
                    <UnlinkItemButton
                      itemId={item.id}
                      institutionName={item.institutionName ?? "this institution"}
                    />
                  </div>
                </div>
                {item.statusDetail && (
                  <p className="mt-2 text-xs text-neutral-500">{item.statusDetail}</p>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {accounts.length > 0 && (
        <section className="flex flex-col gap-5">
          {[...byType.entries()].map(([type, list]) => (
            <div key={type}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {TYPE_LABELS[type] ?? type}
              </h2>
              <Card className="mt-3 divide-y divide-white/5 p-0">
                {list.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-neutral-200">
                        {account.name}
                        {account.mask && (
                          <span className="ml-2 text-xs text-neutral-600">
                            ••{account.mask}
                          </span>
                        )}
                        {account.isManual && (
                          <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-neutral-500">
                            manual
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-600">
                        {account.subtype ?? TYPE_LABELS[account.type] ?? account.type}
                      </p>
                    </div>
                    <span
                      className={
                        account.currentBalanceCents < 0
                          ? "shrink-0 tabular-nums text-rose-300"
                          : "shrink-0 tabular-nums text-neutral-200"
                      }
                    >
                      {formatCents(account.currentBalanceCents)}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </section>
      )}

      <ManualAccountForm />

      <Card className="border-white/5 bg-transparent">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          How your data is handled
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
          <li>
            Bank credentials are entered in Plaid&apos;s interface and never reach
            LifeOS servers.
          </li>
          <li>
            The access token Plaid returns is encrypted with AES-256-GCM before it
            is written to the database.
          </li>
          <li>Only the last four digits of an account number are ever stored.</li>
          <li>
            Only OWNER and ADULT members of this household can open this module.
            Every access is recorded in the household&apos;s financial audit log.
          </li>
          <li>Unlinking revokes the connection at Plaid before deleting our copy.</li>
        </ul>
      </Card>
    </div>
  );
}
