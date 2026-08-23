import Link from "next/link";
import { db } from "@/lib/db";
import { requireDayCoordinator } from "@/lib/dayos/authz";
import { Card } from "@/components/ui/card";
import { DayOSSetup } from "@/components/dayos/setup/DayOSSetup";

export default async function SetupPage() {
  const access = await requireDayCoordinator();
  if (!access.ok) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Card className="border-red-400/20 bg-red-500/5">
          <p className="text-sm text-red-300">
            You need to be an adult in the household to set up DayOS.
          </p>
        </Card>
      </div>
    );
  }

  // Check if already set up (has places and activities)
  const [places, activities, members] = await Promise.all([
    db.place.findMany({
      where: { householdId: access.household.id },
    }),
    db.activity.findMany({
      where: { householdId: access.household.id },
    }),
    db.householdMember.findMany({
      where: { householdId: access.household.id },
      orderBy: { name: "asc" },
    }),
  ]);

  // If already set up, redirect to today
  if (places.length > 0 && activities.length > 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Card className="border-green-400/20 bg-green-500/5">
          <p className="text-sm font-semibold text-green-300">DayOS is already set up!</p>
          <p className="mt-2 text-sm text-green-200">
            Your household has {places.length} place{places.length !== 1 ? "s" : ""} and{" "}
            {activities.length} activit{activities.length !== 1 ? "ies" : ""} configured.
          </p>
          <Link
            href="/app/day"
            className="mt-4 inline-block text-sm text-indigo-300 underline underline-offset-2"
          >
            Go to Today →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Let&apos;s set up your week</h1>
        <p className="mt-2 text-neutral-400">
          Tell us about your places, activities, and who&apos;s responsible. Takes about 5 minutes.
        </p>
      </div>
      <DayOSSetup
        householdId={access.household.id}
        members={members.map(m => ({
          id: m.id,
          name: m.name,
          role: m.role,
        }))}
      />
    </div>
  );
}
