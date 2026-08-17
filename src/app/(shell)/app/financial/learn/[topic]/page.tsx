import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { LEARN_BY_KEY, LEARN_TOPICS } from "@/lib/financialos/learn";

export function generateStaticParams() {
  return LEARN_TOPICS.map((topic) => ({ topic: topic.key }));
}

export default async function LearnTopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic: key } = await params;
  const topic = LEARN_BY_KEY[key];
  if (!topic) return notFound();

  const related = (topic.related ?? [])
    .map((relatedKey) => LEARN_BY_KEY[relatedKey])
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/app/financial/learn"
        className="text-xs text-neutral-500 hover:text-neutral-300"
      >
        ← All topics
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{topic.term}</h1>
        <p className="mt-2 text-sm text-neutral-400">{topic.short}</p>
      </div>

      <Card>
        <div className="space-y-4 text-sm leading-relaxed text-neutral-300">
          {topic.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        {topic.example && (
          <div className="mt-5 rounded-xl border border-indigo-400/20 bg-indigo-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
              For example
            </p>
            <p className="mt-1.5 text-sm text-neutral-200">{topic.example}</p>
          </div>
        )}
      </Card>

      {related.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Related
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {related.map((item) => (
              <Link key={item.key} href={`/app/financial/learn/${item.key}`}>
                <Card className="h-full p-4 transition-colors hover:border-white/20 hover:bg-white/5">
                  <p className="text-sm font-medium text-neutral-200">{item.term}</p>
                  <p className="mt-1 text-xs text-neutral-500">{item.short}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
