import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute, assertWindowInHousehold } from "@/lib/travelos/authz";
import {
  priceDestinations,
  flightsConfigured,
  FlightsNotConfiguredError,
  searchLinkFor,
} from "@/lib/travelos/flights";
import { suggestDestinations, getTravelPreferences } from "@/lib/travelos/service";
import { DESTINATION_BY_CODE } from "@/lib/travelos/destinations";

// Price the top destination matches for one window.
//
// Flight prices are PLAN-tier: a cached fare is still commercial information
// tied to a household's budget, and the confirmation flow that follows it
// creates a savings goal.
//
// Prices are cached upstream, so each option is stored with the time we
// fetched it and the UI labels it. We never call this "live".

export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const window = await assertWindowInHousehold(guard.household.id, id);
  if (!window) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const preferences = await getTravelPreferences(guard.household.id);
  if (!preferences.homeAirport) {
    return NextResponse.json(
      { error: "Set your home airport in TravelOS settings first — every search starts from there." },
      { status: 400 }
    );
  }

  if (!flightsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Flight search needs TRAVELPAYOUTS_TOKEN. Sign up free at travelpayouts.com and copy the API token from your profile.",
      },
      { status: 503 }
    );
  }

  const { destinations } = await suggestDestinations(guard.household.id, {
    startDate: window.startDate,
    endDate: window.endDate,
    totalDays: window.totalDays,
  });

  // Price the best few matches. More than this and we're spending the
  // provider's rate limit to show options nobody scrolls to.
  const candidates = destinations.slice(0, 5).map((match) => match.destination.code);

  try {
    const { offers, errors } = await priceDestinations({
      origin: preferences.homeAirport,
      destinations: candidates,
      departDate: window.startDate,
      returnDate: window.endDate,
      currency: preferences.currency,
      perDestination: 2,
    });

    // Replace this window's options rather than accumulating stale ones.
    await db.flightOption.deleteMany({ where: { windowId: window.id, tripId: null } });

    // At least three options, as asked — one per destination first, so the
    // list is three genuine choices rather than three fares to the same place.
    const seen = new Set<string>();
    const spread = offers.filter((offer) => {
      if (seen.has(offer.destination)) return false;
      seen.add(offer.destination);
      return true;
    });
    const chosen = [...spread, ...offers.filter((o) => !spread.includes(o))].slice(0, 6);

    const created = await Promise.all(
      chosen.map((offer, index) =>
        db.flightOption.create({
          data: {
            windowId: window.id,
            origin: offer.origin,
            destination: offer.destination,
            destinationName: DESTINATION_BY_CODE[offer.destination]?.name ?? null,
            departAt: offer.departAt,
            returnAt: offer.returnAt,
            priceCents: offer.priceCents,
            currency: offer.currency,
            airline: offer.airline,
            flightNumber: offer.flightNumber,
            transfers: offer.transfers,
            durationMinutes: offer.durationMinutes,
            bookingUrl:
              offer.bookingUrl ??
              searchLinkFor(offer.origin, offer.destination, offer.departAt, offer.returnAt),
            priceSeenAt: offer.priceSeenAt,
            rank: index,
          },
        })
      )
    );

    return NextResponse.json({
      options: created.length,
      searched: candidates.length,
      // Failures are reported, not hidden — a destination missing from the
      // list because its lookup failed looks identical to one that was ruled
      // out, and those are very different things.
      errors,
      note:
        created.length === 0
          ? "No cached fares came back for these dates. That usually means nobody has searched this route recently, not that flights don't exist — try a nearby window or check the airline directly."
          : undefined,
    });
  } catch (error) {
    if (error instanceof FlightsNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[travelos] flight search failed", error);
    return NextResponse.json(
      { error: "Flight lookup failed. The provider may be rate-limiting — try again shortly." },
      { status: 502 }
    );
  }
}
