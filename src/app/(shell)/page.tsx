import { getCurrentUser, getCurrentHousehold } from "@/lib/session";
import { getEntitlements } from "@/lib/entitlements";
import { db } from "@/lib/db";
import { MODULES } from "@/lib/modules.config";
import { ModuleCard } from "@/components/shell/ModuleCard";
import { FUN_SUGGESTIONS } from "@/lib/seed-content";

export default async function HomePage() {
  const user = await getCurrentUser();
  const household = await getCurrentHousehold();
  if (!user || !household) return null; // (shell) layout already redirects

  const [entitlements, members] = await Promise.all([
    getEntitlements(household.id),
    db.householdMember.findMany({ where: { householdId: household.id } }),
  ]);

  const children = members.filter((m) => m.role === "CHILD");

  const highlights: Partial<Record<string, string>> = {
    kids:
      children.length > 0
        ? `${children.length} child ${children.length === 1 ? "profile" : "profiles"} set up`
        : "Add a child in Settings to see daily recommendations",
    fun: FUN_SUGGESTIONS.weekend.title,
  };

  const firstName = user.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-2xl font-semibold tracking-tight">
        {greeting}, {firstName}.
      </p>
      <p className="mt-1 text-sm text-neutral-400">Your life today, in one place.</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            entitled={entitlements[module.id]}
            highlight={highlights[module.id]}
          />
        ))}
      </div>
    </div>
  );
}
