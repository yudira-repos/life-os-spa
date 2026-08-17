import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/financialos/Stat";
import { RecommendationCard } from "@/components/financialos/RecommendationCard";
import { PlaidLinkButton } from "@/components/financialos/PlaidLinkButton";
import { requireFinancialAccess } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";
import { buildFinancialContext } from "@/lib/financialos/profile";
import { generatePlanFromContext } from "@/lib/financialos/advice/engine";
import { formatCents, formatCompactCents } from "@/lib/financialos/money";
import { goalProgress } from "@/lib/financialos/goals";
import { db } from "@/lib/db";

export default async function FinancialOverviewPage() {
  const access = await requireFinancialAccess();
  if (!access.ok) return null; // the layout already rendered the denial

  const { household, user, member, isOwner } = access;
  const scope = { memberId: member.id, isOwner };

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "VIEW_OVERVIEW",
    resource: "MODULE",
  });

  const context = await buildFinancialContext(household.id, scope);
  const plan = generatePlanFromContext(context);
  const itemCount = await db.plaidItem.count({ where: { householdId: household.id } });

  const noData = context.netWorth.accountCount === 0;
  const topActions = plan.recommendations
    .filter((r) => r.status === "ACTION_NEEDED")
    .slice(0, 3);

  const activeGoals = context.goals.filter((g) => g.status === "ACTIVE").slice(0, 3);

  return (
    <div className="flex flex-col gap-8">
      {noData && (
        <Card className="border-indigo-400/20 bg-indigo-500/5">
          <p className="font-semibold">Start by connecting an account.</p>
          <p className="mt-1 text-sm text-neutral-400">
            FinancialOS reads balances and transactions through Plaid, the same
            connection your bank already supports. Your credentials go to Plaid,
            never to LifeOS — we only hold a token, and it&apos;s encrypted at rest.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <PlaidLinkButton />
            <Link
              href="/app/financial/setup"
              className="text-sm text-indigo-300 underline underline-offset-2"
            >
              Or fill in your details manually
            </Link>
          </div>
        </Card>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Net worth"
          value={formatCompactCents(context.netWorth.netWorthCents)}
          sub={`${formatCompactCents(context.netWorth.assetsCents)} assets − ${formatCompactCents(context.netWorth.liabilitiesCents)} debts`}
          tone={context.netWorth.netWorthCents >= 0 ? "neutral" : "negative"}
        />
        <Stat
          label="This month"
          value={formatCents(context.cashflow.current.netCents, { whole: true })}
          sub={`${formatCents(context.cashflow.current.incomeCents, { whole: true })} in · ${formatCents(context.cashflow.current.expenseCents, { whole: true })} out`}
          tone={context.cashflow.current.netCents >= 0 ? "positive" : "negative"}
        />
        <Stat
          label="Savings rate"
          value={
            context.cashflow.hasEnoughData
              ? `${Math.round(context.cashflow.averageSavingsRate * 100)}%`
              : "—"
          }
          sub={
            context.cashflow.hasEnoughData
              ? `${formatCents(context.monthlySurplusCents, { whole: true })}/month surplus`
              : "Needs a few weeks of transactions"
          }
          tone={context.cashflow.averageSavingsRate >= 0.2 ? "positive" : "neutral"}
        />
        <Stat
          label="Emergency runway"
          value={
            context.monthlyEssentialCents > 0
              ? `${(context.netWorth.liquidCents / context.monthlyEssentialCents).toFixed(1)} mo`
              : "—"
          }
          sub={`Target ${context.emergencyFundMonthsTarget} months`}
          tone={
            context.monthlyEssentialCents > 0 &&
            context.netWorth.liquidCents / context.monthlyEssentialCents >=
              context.emergencyFundMonthsTarget
              ? "positive"
              : "accent"
          }
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">What to do next</h2>
          <Link
            href="/app/financial/plan"
            className="text-sm text-indigo-300 underline underline-offset-2"
          >
            See the full plan
          </Link>
        </div>

        {!context.profileComplete ? (
          <Card className="mt-3">
            <p className="text-sm text-neutral-300">
              The plan needs your income and workplace plan details before it can
              recommend anything specific — those aren&apos;t things a bank feed
              can tell us.
            </p>
            <Link
              href="/app/financial/setup"
              className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
            >
              Fill in Setup →
            </Link>
          </Card>
        ) : topActions.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-neutral-300">
              Nothing urgent. Everything the engine checks is either on track or
              doesn&apos;t apply to you.
            </p>
          </Card>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {topActions.map((recommendation) => (
              <RecommendationCard key={recommendation.id} recommendation={recommendation} />
            ))}
          </div>
        )}
      </section>

      {activeGoals.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">Goals</h2>
            <Link
              href="/app/financial/goals"
              className="text-sm text-indigo-300 underline underline-offset-2"
            >
              All goals
            </Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {activeGoals.map((goal) => {
              const progress = goalProgress(goal);
              return (
                <Card key={goal.id} className="p-5">
                  <p className="text-sm font-medium">{goal.name}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-indigo-400/70"
                      style={{ width: `${Math.round(progress.progressFraction * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    {formatCents(goal.currentCents, { whole: true })} of{" "}
                    {formatCents(goal.targetCents, { whole: true })}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-medium">Connected institutions</p>
          <p className="mt-1 text-2xl font-semibold">{itemCount}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {context.netWorth.accountCount} account
            {context.netWorth.accountCount === 1 ? "" : "s"} ·{" "}
            {context.cashflow.transactionCount} transactions in the last 6 months
          </p>
          <Link
            href="/app/financial/accounts"
            className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
          >
            Manage accounts →
          </Link>
        </Card>

        <Card>
          <p className="text-sm font-medium">New to any of this?</p>
          <p className="mt-1 text-sm text-neutral-400">
            Plain-language explanations of every term the plan uses — the 401(k)
            match, backdoor Roth, index funds, term vs whole life. Written for
            someone who was never taught it.
          </p>
          <Link
            href="/app/financial/learn"
            className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
          >
            Start with the basics →
          </Link>
        </Card>
      </section>
    </div>
  );
}
