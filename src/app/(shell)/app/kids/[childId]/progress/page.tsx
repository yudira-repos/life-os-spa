import { notFound } from "next/navigation";
import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { Card } from "@/components/ui/card";
import { ChildSubNav } from "@/components/kidsos/ChildSubNav";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { getChildProgressSummary } from "@/lib/kidsos/progress";
import { SUBJECTS, conceptsForGradeSubject, MASTERY_THRESHOLD } from "@/lib/kidsos/curriculum";
import { BADGE_CATALOG, pointsToNextLevel } from "@/lib/kidsos/gamification";

export default async function ChildProgressPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "kids");
  if (!entitled) return <Locked moduleName="KidsOS" />;

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return notFound();

  const summary = await getChildProgressSummary(childId);
  const { next, remaining } = pointsToNextLevel(summary.totalPoints);

  const earnedKeys = new Set(summary.badges.map((b) => b.badgeKey));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ChildSubNav childId={childId} childName={child.name} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Level</p>
            <p className="mt-1 text-xl font-semibold">{summary.levelName}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {next ? `${remaining} points to ${next}` : "Top level reached!"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Points</p>
            <p className="mt-1 text-xl font-semibold">⭐ {summary.totalPoints}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Streak</p>
            <p className="mt-1 text-xl font-semibold">
              🔥 {summary.streak.currentDays} <span className="text-sm text-neutral-500">(best {summary.streak.longestDays})</span>
            </p>
          </div>
        </div>
      </Card>

      {child.grade && (
        <Card className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Mastery by subject</p>
          <div className="mt-4 flex flex-col gap-4">
            {SUBJECTS.map((subject) => {
              const concepts = conceptsForGradeSubject(child.grade!, subject.id);
              if (concepts.length === 0) return null;
              const mastered = concepts.filter((c) => (summary.masteryByCode[c.code] ?? 0) >= MASTERY_THRESHOLD).length;
              const pct = Math.round((mastered / concepts.length) * 100);
              return (
                <div key={subject.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {subject.emoji} {subject.name}
                    </span>
                    <span className="text-neutral-500">
                      {mastered}/{concepts.length} mastered
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Badges</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BADGE_CATALOG.map((badge) => {
            const earned = earnedKeys.has(badge.key);
            return (
              <div
                key={badge.key}
                className={`rounded-xl border p-3 text-center ${
                  earned ? "border-indigo-400/40 bg-indigo-500/10" : "border-white/5 bg-black/20 opacity-40"
                }`}
              >
                <p className="text-2xl">{badge.emoji}</p>
                <p className="mt-1 text-xs font-medium">{badge.name}</p>
                <p className="mt-0.5 text-[10px] text-neutral-500">{badge.description}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
