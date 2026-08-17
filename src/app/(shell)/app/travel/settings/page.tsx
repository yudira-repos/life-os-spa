import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requireTravelPlanner } from "@/lib/travelos/authz";
import { getTravelPreferences } from "@/lib/travelos/service";
import { parseStyles } from "@/lib/travelos/destinations";
import {
  TravelPreferencesForm,
  AvailabilityForm,
  BlackoutForm,
  DeleteBlackoutButton,
} from "@/components/travelos/TravelSettingsForms";
import { formatRange } from "@/lib/travelos/dates";
import { flightsConfigured } from "@/lib/travelos/flights";
import { extractionConfigured } from "@/lib/travelos/calendar/extract";

export default async function TravelSettingsPage() {
  const access = await requireTravelPlanner();
  if (!access.ok) return null;
  const { household } = access;

  const [preferences, adults, blackouts] = await Promise.all([
    getTravelPreferences(household.id),
    db.householdMember.findMany({
      where: { householdId: household.id, role: { in: ["OWNER", "ADULT"] } },
      include: { travelAvailability: true },
      orderBy: { createdAt: "asc" },
    }),
    db.blackoutPeriod.findMany({
      where: { householdId: household.id },
      include: { member: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <TravelPreferencesForm
        initial={{
          homeAirport: preferences.homeAirport ?? "",
          maxFlightHours: preferences.maxFlightHours,
          domesticOnly: preferences.domesticOnly,
          passportsReady: preferences.passportsReady,
          budgetPerTripDollars: preferences.budgetPerTripCents / 100,
          preferredStyles: parseStyles(preferences.preferredStyles),
        }}
      />

      <Card className="p-0">
        <div className="px-5 pt-5">
          <p className="font-semibold">Time off</p>
          <p className="mt-1 text-sm text-neutral-400">
            A window that needs more PTO than someone has left gets flagged
            rather than silently recommended.
          </p>
        </div>
        <div className="mt-3 divide-y divide-white/5">
          {adults.map((adult) => (
            <AvailabilityForm
              key={adult.id}
              memberId={adult.id}
              memberName={adult.name}
              ptoDaysPerYear={adult.travelAvailability?.ptoDaysPerYear ?? 15}
              ptoDaysRemaining={adult.travelAvailability?.ptoDaysRemaining ?? 15}
            />
          ))}
        </div>
      </Card>

      <Card>
        <p className="font-semibold">Blackout periods</p>
        <p className="mt-1 text-sm text-neutral-400">
          Weeks nobody can travel — a work crunch, on-call, an exam period. Any
          window overlapping one drops to the bottom of the list with the reason
          shown.
        </p>

        {blackouts.length > 0 && (
          <div className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10">
            {blackouts.map((blackout) => (
              <div
                key={blackout.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div>
                  <p className="text-sm text-neutral-200">
                    {formatRange(blackout.startDate, blackout.endDate)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {blackout.member?.name ?? "Whole household"}
                    {blackout.reason ? ` · ${blackout.reason}` : ""}
                  </p>
                </div>
                <DeleteBlackoutButton id={blackout.id} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <BlackoutForm members={adults.map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      </Card>

      <Card className="border-white/5 bg-transparent">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Integrations
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
          <li>
            Flight prices:{" "}
            {flightsConfigured() ? (
              <span className="text-emerald-400">configured</span>
            ) : (
              <span className="text-amber-300">
                needs TRAVELPAYOUTS_TOKEN — free from travelpayouts.com
              </span>
            )}
          </li>
          <li>
            PDF / photo calendar reading:{" "}
            {extractionConfigured() ? (
              <span className="text-emerald-400">configured</span>
            ) : (
              <span className="text-amber-300">
                needs ANTHROPIC_API_KEY — .ics and .csv work without it
              </span>
            )}
          </li>
          <li>
            Confirming a trip creates a vacation savings goal in FinancialOS, if
            that module is enabled for this household.
          </li>
          <li>
            Windows are checked against children&apos;s active KidsOS activities
            and flagged, so a trip doesn&apos;t land on a tournament.
          </li>
        </ul>
      </Card>
    </div>
  );
}
