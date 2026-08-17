import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requireTravelPlanner, assertWindowInHousehold } from "@/lib/travelos/authz";
import { suggestDestinations, getTravelPreferences } from "@/lib/travelos/service";
import { FindFlightsButton, ConfirmTripButton } from "@/components/travelos/WindowActions";
import { formatRange } from "@/lib/travelos/dates";
import { SEASON_LABELS, SEASON_NOTES } from "@/lib/travelos/seasonality";
import { flightsConfigured, freshnessLabel } from "@/lib/travelos/flights";
import { STYLE_LABELS } from "@/lib/travelos/destinations";
import { formatCents } from "@/lib/financialos/money";

export default async function WindowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireTravelPlanner();
  if (!access.ok) return null;

  const { id } = await params;
  const window = await assertWindowInHousehold(access.household.id, id);
  if (!window) return notFound();

  const [{ destinations, season }, preferences, flights, travellers] = await Promise.all([
    suggestDestinations(access.household.id, {
      startDate: window.startDate,
      endDate: window.endDate,
      totalDays: window.totalDays,
    }),
    getTravelPreferences(access.household.id),
    db.flightOption.findMany({
      where: { windowId: window.id },
      orderBy: [{ priceCents: "asc" }],
    }),
    db.householdMember.count({
      where: {
        householdId: access.household.id,
        role: { in: ["OWNER", "ADULT", "CHILD"] },
      },
    }),
  ]);

  const seasonKey = (window.seasonLabel ?? season.season) as keyof typeof SEASON_LABELS;
  const cheapestByDestination = new Map<string, (typeof flights)[number]>();
  for (const flight of flights) {
    if (!cheapestByDestination.has(flight.destination)) {
      cheapestByDestination.set(flight.destination, flight);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/travel" className="text-xs text-neutral-500 hover:text-neutral-300">
        ← All windows
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{window.label}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {formatRange(window.startDate, window.endDate)} · {window.totalDays} days ·{" "}
          {window.ptoDaysRequired === 0
            ? "no PTO needed"
            : `${window.ptoDaysRequired} PTO day${window.ptoDaysRequired === 1 ? "" : "s"} each`}{" "}
          · {SEASON_LABELS[seasonKey]}
        </p>
        <p className="mt-1 text-xs text-neutral-600">{SEASON_NOTES[seasonKey]}</p>
      </div>

      {!preferences.homeAirport && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <p className="text-sm text-neutral-300">
            Set your home airport before searching flights — every price is
            quoted from there.
          </p>
          <Link
            href="/app/travel/settings"
            className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
          >
            TravelOS settings →
          </Link>
        </Card>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Where could you go?</h2>
          {preferences.homeAirport && flightsConfigured() && (
            <FindFlightsButton windowId={window.id} />
          )}
        </div>

        {!flightsConfigured() && (
          <p className="mt-2 text-xs text-neutral-500">
            Flight prices need TRAVELPAYOUTS_TOKEN. Destination matching below
            works without it.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {destinations.map((match) => {
            const flight = cheapestByDestination.get(match.destination.code);
            const groundCost = match.destination.dailyFamilyCost * window.totalDays;
            const flightTotal = flight ? (flight.priceCents * travellers) / 100 : null;

            return (
              <Card key={match.destination.code}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {match.destination.name}
                      <span className="ml-2 text-sm font-normal text-neutral-500">
                        {match.destination.code}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {match.destination.styles.map((s) => STYLE_LABELS[s]).join(" · ")}
                    </p>
                    <p className="mt-2 text-sm text-neutral-300">{match.destination.pitch}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    {flight ? (
                      <>
                        <p className="text-sm font-semibold tabular-nums text-neutral-100">
                          {formatCents(flight.priceCents)}{" "}
                          <span className="text-xs font-normal text-neutral-500">/ person</span>
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatCents(Math.round((flightTotal ?? 0) * 100), { whole: true })} for{" "}
                          {travellers}
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-600">
                          {flight.transfers === 0
                            ? "nonstop"
                            : `${flight.transfers} stop${flight.transfers === 1 ? "" : "s"}`}
                          {flight.airline ? ` · ${flight.airline}` : ""}
                        </p>
                        <p className="text-[11px] text-neutral-600">
                          cached fare, {freshnessLabel(flight.priceSeenAt)}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-neutral-600">no fare looked up yet</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
                  <span>
                    ~${groundCost.toLocaleString()} on the ground for {window.totalDays} days
                  </span>
                  {flightTotal != null && (
                    <span className="text-neutral-400">
                      Estimated total:{" "}
                      {formatCents(Math.round((flightTotal + groundCost) * 100), { whole: true })}
                    </span>
                  )}
                </div>

                {match.reasons.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-neutral-400">
                    {match.reasons.slice(0, 2).map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                )}

                {match.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                    {match.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <ConfirmTripButton
                    windowId={window.id}
                    destinationCode={match.destination.code}
                    destinationName={match.destination.name}
                    flightOptionId={flight?.id}
                  />
                  {flight?.bookingUrl && (
                    <a
                      href={flight.bookingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-300 underline underline-offset-2"
                    >
                      See live fares ↗
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {flights.length > 0 && (
        <Card className="border-white/5 bg-transparent">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            About these prices
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-neutral-500">
            <li>
              These are cached fares — real prices that real searches returned
              recently, not a live quote. The timestamp on each one is when it
              was last seen.
            </li>
            <li>
              Fares are per person; the totals multiply by the {travellers}{" "}
              people in your household.
            </li>
            <li>
              LifeOS never books anything. &quot;See live fares&quot; opens the
              airline or Aviasales, where the real, current price is.
            </li>
            <li>
              Ground costs are a typical daily figure for a family, not a quote.
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}
