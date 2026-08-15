import { getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import { Locked } from "@/components/shell/Locked";
import { ComingSoon } from "@/components/shell/ComingSoon";

export default async function TravelOSPage() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const entitled = await isEntitled(household.id, "travel");
  if (!entitled) return <Locked moduleName="TravelOS" />;

  return (
    <ComingSoon
      moduleName="TravelOS"
      tagline="Plan trips around your family's real availability."
    />
  );
}
