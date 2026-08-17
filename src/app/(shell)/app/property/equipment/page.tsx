import Link from "next/link";
import { clsx } from "clsx";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requirePropertyAccess } from "@/lib/propertyos/authz";
import { getPrimaryProperty } from "@/lib/propertyos/service";
import { AddEquipmentForm, DeleteButton } from "@/components/propertyos/PropertyForms";
import {
  EQUIPMENT_KINDS,
  assessEquipment,
  HEALTH_LABELS,
  type EquipmentKind,
} from "@/lib/propertyos/equipment";
import { formatDayWithYear } from "@/lib/travelos/dates";

export default async function EquipmentPage() {
  const access = await requirePropertyAccess();
  if (!access.ok) return null;
  const { household, canManage } = access;

  const property = await getPrimaryProperty(household.id);
  if (!property) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">Add your property first.</p>
        <Link
          href="/app/property/settings"
          className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          Set up the property →
        </Link>
      </Card>
    );
  }

  const equipment = await db.equipment.findMany({
    where: { householdId: household.id },
    orderBy: [{ isIot: "asc" }, { name: "asc" }],
  });

  const iot = equipment.filter((item) => item.isIot);
  const physical = equipment.filter((item) => !item.isIot);

  return (
    <div className="flex flex-col gap-6">
      {equipment.length === 0 && (
        <Card className="border-indigo-400/20 bg-indigo-500/5">
          <p className="font-semibold">Record what the house runs on.</p>
          <p className="mt-2 text-sm text-neutral-400">
            This answers the three questions you can never answer when you need
            to: what size is the filter, is it still under warranty, and how old
            is it really. Each one costs money when unanswered.
          </p>
        </Card>
      )}

      {physical.length > 0 && (
        <EquipmentGroup title="Equipment" items={physical} canManage={canManage} />
      )}
      {iot.length > 0 && (
        <EquipmentGroup title="Smart home & IoT" items={iot} canManage={canManage} />
      )}

      <AddEquipmentForm />

      {iot.length > 0 && (
        <Card className="border-white/5 bg-transparent">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            About the smart home items
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
            <li>
              These are internet-connected computers on your home network. Old
              firmware on a camera or hub is a real security exposure, not a
              cosmetic one.
            </li>
            <li>
              Sensor batteries matter more than they look — a leak detector with
              a dead battery is worse than no detector, because you believe
              you&apos;re covered.
            </li>
            <li>
              The maintenance list includes firmware checks, battery checks, and
              an annual review of who still has access.
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}

function EquipmentGroup({
  title,
  items,
  canManage,
}: {
  title: string;
  items: {
    id: string;
    name: string;
    kind: string;
    brand: string | null;
    model: string | null;
    installedOn: Date | null;
    warrantyExpiresOn: Date | null;
    expectedLifeYears: number | null;
    filterSize: string | null;
    batteryType: string | null;
    notes: string | null;
  }[];
  canManage: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {items.map((item) => {
          const meta = EQUIPMENT_KINDS[item.kind as EquipmentKind] ?? EQUIPMENT_KINDS.OTHER;
          const assessment = assessEquipment({
            kind: item.kind,
            installedOn: item.installedOn,
            warrantyExpiresOn: item.warrantyExpiresOn,
            expectedLifeYears: item.expectedLifeYears,
          });

          return (
            <Card
              key={item.id}
              className={clsx(
                assessment.health === "PAST_LIFE" && "border-amber-400/25",
                assessment.health === "WARRANTY_EXPIRING" && "border-indigo-400/30"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="mr-2">{meta.emoji}</span>
                    {item.name}
                    <span
                      className={clsx(
                        "ml-2 rounded-full px-2 py-0.5 text-[11px]",
                        assessment.health === "PAST_LIFE" && "bg-amber-500/15 text-amber-300",
                        assessment.health === "AGING" && "bg-white/10 text-neutral-300",
                        assessment.health === "WARRANTY_EXPIRING" &&
                          "bg-indigo-500/15 text-indigo-300",
                        assessment.health === "OK" && "bg-emerald-500/15 text-emerald-300",
                        assessment.health === "UNKNOWN" && "bg-white/5 text-neutral-500"
                      )}
                    >
                      {HEALTH_LABELS[assessment.health]}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {[meta.label, item.brand, item.model].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{assessment.headline}</p>
                </div>
                {canManage && <DeleteButton endpoint={`/api/property/equipment/${item.id}`} />}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
                {item.filterSize && (
                  <span>
                    Filter: <span className="text-neutral-300">{item.filterSize}</span>
                  </span>
                )}
                {item.batteryType && (
                  <span>
                    Battery: <span className="text-neutral-300">{item.batteryType}</span>
                  </span>
                )}
                {item.installedOn && <span>Installed {formatDayWithYear(item.installedOn)}</span>}
                {item.warrantyExpiresOn && (
                  <span>Warranty to {formatDayWithYear(item.warrantyExpiresOn)}</span>
                )}
              </div>

              {assessment.advice.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs text-neutral-400">
                  {assessment.advice.map((line, index) => (
                    <li key={index}>• {line}</li>
                  ))}
                </ul>
              )}

              {item.notes && <p className="mt-3 text-sm text-neutral-400">{item.notes}</p>}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
