import { notFound } from "next/navigation";
import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { getChildInHousehold } from "@/lib/kidsos/authz";
import { getChildProgressSummary } from "@/lib/kidsos/progress";
import { getConcept, isUnlocked, subjectMeta } from "@/lib/kidsos/curriculum";
import { generateProblemSet } from "@/lib/kidsos/problem-bank";
import { ChildSubNav } from "@/components/kidsos/ChildSubNav";
import { PracticeSession } from "@/components/kidsos/PracticeSession";

const QUESTIONS_PER_SESSION = 8;

export default async function PracticePage({
  params,
}: {
  params: Promise<{ childId: string; conceptCode: string }>;
}) {
  const { childId, conceptCode } = await params;
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "kids");
  if (!entitled) return <Locked moduleName="KidsOS" />;

  const child = await getChildInHousehold(household.id, childId);
  if (!child) return notFound();

  const concept = getConcept(conceptCode);
  if (!concept || concept.grade !== child.grade) return notFound();

  const summary = await getChildProgressSummary(childId);
  if (!isUnlocked(concept, summary.masteryByCode)) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <ChildSubNav childId={childId} childName={child.name} />
        <p className="text-sm text-neutral-400">
          This concept is still locked — master its prerequisites first from the Study tab.
        </p>
      </div>
    );
  }

  const problems = generateProblemSet(conceptCode, QUESTIONS_PER_SESSION, child.interests);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <ChildSubNav childId={childId} childName={child.name} />
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
        {subjectMeta(concept.subject).emoji} {subjectMeta(concept.subject).name}
      </p>
      <p className="mt-1 text-xl font-semibold">{concept.name}</p>

      <PracticeSession
        childId={childId}
        conceptCode={concept.code}
        conceptName={concept.name}
        problems={problems}
      />
    </div>
  );
}
