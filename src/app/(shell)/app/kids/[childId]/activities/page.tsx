import { notFound } from "next/navigation";
import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ChildSubNav } from "@/components/kidsos/ChildSubNav";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { ACTIVITY_CATEGORIES, activitiesForAge } from "@/lib/kidsos/activities";
import { ActivityToggle } from "@/components/kidsos/ActivityToggle";

function ageFromBirthdate(birthdate: Date | null): number | null {
  if (!birthdate) return null;
  return Math.floor((Date.now() - birthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default async function ChildActivitiesPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "kids");
  if (!entitled) return <Locked moduleName="KidsOS" />;

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return notFound();

  const age = ageFromBirthdate(child.birthdate);
  const activities = activitiesForAge(age);
  const statuses = await db.childActivity.findMany({ where: { childId } });
  const statusByKey: Record<string, "INTERESTED" | "ACTIVE"> = {};
  for (const s of statuses) statusByKey[s.activityKey] = s.status as "INTERESTED" | "ACTIVE";

  const active = activities.filter((a) => statusByKey[a.key]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ChildSubNav childId={childId} childName={child.name} />
      <p className="text-sm text-neutral-400">
        Sports, music, clubs, and more — mark what {child.name} is interested in or already doing.
      </p>

      {active.length > 0 && (
        <Card className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {child.name}&apos;s activities
          </p>
          <div className="mt-3 flex flex-col divide-y divide-white/5">
            {active.map((a) => (
              <div key={a.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  {a.emoji} {a.name}
                </span>
                <ActivityToggle childId={childId} activityKey={a.key} status={statusByKey[a.key]} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {ACTIVITY_CATEGORIES.map((category) => {
          const items = activities.filter((a) => a.category === category);
          if (items.length === 0) return null;
          return (
            <Card key={category}>
              <p className="font-semibold">{category}</p>
              <div className="mt-3 flex flex-col divide-y divide-white/5">
                {items.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {a.emoji} {a.name}
                      </p>
                      <p className="text-xs text-neutral-500">{a.description}</p>
                    </div>
                    <ActivityToggle childId={childId} activityKey={a.key} status={statusByKey[a.key] ?? null} />
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
