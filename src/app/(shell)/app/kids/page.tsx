import Link from "next/link";
import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { db } from "@/lib/db";
import { Locked } from "@/components/shell/Locked";
import { Card } from "@/components/ui/card";
import { kidsRecommendationForAge } from "@/lib/seed-content";
import { getChildProgressSummary } from "@/lib/kidsos/progress";

function ageFromBirthdate(birthdate: Date | null): number | null {
  if (!birthdate) return null;
  return Math.floor((Date.now() - birthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default async function KidsOSPage() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "kids");
  if (!entitled) return <Locked moduleName="KidsOS" />;

  const children = await db.householdMember.findMany({
    where: { householdId: household.id, role: "CHILD" },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-2xl font-semibold tracking-tight">KidsOS</p>
      <p className="mt-1 text-sm text-neutral-400">
        Studies, activities, and career exploration for every child.
      </p>

      {children.length === 0 ? (
        <Card className="mt-8">
          <p className="text-sm text-neutral-400">
            No children added yet. Add one from{" "}
            <Link href="/settings" className="text-indigo-300 underline">
              Settings
            </Link>{" "}
            to get started.
          </p>
        </Card>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {await Promise.all(
            children.map(async (child) => {
              const age = ageFromBirthdate(child.birthdate);
              const studiesEligible = Boolean(child.grade);
              const summary = studiesEligible ? await getChildProgressSummary(child.id) : null;

              return (
                <Card key={child.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{child.name}</p>
                      <p className="text-xs text-neutral-500">
                        {child.grade ? `Grade ${child.grade}` : age != null ? `Age ${age}` : "Profile not set up"}
                        {child.interests ? ` · Into: ${child.interests}` : ""}
                      </p>
                    </div>
                    {summary && (
                      <div className="flex items-center gap-3 text-xs text-neutral-400">
                        <span>🔥 {summary.streak.currentDays}-day streak</span>
                        <span>⭐ {summary.totalPoints} pts · {summary.levelName}</span>
                      </div>
                    )}
                  </div>

                  {!studiesEligible && (
                    <div className="mt-4 rounded-xl border border-white/5 bg-black/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                        {kidsRecommendationForAge(age).learning.subject}
                      </p>
                      <p className="mt-1 text-sm text-neutral-300">
                        {kidsRecommendationForAge(age).learning.idea}
                      </p>
                      <p className="mt-3 text-xs text-neutral-500">
                        Set a grade (3-6) in{" "}
                        <Link href="/settings" className="text-indigo-300 underline">
                          Settings
                        </Link>{" "}
                        to unlock full Studies practice and progress tracking.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Link href={`/app/kids/${child.id}`}>
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-center text-sm font-medium transition-colors hover:border-white/20 hover:bg-white/5">
                        Today
                      </div>
                    </Link>
                    <Link href={`/app/kids/${child.id}/study`}>
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-center text-sm font-medium transition-colors hover:border-white/20 hover:bg-white/5">
                        Study
                      </div>
                    </Link>
                    <Link href={`/app/kids/${child.id}/activities`}>
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-center text-sm font-medium transition-colors hover:border-white/20 hover:bg-white/5">
                        Activities
                      </div>
                    </Link>
                    <Link href={`/app/kids/${child.id}/careers`}>
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-center text-sm font-medium transition-colors hover:border-white/20 hover:bg-white/5">
                        Careers
                      </div>
                    </Link>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
