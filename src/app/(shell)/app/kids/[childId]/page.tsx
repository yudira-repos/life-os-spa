import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { Card } from "@/components/ui/card";
import { ChildSubNav } from "@/components/kidsos/ChildSubNav";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { getChildProgressSummary } from "@/lib/kidsos/progress";
import { conceptsForGrade, isUnlocked, subjectMeta, MASTERY_THRESHOLD } from "@/lib/kidsos/curriculum";
import { activitiesForAge } from "@/lib/kidsos/activities";
import { CAREERS } from "@/lib/kidsos/careers";
import { BADGE_CATALOG } from "@/lib/kidsos/gamification";

function ageFromBirthdate(birthdate: Date | null): number | null {
  if (!birthdate) return null;
  return Math.floor((Date.now() - birthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default async function ChildTodayPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "kids");
  if (!entitled) return <Locked moduleName="KidsOS" />;

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return notFound();

  const summary = await getChildProgressSummary(childId);
  const age = ageFromBirthdate(child.birthdate);

  const gradeConcepts = child.grade ? conceptsForGrade(child.grade) : [];
  const nextConcept = gradeConcepts.find(
    (c) => (summary.masteryByCode[c.code] ?? 0) < MASTERY_THRESHOLD && isUnlocked(c, summary.masteryByCode)
  );

  const spotlightActivities = activitiesForAge(age).slice(0, 2);
  // Deterministic pick keyed off the child's id — stable across re-renders
  // (Math.random()/Date.now() aren't allowed during render).
  const careerSeed = childId.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const spotlightCareer = CAREERS[careerSeed % CAREERS.length];
  const recentBadges = summary.badges.slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ChildSubNav childId={childId} childName={child.name} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Streak</p>
          <p className="mt-2 text-2xl font-semibold">🔥 {summary.streak.currentDays} days</p>
          <p className="mt-1 text-xs text-neutral-500">Longest: {summary.streak.longestDays} days</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Points</p>
          <p className="mt-2 text-2xl font-semibold">⭐ {summary.totalPoints}</p>
          <p className="mt-1 text-xs text-neutral-500">Level: {summary.levelName}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Badges</p>
          <p className="mt-2 text-2xl font-semibold">🏅 {summary.badges.length}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {recentBadges.length > 0
              ? recentBadges.map((b) => BADGE_CATALOG.find((d) => d.key === b.badgeKey)?.emoji ?? "🏅").join(" ")
              : "None yet"}
          </p>
        </Card>
      </div>

      {!child.grade ? (
        <Card className="mt-6">
          <p className="text-sm text-neutral-300">
            Set {child.name}&apos;s grade in{" "}
            <Link href="/settings" className="text-indigo-300 underline">
              Settings
            </Link>{" "}
            to unlock Studies practice (KidsOS Studies covers grades 3-6).
          </p>
        </Card>
      ) : nextConcept ? (
        <Card className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
            {subjectMeta(nextConcept.subject).emoji} Next up in {subjectMeta(nextConcept.subject).name}
          </p>
          <p className="mt-2 font-medium">{nextConcept.name}</p>
          <p className="mt-1 text-sm text-neutral-400">{nextConcept.realWorld[0]}</p>
          <Link href={`/app/kids/${childId}/study/${nextConcept.code}`}>
            <div className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400">
              Practice now
            </div>
          </Link>
        </Card>
      ) : (
        <Card className="mt-6">
          <p className="text-sm text-neutral-300">
            {child.name} has mastered every concept unlocked so far for Grade {child.grade}. 🎉 Check{" "}
            <Link href={`/app/kids/${childId}/study`} className="text-indigo-300 underline">
              Study
            </Link>{" "}
            for the full map.
          </p>
        </Card>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Activity ideas</p>
          <div className="mt-3 flex flex-col gap-2">
            {spotlightActivities.map((a) => (
              <div key={a.key} className="text-sm text-neutral-300">
                {a.emoji} {a.name} — <span className="text-neutral-500">{a.category}</span>
              </div>
            ))}
          </div>
          <Link href={`/app/kids/${childId}/activities`} className="mt-3 inline-block text-xs text-indigo-300 underline">
            Browse all activities
          </Link>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Career spotlight</p>
          <p className="mt-2 text-sm text-neutral-300">
            {spotlightCareer.emoji} <span className="font-medium">{spotlightCareer.title}</span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">{spotlightCareer.whatTheyDo}</p>
          <Link href={`/app/kids/${childId}/careers`} className="mt-3 inline-block text-xs text-indigo-300 underline">
            Explore career paths
          </Link>
        </Card>
      </div>
    </div>
  );
}
