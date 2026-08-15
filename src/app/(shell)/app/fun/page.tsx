import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { Card } from "@/components/ui/card";
import { FUN_SUGGESTIONS } from "@/lib/seed-content";

export default async function FunOSPage() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "fun");
  if (!entitled) return <Locked moduleName="FunOS" />;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-2xl font-semibold tracking-tight">FunOS</p>
      <p className="mt-1 text-sm text-neutral-400">
        Help the family intentionally spend time together.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            This weekend
          </p>
          <p className="mt-2 font-medium">{FUN_SUGGESTIONS.weekend.title}</p>
          <p className="mt-1 text-sm text-neutral-400">{FUN_SUGGESTIONS.weekend.detail}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">
            Movie night
          </p>
          <p className="mt-2 font-medium">{FUN_SUGGESTIONS.movie.title}</p>
          <p className="mt-1 text-sm text-neutral-400">{FUN_SUGGESTIONS.movie.detail}</p>
        </Card>
      </div>
    </div>
  );
}
