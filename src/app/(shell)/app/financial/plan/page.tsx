import Link from "next/link";
import { clsx } from "clsx";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/financialos/Stat";
import { RecommendationCard } from "@/components/financialos/RecommendationCard";
import { requireFinancialAccess } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";
import { buildFinancialContext } from "@/lib/financialos/profile";
import {
  generatePlanFromContext,
  groupByCategory,
  ENGINE_VERSION,
} from "@/lib/financialos/advice/engine";
import { CATEGORY_LABELS } from "@/lib/financialos/advice/types";
import { TAX_YEAR, SOURCES } from "@/lib/financialos/constants";
import { money } from "@/lib/financialos/advice/types";

export default async function PlanPage() {
  const access = await requireFinancialAccess();
  if (!access.ok) return null;
  const { household, user, member, isOwner } = access;
  const scope = { memberId: member.id, isOwner };

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "VIEW_PLAN",
    resource: "RECOMMENDATION",
  });

  const context = await buildFinancialContext(household.id, scope);
  const plan = generatePlanFromContext(context);
  const grouped = groupByCategory(plan.recommendations);

  if (!context.profileComplete) {
    return (
      <Card>
        <p className="font-semibold">The plan needs a few facts first.</p>
        <p className="mt-2 text-sm text-neutral-400">
          Salary, whether there&apos;s a workplace retirement plan and what it
          matches, and whether it allows after-tax contributions. None of that is
          visible in a bank feed, and guessing at it would produce
          recommendations you can&apos;t act on.
        </p>
        <Link
          href="/app/financial/setup"
          className="mt-4 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          Fill in Setup →
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Things to act on"
          value={String(plan.summary.actionCount)}
          sub={`${plan.summary.criticalCount} marked do-this-first`}
          tone={plan.summary.criticalCount > 0 ? "negative" : "accent"}
        />
        <Stat
          label="Already on track"
          value={String(plan.summary.onTrackCount)}
          tone="positive"
        />
        <Stat
          label="Est. tax saving available"
          value={money(plan.summary.totalEstimatedTaxSaving)}
          sub="First year, from the actions below"
          tone="positive"
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold">The order to do things in</h2>
        <p className="mt-1 text-sm text-neutral-400">
          This is the part that matters most and gets explained least. Where the
          next dollar should go, in order — not a list of options.
        </p>

        <Card className="mt-3 p-0">
          <ol className="divide-y divide-white/5">
            {plan.waterfall.map((step) => (
              <li key={step.order} className="flex items-start gap-4 px-5 py-4">
                <span
                  className={clsx(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    step.complete
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-indigo-500/15 text-indigo-300"
                  )}
                >
                  {step.complete ? "✓" : step.order}
                </span>
                <div className="min-w-0">
                  <p
                    className={clsx(
                      "text-sm font-medium",
                      step.complete ? "text-neutral-500 line-through" : "text-neutral-200"
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {grouped.map((group) => (
        <section key={group.category}>
          <h2 className="text-lg font-semibold">{CATEGORY_LABELS[group.category]}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {group.items.map((recommendation) => (
              <RecommendationCard key={recommendation.id} recommendation={recommendation} />
            ))}
          </div>
        </section>
      ))}

      <Card className="border-white/5 bg-transparent">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          How this plan was produced
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
          <li>
            Every recommendation comes from a deterministic rule, using published{" "}
            {TAX_YEAR} IRS figures. Same inputs, same output, every time — no
            model decides anything here.
          </li>
          <li>
            The &quot;Explain in plain English&quot; button rewrites the reasoning
            for readability. It cannot change a number or a conclusion.
          </li>
          <li>
            Nobody is paid a commission on anything recommended here, which is why
            the insurance advice reads the way it does.
          </li>
          <li>
            This is information, not personalised financial advice, and LifeOS is
            not a registered investment adviser. For a complicated situation —
            equity compensation, a business, an estate near the exemption — talk to
            a <em>fee-only</em> fiduciary who is paid by you rather than by a
            product.
          </li>
          <li>
            Engine v{ENGINE_VERSION} · tax year {TAX_YEAR} ·{" "}
            <a
              href={SOURCES.irsRetirement2026}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-300 underline underline-offset-2"
            >
              IRS limits ↗
            </a>
          </li>
        </ul>
      </Card>
    </div>
  );
}
