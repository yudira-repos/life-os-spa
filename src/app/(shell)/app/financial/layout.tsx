import type { ReactNode } from "react";
import { Locked } from "@/components/shell/Locked";
import { AdultsOnly } from "@/components/financialos/AdultsOnly";
import { FinanceSubNav } from "@/components/financialos/FinanceSubNav";
import { requireFinancialAccess } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";

// The module-wide gate. Every FinancialOS page renders inside this layout, so
// the adults-only check happens before any page component runs — a new page
// added later is covered by default rather than by remembering to add a check.
//
// Individual pages still call requireFinancialAccess() themselves to get the
// typed context; this layout is the belt to that suspenders.

export default async function FinancialLayout({ children }: { children: ReactNode }) {
  const access = await requireFinancialAccess();

  if (!access.ok) {
    if (access.household) {
      await auditFinancial({
        householdId: access.household.id,
        action: "ACCESS_DENIED",
        resource: "MODULE",
        outcome: "DENIED",
        meta: { reason: access.reason, surface: "page" },
      });
    }

    if (access.reason === "NOT_ENTITLED") return <Locked moduleName="FinancialOS" />;
    if (access.reason === "NOT_AN_ADULT") return <AdultsOnly />;
    return null; // the shell layout already redirects for session/household
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <FinanceSubNav />
      {children}
    </div>
  );
}
