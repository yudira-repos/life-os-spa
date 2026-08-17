import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LEARN_PATHS, LEARN_BY_KEY, LEARN_TOPICS } from "@/lib/financialos/learn";

export default function LearnPage() {
  return (
    <div className="flex flex-col gap-8">
      <Card className="border-indigo-400/20 bg-indigo-500/5">
        <p className="font-semibold">Nobody taught you this. That&apos;s normal.</p>
        <p className="mt-2 text-sm text-neutral-400">
          Personal finance isn&apos;t taught in most schools, and the industry
          that would happily explain it to you is usually paid by commission on
          what it sells. Everything below is written for someone starting from
          zero, in plain language, with the uncomfortable parts left in.
        </p>
      </Card>

      {LEARN_PATHS.map((path) => (
        <section key={path.key}>
          <h2 className="text-lg font-semibold">{path.name}</h2>
          <p className="mt-1 text-sm text-neutral-400">{path.blurb}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {path.topics
              .map((key) => LEARN_BY_KEY[key])
              .filter(Boolean)
              .map((topic) => (
                <Link key={topic.key} href={`/app/financial/learn/${topic.key}`}>
                  <Card className="h-full p-4 transition-colors hover:border-white/20 hover:bg-white/5">
                    <p className="text-sm font-medium text-neutral-200">{topic.term}</p>
                    <p className="mt-1 text-xs text-neutral-500">{topic.short}</p>
                  </Card>
                </Link>
              ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="text-lg font-semibold">Everything, alphabetically</h2>
        <Card className="mt-3 divide-y divide-white/5 p-0">
          {[...LEARN_TOPICS]
            .sort((a, b) => a.term.localeCompare(b.term))
            .map((topic) => (
              <Link
                key={topic.key}
                href={`/app/financial/learn/${topic.key}`}
                className="block px-5 py-3 transition-colors hover:bg-white/5"
              >
                <span className="text-sm text-neutral-200">{topic.term}</span>
                <span className="text-sm text-neutral-500"> — {topic.short}</span>
              </Link>
            ))}
        </Card>
      </section>
    </div>
  );
}
