import type { ReactNode } from "react";
import { Locked } from "@/components/shell/Locked";
import { TravelSubNav } from "@/components/travelos/TravelSubNav";
import { requireTravelAccess } from "@/lib/travelos/authz";

// Module-wide gate. Unlike FinancialOS, this one admits every household
// member — a child can see when spring break is and where the family is going.
// The tighter PLAN check (budgets, PTO, prices, savings goals) happens per
// route and per action, not here.

export default async function TravelLayout({ children }: { children: ReactNode }) {
  const access = await requireTravelAccess();

  if (!access.ok) {
    if (access.reason === "NOT_ENTITLED") return <Locked moduleName="TravelOS" />;
    if (access.reason === "NOT_A_PLANNER") {
      return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
          <p className="text-4xl">✈️</p>
          <p className="text-lg font-semibold">You&apos;re not a member of this household yet.</p>
          <p className="text-sm text-neutral-400">
            Ask whoever set up LifeOS to add you in Settings.
          </p>
        </div>
      );
    }
    return null; // the shell layout handles session/household redirects
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <TravelSubNav />
      {children}
    </div>
  );
}
