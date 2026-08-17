import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requirePropertyAccess } from "@/lib/propertyos/authz";
import { AddVendorForm, DeleteButton } from "@/components/propertyos/PropertyForms";
import {
  TRADE_LABELS,
  TRADE_EMOJI,
  ESSENTIAL_TRADES,
  type VendorTrade,
} from "@/lib/propertyos/equipment";
import { formatCents } from "@/lib/financialos/money";
import { formatDayWithYear } from "@/lib/travelos/dates";

export default async function VendorsPage() {
  const access = await requirePropertyAccess();
  if (!access.ok) return null;
  const { household, canManage } = access;

  const vendors = await db.vendor.findMany({
    where: { householdId: household.id },
    orderBy: [{ trade: "asc" }, { name: "asc" }],
    include: {
      logs: {
        orderBy: { completedAt: "desc" },
        take: 3,
        include: { task: { select: { name: true } } },
      },
    },
  });

  const haveTrades = new Set(vendors.map((vendor) => vendor.trade));
  const missing = ESSENTIAL_TRADES.filter((trade) => !haveTrades.has(trade));

  return (
    <div className="flex flex-col gap-6">
      {missing.length > 0 && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <p className="text-sm font-medium text-neutral-200">
            No number saved for: {missing.map((t) => TRADE_LABELS[t]).join(", ")}
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            These are the ones worth having <em>before</em> you need them.
            Finding a plumber at 11pm with water coming through the ceiling is
            how people end up paying triple for whoever answers the phone.
          </p>
        </Card>
      )}

      {vendors.length > 0 && (
        <div className="flex flex-col gap-3">
          {vendors.map((vendor) => (
            <Card key={vendor.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="mr-2">
                      {TRADE_EMOJI[vendor.trade as VendorTrade] ?? "📋"}
                    </span>
                    {vendor.name}
                    {vendor.rating && (
                      <span className="ml-2 text-xs text-amber-300">
                        {"★".repeat(vendor.rating)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {TRADE_LABELS[vendor.trade as VendorTrade] ?? vendor.trade}
                    {vendor.phone && ` · ${vendor.phone}`}
                    {canManage && vendor.hourlyRateCents
                      ? ` · ${formatCents(vendor.hourlyRateCents)}/hr`
                      : ""}
                  </p>
                  {vendor.lastUsedAt && (
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Last used {formatDayWithYear(vendor.lastUsedAt)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {vendor.phone && (
                    <a
                      href={`tel:${vendor.phone.replace(/[^\d+]/g, "")}`}
                      className="text-xs text-indigo-300 underline underline-offset-2"
                    >
                      Call
                    </a>
                  )}
                  {canManage && <DeleteButton endpoint={`/api/property/vendors/${vendor.id}`} />}
                </div>
              </div>

              {vendor.logs.length > 0 && (
                <div className="mt-3 border-t border-white/5 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Recent work
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-neutral-400">
                    {vendor.logs.map((log) => (
                      <li key={log.id}>
                        {formatDayWithYear(log.completedAt)} — {log.task.name}
                        {canManage && log.costCents > 0 && ` · ${formatCents(log.costCents)}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {vendor.notes && <p className="mt-3 text-sm text-neutral-400">{vendor.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      <AddVendorForm />

      {vendors.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-400">
            No vendors yet. As you log maintenance and say who did it, this
            becomes the answer to &quot;who fixed that last time?&quot; — which
            is the hardest part of any repeat home repair.
          </p>
        </Card>
      )}
    </div>
  );
}
