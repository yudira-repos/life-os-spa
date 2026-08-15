import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { ComingSoon } from "@/components/shell/ComingSoon";

export default async function PropertyOSPage() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "property");
  if (!entitled) return <Locked moduleName="PropertyOS" />;

  return (
    <ComingSoon
      moduleName="PropertyOS"
      tagline="Maintenance, repairs, and finances for your home."
    />
  );
}
