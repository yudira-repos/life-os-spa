"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PRIORITY_LABELS,
  type Recommendation,
} from "@/lib/financialos/advice/types";
import { LEARN_BY_KEY } from "@/lib/financialos/learn";

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-rose-500/15 text-rose-300",
  HIGH: "bg-amber-500/15 text-amber-300",
  MEDIUM: "bg-indigo-500/15 text-indigo-300",
  LOW: "bg-white/10 text-neutral-300",
  INFO: "bg-white/5 text-neutral-400",
};

const STATUS_STYLES: Record<string, string> = {
  ACTION_NEEDED: "bg-indigo-500/15 text-indigo-300",
  ON_TRACK: "bg-emerald-500/15 text-emerald-300",
  NOT_APPLICABLE: "bg-white/5 text-neutral-500",
  NEEDS_INFO: "bg-amber-500/10 text-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  ACTION_NEEDED: "Action needed",
  ON_TRACK: "On track",
  NOT_APPLICABLE: "Not applicable",
  NEEDS_INFO: "Needs info",
};

export function RecommendationCard({
  recommendation,
  defaultOpen = false,
}: {
  recommendation: Recommendation;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [plainEnglish, setPlainEnglish] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  async function explain() {
    setExplaining(true);
    try {
      const response = await fetch("/api/financial/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: recommendation.id }),
      });
      const data = await response.json();
      setPlainEnglish(data.text ?? recommendation.why.join("\n\n"));
    } catch {
      setPlainEnglish(recommendation.why.join("\n\n"));
    } finally {
      setExplaining(false);
    }
  }

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-4 p-5 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={clsx(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                PRIORITY_STYLES[recommendation.priority]
              )}
            >
              {PRIORITY_LABELS[recommendation.priority]}
            </span>
            <span
              className={clsx(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                STATUS_STYLES[recommendation.status]
              )}
            >
              {STATUS_LABELS[recommendation.status]}
            </span>
            {recommendation.memberName && (
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-neutral-400">
                {recommendation.memberName}
              </span>
            )}
          </div>
          <p className="mt-2 font-semibold">{recommendation.title}</p>
          <p className="mt-1 text-sm text-neutral-300">{recommendation.headline}</p>
        </div>
        <span className="mt-1 shrink-0 text-neutral-500">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 pb-5 pt-4">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Why
              </h4>
              <Button
                variant="ghost"
                className="!px-2.5 !py-1 text-xs"
                disabled={explaining || plainEnglish !== null}
                onClick={() => void explain()}
              >
                {explaining
                  ? "Rewriting…"
                  : plainEnglish
                    ? "In plain English ↓"
                    : "Explain in plain English"}
              </Button>
            </div>

            {plainEnglish ? (
              <div className="mt-2 space-y-3 rounded-xl border border-indigo-400/20 bg-indigo-500/5 p-4 text-sm leading-relaxed text-neutral-200">
                {plainEnglish.split("\n\n").map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                <p className="pt-1 text-[11px] text-neutral-500">
                  Rewritten for readability. The recommendation and every number
                  in it come from the rules, not from a language model.
                </p>
              </div>
            ) : (
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-300">
                {recommendation.why.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            )}
          </section>

          {recommendation.math.length > 0 && (
            <section className="mt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                The math
              </h4>
              <dl className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10 bg-black/20">
                {recommendation.math.map((line, index) => (
                  <div
                    key={index}
                    className="flex items-baseline justify-between gap-4 px-4 py-2"
                  >
                    <dt className="text-sm text-neutral-400">{line.label}</dt>
                    <dd
                      className={clsx(
                        "shrink-0 text-sm tabular-nums",
                        line.emphasis ? "font-semibold text-neutral-100" : "text-neutral-300"
                      )}
                    >
                      {line.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {recommendation.actions.length > 0 && (
            <section className="mt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                What to do
              </h4>
              <ol className="mt-2 space-y-2 text-sm text-neutral-300">
                {recommendation.actions.map((action, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-semibold text-indigo-300">
                      {index + 1}
                    </span>
                    <span>{action}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {recommendation.learnKeys && recommendation.learnKeys.length > 0 && (
            <section className="mt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Terms used here
              </h4>
              <div className="mt-2 space-y-2">
                {recommendation.learnKeys
                  .map((key) => LEARN_BY_KEY[key])
                  .filter(Boolean)
                  .map((topic) => (
                    <div
                      key={topic.key}
                      className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                    >
                      <span className="text-sm font-medium text-neutral-200">
                        {topic.term}
                      </span>
                      <span className="text-sm text-neutral-400"> — {topic.short}</span>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {recommendation.caveats && recommendation.caveats.length > 0 && (
            <section className="mt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                What could change this
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
                {recommendation.caveats.map((caveat, index) => (
                  <li key={index}>{caveat}</li>
                ))}
              </ul>
            </section>
          )}

          {recommendation.sources && recommendation.sources.length > 0 && (
            <section className="mt-5 flex flex-wrap gap-3">
              {recommendation.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-300 underline underline-offset-2"
                >
                  {source.label} ↗
                </a>
              ))}
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
