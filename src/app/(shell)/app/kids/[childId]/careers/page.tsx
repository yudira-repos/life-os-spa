import { notFound } from "next/navigation";
import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ChildSubNav } from "@/components/kidsos/ChildSubNav";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { CAREERS } from "@/lib/kidsos/careers";
import { subjectMeta } from "@/lib/kidsos/curriculum";
import { CareerToggle } from "@/components/kidsos/CareerToggle";

export default async function ChildCareersPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "kids");
  if (!entitled) return <Locked moduleName="KidsOS" />;

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return notFound();

  const saved = await db.childCareerInterest.findMany({ where: { childId } });
  const savedKeys = new Set(saved.map((s) => s.careerKey));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ChildSubNav childId={childId} childName={child.name} />
      <p className="text-sm text-neutral-400">
        Browse career paths and see how they connect to what {child.name} is learning.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {CAREERS.map((career) => (
          <Card key={career.key}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">
                {career.emoji} {career.title}
              </p>
              <CareerToggle childId={childId} careerKey={career.key} bookmarked={savedKeys.has(career.key)} />
            </div>
            <p className="mt-1.5 text-sm text-neutral-400">{career.whatTheyDo}</p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Key skills</p>
            <p className="mt-1 text-sm text-neutral-300">{career.skills.join(", ")}</p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Related subjects
            </p>
            <p className="mt-1 text-sm text-neutral-300">
              {career.subjects.map((s) => `${subjectMeta(s).emoji} ${subjectMeta(s).name}`).join(" · ")}
            </p>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Roadmap</p>
            <ol className="mt-1 flex flex-col gap-1 text-sm text-neutral-300">
              {career.roadmap.map((step, i) => (
                <li key={i}>
                  {i + 1}. {step}
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  );
}
