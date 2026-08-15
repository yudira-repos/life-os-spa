import { getCurrentHousehold } from "@/lib/session";
import { getEntitlements } from "@/lib/entitlements";
import { MODULES } from "@/lib/modules.config";
import { Card } from "@/components/ui/card";

// The whole "subscription model" for V1: show what's included in plain
// language, and an honest stub for anything else. No Stripe, no plans
// table — see DESIGN.md for why that's deliberate for now.
export default async function SubscriptionPage() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitlements = await getEntitlements(household.id);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-2xl font-semibold tracking-tight">Subscription</p>
      <p className="mt-1 text-sm text-neutral-400">
        Current plan: <span className="text-neutral-200">{household.plan}</span>
      </p>

      <Card className="mt-8">
        <div className="flex flex-col divide-y divide-white/5">
          {MODULES.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-neutral-500">{m.tagline}</p>
              </div>
              <span
                className={
                  entitlements[m.id]
                    ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400"
                    : "rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-neutral-500"
                }
              >
                {entitlements[m.id] ? "Included" : "Locked"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <p className="mt-6 text-sm text-neutral-500">
        Want another module unlocked?{" "}
        <a href="mailto:support@yudira.buzz" className="text-indigo-300 hover:underline">
          Email us
        </a>{" "}
        — there&apos;s no self-serve checkout yet, on purpose: we&apos;d rather get
        LifeOS genuinely useful first.
      </p>
    </div>
  );
}
