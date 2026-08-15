import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { ComingSoon } from "@/components/shell/ComingSoon";

export default async function FinancialOSPage() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "financial");
  if (!entitled) return <Locked moduleName="FinancialOS" />;

  return (
    <ComingSoon
      moduleName="FinancialOS"
      tagline="Net worth, retirement, and the household financial plan."
    />
  );
}
