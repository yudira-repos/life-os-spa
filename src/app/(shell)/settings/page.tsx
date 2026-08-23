import { getCurrentHousehold } from "@/lib/session";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { AddMemberForm } from "@/app/(shell)/settings/add-member-form";
import { EditChildForm } from "@/app/(shell)/settings/edit-child-form";
import { NotificationForm } from "@/app/(shell)/settings/notification-form";

export default async function SettingsPage() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const members = await db.householdMember.findMany({
    where: { householdId: household.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-2xl font-semibold tracking-tight">Settings</p>

      <Card className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Household
        </p>
        <p className="mt-2 font-medium">{household.name}</p>
      </Card>

      <NotificationForm />

      <Card className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Family members
        </p>
        <div className="mt-3 flex flex-col divide-y divide-white/5">
          {members.map((m) => (
            <div key={m.id} className="py-2">
              <div className="flex items-center justify-between text-sm">
                <span>{m.name}</span>
                <span className="text-neutral-500">
                  {m.role}
                  {m.role === "CHILD" && m.grade ? ` · Grade ${m.grade}` : ""}
                </span>
              </div>
              {m.role === "CHILD" && (
                <EditChildForm memberId={m.id} initialGrade={m.grade} initialInterests={m.interests} />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-white/10 pt-4">
          <AddMemberForm />
        </div>
      </Card>
    </div>
  );
}
