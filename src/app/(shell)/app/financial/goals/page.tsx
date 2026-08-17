import { Card } from "@/components/ui/card";
import {
  AddGoalFromTemplate,
  ContributeToGoal,
  DeleteGoal,
} from "@/components/financialos/GoalControls";
import { requireFinancialAccess } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";
import { buildFinancialContext } from "@/lib/financialos/profile";
import {
  GOAL_TEMPLATES,
  goalProgress,
  resolveTemplateTarget,
  projectGoalGrowth,
} from "@/lib/financialos/goals";
import { formatCents } from "@/lib/financialos/money";

export default async function GoalsPage() {
  const access = await requireFinancialAccess();
  if (!access.ok) return null;
  const { household, user, member, isOwner } = access;
  const scope = { memberId: member.id, isOwner };

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "VIEW_GOALS",
    resource: "GOAL",
  });

  const context = await buildFinancialContext(household.id, scope);
  const templateInput = {
    monthlyEssential: context.monthlyEssentialCents / 100,
    monthlyIncome: context.cashflow.averageMonthlyIncomeCents / 100,
    annualIncome: context.householdIncome,
    emergencyMonths: context.emergencyFundMonthsTarget,
    childCount: context.children.length,
    stateCode: context.stateCode,
  };

  const existingTemplates = new Set(
    context.goals.map((g) => g.templateKey).filter(Boolean) as string[]
  );

  return (
    <div className="flex flex-col gap-8">
      {context.goals.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Your goals</h2>
          <div className="mt-3 flex flex-col gap-3">
            {context.goals.map((goal) => {
              const progress = goalProgress(goal);
              const child = context.children.find((c) => c.memberId === goal.forMemberId);

              return (
                <Card key={goal.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {goal.name}
                        {child && (
                          <span className="ml-2 text-sm font-normal text-neutral-500">
                            for {child.name}
                          </span>
                        )}
                        {goal.status === "COMPLETE" && (
                          <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                            complete
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {formatCents(goal.currentCents)} of {formatCents(goal.targetCents)}
                        {goal.targetDate &&
                          ` · by ${goal.targetDate.toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ContributeToGoal goalId={goal.id} />
                      <DeleteGoal goalId={goal.id} />
                    </div>
                  </div>

                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-indigo-400/70"
                      style={{ width: `${Math.round(progress.progressFraction * 100)}%` }}
                    />
                  </div>

                  <div className="mt-3 grid gap-3 text-xs text-neutral-500 sm:grid-cols-3">
                    <div>
                      <p className="text-neutral-400">Contributing</p>
                      <p className="mt-0.5 text-neutral-300">
                        {formatCents(goal.monthlyContributionCents)}/month
                      </p>
                    </div>
                    {progress.requiredMonthlyCents != null && progress.monthsRemaining ? (
                      <div>
                        <p className="text-neutral-400">Needed to hit the date</p>
                        <p
                          className={
                            progress.onTrack
                              ? "mt-0.5 text-emerald-300"
                              : "mt-0.5 text-amber-300"
                          }
                        >
                          {formatCents(progress.requiredMonthlyCents)}/month
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-neutral-400">Where to keep it</p>
                      <p className="mt-0.5 text-neutral-300">
                        {progress.investable
                          ? "Long enough horizon to invest"
                          : "Under 3 years — keep it in cash"}
                      </p>
                    </div>
                  </div>

                  {progress.investable && goal.monthlyContributionCents > 0 && progress.monthsRemaining ? (
                    <p className="mt-3 text-xs text-neutral-600">
                      Invested at 7%, {formatCents(goal.monthlyContributionCents)}/month for{" "}
                      {progress.monthsRemaining} months grows to about{" "}
                      {formatCents(
                        projectGoalGrowth(goal.monthlyContributionCents, progress.monthsRemaining, true),
                        { whole: true }
                      )}{" "}
                      versus{" "}
                      {formatCents(
                        projectGoalGrowth(goal.monthlyContributionCents, progress.monthsRemaining, false),
                        { whole: true }
                      )}{" "}
                      in savings.
                    </p>
                  ) : null}

                  {goal.notes && (
                    <p className="mt-3 text-xs text-neutral-500">{goal.notes}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">
          {context.goals.length > 0 ? "Add another goal" : "Start with a template"}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Each one starts with a target calculated from your actual numbers, and
          says where the number came from. Change anything you disagree with.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {GOAL_TEMPLATES.map((template) => {
            const already = existingTemplates.has(template.key);
            const target = resolveTemplateTarget(template, templateInput);

            return (
              <Card key={template.key} className={already ? "opacity-50" : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="mr-2">{template.emoji}</span>
                      {template.name}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-400">{template.tagline}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-neutral-200">
                      {formatCents(target * 100, { whole: true })}
                    </p>
                    <p className="text-[11px] text-neutral-600">suggested target</p>
                  </div>
                </div>

                <ul className="mt-3 space-y-1.5 text-sm text-neutral-400">
                  {template.rationale.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>

                <p className="mt-3 text-xs text-neutral-600">
                  <span className="font-medium text-neutral-500">Where the number comes from:</span>{" "}
                  {template.basis}
                </p>
                <p className="mt-1 text-xs text-neutral-600">
                  <span className="font-medium text-neutral-500">Where to keep it:</span>{" "}
                  {template.whereToKeepIt}
                </p>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-indigo-300">
                    Tips for this one
                  </summary>
                  <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
                    {template.tips.map((tip, index) => (
                      <li key={index}>• {tip}</li>
                    ))}
                  </ul>
                </details>

                <div className="mt-4">
                  {already ? (
                    <span className="text-xs text-neutral-500">Already added.</span>
                  ) : (
                    <AddGoalFromTemplate templateKey={template.key} />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
