import { Card } from "@/components/ui/card";
import { requirePropertyManager } from "@/lib/propertyos/authz";
import { getPrimaryProperty } from "@/lib/propertyos/service";
import { PropertyForm } from "@/components/propertyos/PropertyForms";
import { taxScheduleNote, taxScheduleFor } from "@/lib/propertyos/bills";
import { formatDayWithYear } from "@/lib/travelos/dates";

export default async function PropertySettingsPage() {
  const access = await requirePropertyManager();
  if (!access.ok) return null;

  const property = await getPrimaryProperty(access.household.id);
  const schedule = property ? taxScheduleFor(property.stateCode) : null;

  return (
    <div className="flex flex-col gap-6">
      <PropertyForm
        initial={{
          name: property?.name ?? "Home",
          addressLine: property?.addressLine ?? "",
          city: property?.city ?? "",
          stateCode: property?.stateCode ?? "CA",
          postalCode: property?.postalCode ?? "",
          propertyType: property?.propertyType ?? "SINGLE_FAMILY",
          yearBuilt: property?.yearBuilt ?? null,
          squareFeet: property?.squareFeet ?? null,
          assessedValueDollars: (property?.assessedValueCents ?? 0) / 100,
          taxRatePercent: property?.taxRatePercent ?? 0,
          hasWaterSoftener: property?.hasWaterSoftener ?? false,
          hasIrrigation: property?.hasIrrigation ?? false,
          hasPool: property?.hasPool ?? false,
          hasSepticTank: property?.hasSepticTank ?? false,
          hasFireplace: property?.hasFireplace ?? false,
          hardWater: property?.hardWater ?? false,
          dustyOrSmoky: property?.dustyOrSmoky ?? false,
          heavyTreeCover: property?.heavyTreeCover ?? false,
        }}
      />

      {property && (
        <Card>
          <p className="font-semibold">Property tax in {property.stateCode}</p>
          <p className="mt-2 text-sm text-neutral-400">
            {taxScheduleNote(property.stateCode)}
          </p>

          {schedule && (
            <>
              <div className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10">
                {schedule.installments.map((installment) => (
                  <div key={installment.label} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-neutral-400">{installment.label}</span>
                    <span className="tabular-nums text-neutral-300">
                      due{" "}
                      {formatDayWithYear(
                        new Date(Date.UTC(2000, installment.dueMonth - 1, installment.dueDay))
                      ).replace(", 2000", "")}
                      {" · delinquent after "}
                      {formatDayWithYear(
                        new Date(
                          Date.UTC(2000, installment.delinquentMonth - 1, installment.delinquentDay)
                        )
                      ).replace(", 2000", "")}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-neutral-500">
                {schedule.verified
                  ? "Verified against a county treasurer's published schedule. The reminder uses the delinquency date, since that's the one with a penalty attached."
                  : "This is a common default rather than a verified schedule for your county — confirm it against your tax bill, and override the date on the bill itself if it differs."}
              </p>
            </>
          )}
        </Card>
      )}

      <Card className="border-white/5 bg-transparent">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          How PropertyOS uses this
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
          <li>
            The checkboxes decide which maintenance tasks exist. Saving adds any
            newly-applicable ones and never removes what you already track.
          </li>
          <li>
            Hard water, tree cover and dusty air shorten specific intervals
            rather than adding a footnote — the schedule changes, not the advice.
          </li>
          <li>
            Assessed value and tax rate are only used to estimate the annual tax
            bill when you haven&apos;t entered a real amount.
          </li>
          <li>
            Adults see bills, amounts and costs. Everyone in the household sees
            maintenance tasks, equipment and vendors — so whoever is doing the
            job can look it up and mark it done.
          </li>
        </ul>
      </Card>
    </div>
  );
}
