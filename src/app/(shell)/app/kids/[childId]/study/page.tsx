import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { Card } from "@/components/ui/card";
import { ChildSubNav } from "@/components/kidsos/ChildSubNav";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { getChildProgressSummary } from "@/lib/kidsos/progress";
import { SUBJECTS, conceptsForGradeSubject, isUnlocked, MASTERY_THRESHOLD } from "@/lib/kidsos/curriculum";

export default async function ChildStudyPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "kids");
  if (!entitled) return <Locked moduleName="KidsOS" />;

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return notFound();

  if (!child.grade) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <ChildSubNav childId={childId} childName={child.name} />
        <Card>
          <p className="text-sm text-neutral-300">
            Set {child.name}&apos;s grade (3-6) in{" "}
            <Link href="/settings" className="text-indigo-300 underline">
              Settings
            </Link>{" "}
            to see their Studies curriculum.
          </p>
        </Card>
      </div>
    );
  }

  const summary = await getChildProgressSummary(childId);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ChildSubNav childId={childId} childName={child.name} />
      <p className="text-sm text-neutral-400">Grade {child.grade} curriculum — practice to build mastery.</p>

      <div className="mt-6 flex flex-col gap-6">
        {SUBJECTS.map((subject) => {
          const concepts = conceptsForGradeSubject(child.grade!, subject.id);
          if (concepts.length === 0) return null;

          return (
            <Card key={subject.id}>
              <p className="font-semibold">
                {subject.emoji} {subject.name}
              </p>
              <div className="mt-3 flex flex-col divide-y divide-white/5">
                {concepts.map((concept) => {
                  const level = summary.masteryByCode[concept.code] ?? 0;
                  const unlocked = isUnlocked(concept, summary.masteryByCode);
                  const mastered = level >= MASTERY_THRESHOLD;
                  return (
                    <div key={concept.code} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {mastered ? "✅ " : !unlocked ? "🔒 " : ""}
                          {concept.name}
                        </p>
                        <div className="mt-1.5 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-indigo-400"
                            style={{ width: `${Math.round(level * 100)}%` }}
                          />
                        </div>
                      </div>
                      {unlocked ? (
                        <Link href={`/app/kids/${childId}/study/${concept.code}`}>
                          <div className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/15">
                            {mastered ? "Practice again" : "Practice"}
                          </div>
                        </Link>
                      ) : (
                        <span className="shrink-0 text-xs text-neutral-600">Locked</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
