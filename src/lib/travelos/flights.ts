import { dayKey, parseDay } from "@/lib/travelos/dates";

// Flight prices, via the Travelpayouts (Aviasales) Flights Data API.
//
// This is the only file that talks to a flight provider — same boundary as
// financialos/plaid.ts, so swapping providers is one file.
//
// WHY THIS PROVIDER, stated plainly because the constraint shapes the feature:
// Amadeus decommissioned its self-service API on 17 July 2026, and Kiwi and
// Skyscanner are partner-approval only. What remains open to a self-serve
// developer returns CACHED prices — real fares that real people were quoted,
// observed within roughly the last 48 hours to a week, rather than a live
// search.
//
// So this module never claims to show live prices. Every option carries the
// timestamp the fare was observed at, the UI prints it, and the booking link
// sends you to the airline or Aviasales to see the real number. Presenting a
// two-day-old fare as bookable-right-now is the one failure that would make
// the whole feature untrustworthy, so the freshness travels with the price
// everywhere it goes.
//
// We also never book. LifeOS shows options; a human decides and books.

const BASE_URL = "https://api.travelpayouts.com";
const AVIASALES_BASE = "https://www.aviasales.com";

export class FlightsNotConfiguredError extends Error {
  constructor() {
    super(
      "Flight search needs TRAVELPAYOUTS_TOKEN. Sign up free at travelpayouts.com, " +
        "then copy the API token from your profile."
    );
    this.name = "FlightsNotConfiguredError";
  }
}

export function flightsConfigured(): boolean {
  return Boolean(process.env.TRAVELPAYOUTS_TOKEN);
}

function token(): string {
  const value = process.env.TRAVELPAYOUTS_TOKEN;
  if (!value) throw new FlightsNotConfiguredError();
  return value;
}

export interface FlightOffer {
  origin: string;
  destination: string;
  departAt: Date;
  returnAt: Date | null;
  priceCents: number;
  currency: string;
  airline: string | null;
  flightNumber: string | null;
  transfers: number;
  durationMinutes: number | null;
  bookingUrl: string | null;
  /** When the provider last saw this fare. Never presented as "now". */
  priceSeenAt: Date;
}

interface RawOffer {
  origin?: string;
  destination?: string;
  departure_at?: string;
  return_at?: string;
  price?: number;
  airline?: string;
  flight_number?: string | number;
  transfers?: number;
  return_transfers?: number;
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  link?: string;
}

/**
 * Cheapest fares for a specific date range.
 *
 * Uses /aviasales/v3/prices_for_dates — the current endpoint. The older
 * /v1/prices/cheap and /v1/prices/calendar routes are deprecated by
 * Travelpayouts and are deliberately not used here.
 */
export async function searchFlights(params: {
  origin: string;
  destination: string;
  departDate: Date;
  returnDate?: Date | null;
  currency?: string;
  limit?: number;
  directOnly?: boolean;
  /** Widen the search by ±N days around the given dates. */
  flexibilityDays?: number;
}): Promise<FlightOffer[]> {
  const url = new URL(`${BASE_URL}/aviasales/v3/prices_for_dates`);
  url.searchParams.set("origin", params.origin.toUpperCase());
  url.searchParams.set("destination", params.destination.toUpperCase());
  url.searchParams.set("departure_at", dayKey(params.departDate));
  if (params.returnDate) url.searchParams.set("return_at", dayKey(params.returnDate));
  url.searchParams.set("currency", params.currency ?? "usd");
  url.searchParams.set("limit", String(params.limit ?? 10));
  url.searchParams.set("sorting", "price");
  url.searchParams.set("one_way", params.returnDate ? "false" : "true");
  if (params.directOnly) url.searchParams.set("direct", "true");
  url.searchParams.set("token", token());

  const response = await fetch(url, {
    headers: { "X-Access-Token": token(), Accept: "application/json" },
    // Cached data on their side; caching briefly on ours avoids hammering the
    // endpoint when several destinations are priced for the same window.
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    throw new Error(
      `Flight search failed (${response.status}). The provider may be rate-limiting; try again shortly.`
    );
  }

  const body = (await response.json()) as {
    success?: boolean;
    data?: RawOffer[];
    error?: string;
    currency?: string;
  };

  if (body.success === false) {
    throw new Error(body.error ?? "Flight search returned an error.");
  }

  const currency = (body.currency ?? params.currency ?? "USD").toUpperCase();
  const offers: FlightOffer[] = [];

  for (const raw of body.data ?? []) {
    const departAt = parseDay(raw.departure_at ?? "");
    if (!departAt || typeof raw.price !== "number") continue;

    offers.push({
      origin: (raw.origin ?? params.origin).toUpperCase(),
      destination: (raw.destination ?? params.destination).toUpperCase(),
      departAt,
      returnAt: parseDay(raw.return_at ?? "") ?? null,
      // The API quotes whole units of the currency, not minor units.
      priceCents: Math.round(raw.price * 100),
      currency,
      airline: raw.airline ?? null,
      flightNumber: raw.flight_number != null ? String(raw.flight_number) : null,
      transfers: (raw.transfers ?? 0) + (raw.return_transfers ?? 0),
      durationMinutes: raw.duration ?? null,
      bookingUrl: buildBookingUrl(raw.link),
      // The API does not return an observation timestamp on this endpoint.
      // Fetch time is the honest upper bound on freshness — the fare is at
      // least this old, never newer. The UI says "seen recently", never "live".
      priceSeenAt: new Date(),
    });
  }

  return offers.sort((a, b) => a.priceCents - b.priceCents);
}

/**
 * Price several destinations for one window and return the cheapest few.
 * Sequential rather than parallel: this is a cached-data endpoint with rate
 * limits, and a burst of parallel requests is the fastest way to get throttled.
 */
export async function priceDestinations(params: {
  origin: string;
  destinations: string[];
  departDate: Date;
  returnDate: Date;
  currency?: string;
  perDestination?: number;
}): Promise<{ offers: FlightOffer[]; errors: { destination: string; message: string }[] }> {
  const offers: FlightOffer[] = [];
  const errors: { destination: string; message: string }[] = [];

  for (const destination of params.destinations) {
    try {
      const found = await searchFlights({
        origin: params.origin,
        destination,
        departDate: params.departDate,
        returnDate: params.returnDate,
        currency: params.currency,
        limit: params.perDestination ?? 3,
      });
      offers.push(...found);
    } catch (error) {
      errors.push({
        destination,
        message: error instanceof Error ? error.message : "Lookup failed",
      });
    }
  }

  return { offers: offers.sort((a, b) => a.priceCents - b.priceCents), errors };
}

/**
 * The API returns a relative Aviasales path. Append the affiliate marker if
 * one is configured — TravelOS works fine without it, the link just isn't
 * attributed.
 */
function buildBookingUrl(link: string | undefined): string | null {
  if (!link) return null;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  const separator = link.includes("?") ? "&" : "?";
  const suffix = marker ? `${separator}marker=${encodeURIComponent(marker)}` : "";
  return `${AVIASALES_BASE}${link}${suffix}`;
}

/** Fallback link when the provider gives no deep link. */
export function searchLinkFor(
  origin: string,
  destination: string,
  departDate: Date,
  returnDate?: Date | null
): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  const query = new URLSearchParams({
    origin_iata: origin.toUpperCase(),
    destination_iata: destination.toUpperCase(),
    depart_date: dayKey(departDate),
    ...(returnDate ? { return_date: dayKey(returnDate) } : {}),
    ...(marker ? { marker } : {}),
  });
  return `${AVIASALES_BASE}/search?${query.toString()}`;
}

/** How stale a cached fare is, in plain words. */
export function freshnessLabel(seenAt: Date, now = new Date()): string {
  const hours = Math.max(Math.round((now.getTime() - seenAt.getTime()) / 3_600_000), 0);
  if (hours < 1) return "checked just now";
  if (hours < 24) return `checked ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `checked ${days} day${days === 1 ? "" : "s"} ago`;
}
