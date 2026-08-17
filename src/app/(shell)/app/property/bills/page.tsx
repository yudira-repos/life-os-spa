import Link from "next/link";
import { clsx } from "clsx";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requirePropertyManager } from "@/lib/propertyos/authz";
import { getPrimaryProperty } from "@/lib/propertyos/service";
import { detectHomeBills, missingEssentials } from "@/lib/propertyos/detect";
import {
  AdoptDetectedBill,
  PayBillButton,
  AddBillForm,
} from "@/components/propertyos/BillControls";
import { DeleteButton } from "@/components/propertyos/PropertyForms";
import { formatCents } from "@/lib/financialos/money";
import { formatDayWithYear } from "@/lib/travelos/dates";
import {
  BILL_CATEGORY_LABELS,
  BILL_CATEGORY_EMOJI,
  CADENCE_LABELS,
  billStatus,
  annualBillCents,
  type BillCategory,
  type Cadence,
} from "@/lib/propertyos/bills";

export default async function BillsPage() {
  const access = await requirePropertyManager();
  if (!access.ok) return null;
  const { household } = access;

  const property = await getPrimaryProperty(household.id);
  if (!property) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">
          Add your property first — bills belong to a property.
        </p>
        <Link
          href="/app/property/settings"
          className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          Set up the property →
        </Link>
      </Card>
    );
  }

  const [bills, detected, vendors] = await Promise.all([
    db.propertyBill.findMany({
      where: { householdId: household.id },
      orderBy: [{ status: "asc" }, { nextDueDate: "asc" }],
      include: { vendor: { select: { name: true } } },
    }),
    detectHomeBills(household.id),
    db.vendor.findMany({
      where: { householdId: household.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const gaps = missingEssentials(bills, detected);
  const annualTotal = bills
    .filter((bill) => bill.status === "ACTIVE")
    .reduce((sum, bill) => sum + annualBillCents(bill.cadence as Cadence, bill.typicalAmountCents), 0);

  return (
    <div className="flex flex-col gap-6">
      {detected.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Found in your transactions
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Recurring home charges FinancialOS already sees. Adopting one brings
            across the amount and cadence it observed — no typing.
          </p>
          <Card className="mt-3 divide-y divide-white/5 p-0">
            {detected.map((item) => (
              <AdoptDetectedBill key={item.key} detected={item} />
            ))}
          </Card>
        </section>
      )}

      {gaps.length > 0 && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <p className="text-sm font-medium text-neutral-200">
            No sign of: {gaps.map((g) => BILL_CATEGORY_LABELS[g]).join(", ")}
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            Every homeowner has these. Not seeing them usually means they&apos;re
            paid from an account that isn&apos;t linked, or bundled into your
            mortgage escrow — worth confirming rather than assuming.
          </p>
        </Card>
      )}

      {bills.length > 0 && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Tracked bills
            </h2>
            <span className="text-xs text-neutral-500">
              {formatCents(annualTotal, { whole: true })}/year ·{" "}
              {formatCents(Math.round(annualTotal / 12), { whole: true })}/month
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {bills.map((bill) => {
              const status = billStatus(bill.nextDueDate, bill.status);
              return (
                <Card
                  key={bill.id}
                  className={clsx(status === "OVERDUE" && "border-rose-400/30")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span className="mr-2">
                          {BILL_CATEGORY_EMOJI[bill.category as BillCategory] ?? "📄"}
                        </span>
                        {bill.name}
                        {bill.autopay && (
                          <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400">
                            autopay
                          </span>
                        )}
                        {bill.status !== "ACTIVE" && (
                          <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-neutral-500">
                            {bill.status.toLowerCase()}
                          </span>
                        )}
                        {bill.detectedKey && (
                          <span className="ml-2 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-300">
                            from transactions
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-neutral-400">
                        {BILL_CATEGORY_LABELS[bill.category as BillCategory] ?? bill.category} ·{" "}
                        {CADENCE_LABELS[bill.cadence as Cadence] ?? bill.cadence}
                        {bill.vendor && ` · ${bill.vendor.name}`}
                      </p>
                      <p
                        className={clsx(
                          "mt-0.5 text-xs",
                          status === "OVERDUE"
                            ? "text-rose-300"
                            : status === "DUE_SOON"
                              ? "text-amber-300"
                              : "text-neutral-500"
                        )}
                      >
                        {bill.nextDueDate
                          ? `Next due ${formatDayWithYear(bill.nextDueDate)}`
                          : "No due date set"}
                        {bill.lastPaidAt &&
                          ` · last paid ${formatDayWithYear(bill.lastPaidAt)}${bill.lastPaidCents ? ` (${formatCents(bill.lastPaidCents)})` : ""}`}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCents(bill.typicalAmountCents)}
                      </span>
                      <div className="flex items-center gap-1">
                        <PayBillButton
                          billId={bill.id}
                          typicalAmountCents={bill.typicalAmountCents}
                        />
                        <DeleteButton endpoint={`/api/property/bills/${bill.id}`} />
                      </div>
                    </div>
                  </div>

                  {bill.notes && (
                    <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/5 p-2.5 text-xs text-amber-200">
                      {bill.notes}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <AddBillForm vendors={vendors} />

      {bills.length === 0 && detected.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-400">
            No bills yet. If FinancialOS is connected with a few months of
            transactions, PropertyOS will find your utilities and insurance
            automatically — otherwise add them by hand above.
          </p>
        </Card>
      )}
    </div>
  );
}
