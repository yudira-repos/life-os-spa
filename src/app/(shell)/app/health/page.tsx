import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { ComingSoon } from "@/components/shell/ComingSoon";

export default async function HealthOSPage() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "health");
  if (!entitled) return <Locked moduleName="HealthOS" />;

  return (
    <ComingSoon
      moduleName="HealthOS"
      tagline="Family health records and healthy-lifestyle guidance."
    />
  );
}
