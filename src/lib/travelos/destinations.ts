import type { Season } from "@/lib/travelos/seasonality";

// A curated destination catalog — static content, same pattern as the KidsOS
// activity and career catalogs.
//
// Static rather than API-driven on purpose. The question "where should a
// family with a 6-year-old and an 11-year-old go for five days in late March,
// flying from SFO" is answered by knowledge about places, not by a price feed.
// Prices come later and only re-rank what's already suitable.
//
// Each entry records what a family actually needs to decide: how long the
// flight is, which months are pleasant versus miserable, what the kids will
// do, and roughly what it costs. `bestMonths` is the field that does the most
// work — it's what stops the module suggesting Phoenix in July.

export type DestinationStyle =
  | "BEACH"
  | "CITY"
  | "NATURE"
  | "THEME_PARK"
  | "SNOW"
  | "ROAD_TRIP"
  | "CULTURE";

export const STYLE_LABELS: Record<DestinationStyle, string> = {
  BEACH: "Beach",
  CITY: "City",
  NATURE: "Nature & parks",
  THEME_PARK: "Theme parks",
  SNOW: "Snow",
  ROAD_TRIP: "Road trip",
  CULTURE: "Culture & history",
};

export interface Destination {
  code: string; // primary IATA airport
  name: string;
  region: string;
  country: string;
  styles: DestinationStyle[];
  /** Months (1-12) when weather and crowds are genuinely good. */
  bestMonths: number[];
  /** Months to avoid, with the reason — heat, hurricanes, monsoon, crowds. */
  avoidMonths: number[];
  avoidReason?: string;
  /** Rough age band this suits best. */
  minKidAge: number;
  /** 1 (cheap) to 5 (expensive), before flights. */
  costTier: number;
  /** Typical daily spend for a family of four, excluding flights, in dollars. */
  dailyFamilyCost: number;
  international: boolean;
  passportRequired: boolean;
  /** Why a family would pick this, in one line. */
  pitch: string;
  kidHighlights: string[];
  /** Ideal trip length in days. Used to match against window length. */
  idealDays: [number, number];
}

export const DESTINATIONS: Destination[] = [
  {
    code: "SAN", name: "San Diego", region: "Southern California", country: "USA",
    styles: ["BEACH", "THEME_PARK", "NATURE"],
    bestMonths: [3, 4, 5, 6, 9, 10], avoidMonths: [],
    minKidAge: 0, costTier: 3, dailyFamilyCost: 340,
    international: false, passportRequired: false,
    pitch: "Beaches, the zoo, and Legoland within half an hour of each other — the lowest-friction family trip on the west coast.",
    kidHighlights: ["San Diego Zoo", "Legoland California", "Balboa Park", "La Jolla tide pools"],
    idealDays: [4, 7],
  },
  {
    code: "MCO", name: "Orlando", region: "Florida", country: "USA",
    styles: ["THEME_PARK"],
    bestMonths: [2, 3, 4, 10, 11], avoidMonths: [6, 7, 8], avoidReason: "Brutal heat, afternoon storms, and the longest queues of the year.",
    minKidAge: 4, costTier: 4, dailyFamilyCost: 520,
    international: false, passportRequired: false,
    pitch: "The theme park trip. Expensive and exhausting, and for a certain age of child, unforgettable.",
    kidHighlights: ["Walt Disney World", "Universal Studios", "Kennedy Space Center"],
    idealDays: [5, 8],
  },
  {
    code: "HNL", name: "Oahu, Hawaii", region: "Hawaii", country: "USA",
    styles: ["BEACH", "NATURE", "CULTURE"],
    bestMonths: [4, 5, 9, 10], avoidMonths: [],
    minKidAge: 0, costTier: 4, dailyFamilyCost: 480,
    international: false, passportRequired: false,
    pitch: "Warm water year-round, no passport, and shoulder-season fares that are a fraction of the December ones.",
    kidHighlights: ["Waikiki beginner surf lessons", "Pearl Harbor", "Hanauma Bay snorkeling"],
    idealDays: [6, 10],
  },
  {
    code: "SLC", name: "Park City / Salt Lake", region: "Utah", country: "USA",
    styles: ["SNOW", "NATURE"],
    bestMonths: [1, 2, 3, 7, 8], avoidMonths: [4, 5, 11], avoidReason: "Between seasons — the snow has gone and the trails are still muddy.",
    minKidAge: 4, costTier: 3, dailyFamilyCost: 400,
    international: false, passportRequired: false,
    pitch: "Ski resorts 40 minutes from the airport in winter, and five national parks within a day's drive in summer.",
    kidHighlights: ["Ski school", "Utah Olympic Park", "Arches and Zion day trips"],
    idealDays: [4, 7],
  },
  {
    code: "DEN", name: "Denver & the Rockies", region: "Colorado", country: "USA",
    styles: ["NATURE", "SNOW", "ROAD_TRIP"],
    bestMonths: [6, 7, 8, 9, 1, 2], avoidMonths: [4, 11], avoidReason: "Mud season — lifts closed, trails not yet open.",
    minKidAge: 3, costTier: 3, dailyFamilyCost: 360,
    international: false, passportRequired: false,
    pitch: "Rocky Mountain National Park in summer, ski towns in winter, and a major airport that keeps fares sane.",
    kidHighlights: ["Rocky Mountain National Park", "Ski school", "Denver Museum of Nature & Science"],
    idealDays: [4, 8],
  },
  {
    code: "SEA", name: "Seattle & the Olympic Peninsula", region: "Pacific Northwest", country: "USA",
    styles: ["CITY", "NATURE"],
    bestMonths: [6, 7, 8, 9], avoidMonths: [11, 12, 1, 2], avoidReason: "Short, grey, wet days — hard going with young kids.",
    minKidAge: 3, costTier: 3, dailyFamilyCost: 350,
    international: false, passportRequired: false,
    pitch: "A walkable city plus rainforest, mountains and ferries within two hours — good for mixed-age kids.",
    kidHighlights: ["Pacific Science Center", "Olympic National Park", "Ferry to Bainbridge"],
    idealDays: [4, 7],
  },
  {
    code: "NYC", name: "New York City", region: "Northeast", country: "USA",
    styles: ["CITY", "CULTURE"],
    bestMonths: [4, 5, 9, 10, 12], avoidMonths: [7, 8], avoidReason: "Humid, and the city empties of everything except queues.",
    minKidAge: 6, costTier: 4, dailyFamilyCost: 520,
    international: false, passportRequired: false,
    pitch: "The trip that lands best once kids are old enough to walk all day and remember it.",
    kidHighlights: ["American Museum of Natural History", "Statue of Liberty", "Central Park", "A Broadway matinee"],
    idealDays: [4, 6],
  },
  {
    code: "WAS", name: "Washington, D.C.", region: "Mid-Atlantic", country: "USA",
    styles: ["CULTURE", "CITY"],
    bestMonths: [3, 4, 5, 9, 10], avoidMonths: [7, 8], avoidReason: "Heat and humidity make the Mall unbearable by midday.",
    minKidAge: 7, costTier: 3, dailyFamilyCost: 380,
    international: false, passportRequired: false,
    pitch: "Every Smithsonian museum is free, which makes it one of the cheapest educational trips in the country.",
    kidHighlights: ["Air and Space Museum", "Natural History Museum", "Monuments at night"],
    idealDays: [4, 6],
  },
  {
    code: "PHX", name: "Phoenix & Sedona", region: "Arizona", country: "USA",
    styles: ["NATURE", "ROAD_TRIP"],
    bestMonths: [2, 3, 4, 11], avoidMonths: [6, 7, 8], avoidReason: "Regularly over 105°F — genuinely dangerous for young kids outdoors.",
    minKidAge: 4, costTier: 2, dailyFamilyCost: 300,
    international: false, passportRequired: false,
    pitch: "Spring break weather that actually delivers, with the Grand Canyon a half-day drive north.",
    kidHighlights: ["Grand Canyon", "Sedona red rocks", "Desert Botanical Garden"],
    idealDays: [4, 7],
  },
  {
    code: "YVR", name: "Vancouver & Whistler", region: "British Columbia", country: "Canada",
    styles: ["CITY", "NATURE", "SNOW"],
    bestMonths: [6, 7, 8, 1, 2], avoidMonths: [11], avoidReason: "The wettest month of the year.",
    minKidAge: 3, costTier: 3, dailyFamilyCost: 400,
    international: true, passportRequired: true,
    pitch: "An easy first international trip — short flight, no language barrier, and a favourable exchange rate.",
    kidHighlights: ["Capilano Suspension Bridge", "Stanley Park", "Whistler ski school"],
    idealDays: [5, 8],
  },
  {
    code: "SJD", name: "Los Cabos", region: "Baja California", country: "Mexico",
    styles: ["BEACH"],
    bestMonths: [3, 4, 5, 11, 12], avoidMonths: [8, 9], avoidReason: "Hurricane season, and the humidity is punishing.",
    minKidAge: 2, costTier: 3, dailyFamilyCost: 420,
    international: true, passportRequired: true,
    pitch: "All-inclusive resorts make the budget predictable, which is worth a lot with young kids.",
    kidHighlights: ["Resort kids' clubs", "Whale watching (Dec-Apr)", "Calm-water beaches"],
    idealDays: [5, 8],
  },
  {
    code: "CUN", name: "Riviera Maya", region: "Yucatán", country: "Mexico",
    styles: ["BEACH", "CULTURE"],
    bestMonths: [12, 1, 2, 3, 4], avoidMonths: [9, 10], avoidReason: "Peak hurricane season and heavy seaweed on the beaches.",
    minKidAge: 3, costTier: 3, dailyFamilyCost: 430,
    international: true, passportRequired: true,
    pitch: "Beach plus Mayan ruins and cenotes — the kids get a holiday and you get something to remember.",
    kidHighlights: ["Chichén Itzá", "Cenote swimming", "Xcaret"],
    idealDays: [6, 9],
  },
  {
    code: "KOA", name: "Big Island, Hawaii", region: "Hawaii", country: "USA",
    styles: ["NATURE", "BEACH"],
    bestMonths: [4, 5, 9, 10], avoidMonths: [],
    minKidAge: 5, costTier: 4, dailyFamilyCost: 470,
    international: false, passportRequired: false,
    pitch: "An active volcano, black sand beaches and manta ray night snorkels — the science-museum kid's dream trip.",
    kidHighlights: ["Volcanoes National Park", "Manta ray snorkel", "Mauna Kea stargazing"],
    idealDays: [6, 10],
  },
  {
    code: "ANC", name: "Anchorage & Kenai", region: "Alaska", country: "USA",
    styles: ["NATURE"],
    bestMonths: [6, 7, 8], avoidMonths: [11, 12, 1, 2, 3], avoidReason: "Four hours of daylight and severe cold.",
    minKidAge: 7, costTier: 4, dailyFamilyCost: 450,
    international: false, passportRequired: false,
    pitch: "Glaciers, whales and 19 hours of daylight — a summer trip that doesn't feel like everyone else's summer trip.",
    kidHighlights: ["Kenai Fjords cruise", "Glacier hikes", "Wildlife conservation center"],
    idealDays: [7, 10],
  },
  {
    code: "CHS", name: "Charleston & the Carolina coast", region: "Southeast", country: "USA",
    styles: ["BEACH", "CULTURE", "ROAD_TRIP"],
    bestMonths: [3, 4, 5, 10, 11], avoidMonths: [7, 8], avoidReason: "Heat, humidity and hurricane risk.",
    minKidAge: 4, costTier: 2, dailyFamilyCost: 310,
    international: false, passportRequired: false,
    pitch: "Cheap flights, warm beaches in spring, and enough history to justify the school days.",
    kidHighlights: ["Fort Sumter", "South Carolina Aquarium", "Folly Beach"],
    idealDays: [4, 7],
  },
  {
    code: "LAS", name: "Las Vegas & Zion", region: "Nevada / Utah", country: "USA",
    styles: ["NATURE", "ROAD_TRIP"],
    bestMonths: [3, 4, 10, 11], avoidMonths: [6, 7, 8], avoidReason: "Extreme desert heat.",
    minKidAge: 6, costTier: 2, dailyFamilyCost: 290,
    international: false, passportRequired: false,
    pitch: "Cheap flights and a rental car put Zion, Bryce and the Grand Canyon in reach — use the city as an airport, not a destination.",
    kidHighlights: ["Zion National Park", "Valley of Fire", "Hoover Dam"],
    idealDays: [5, 8],
  },
];

export const DESTINATION_BY_CODE: Record<string, Destination> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.code, d])
);

export interface DestinationMatch {
  destination: Destination;
  score: number;
  reasons: string[];
  warnings: string[];
}

export interface MatchInput {
  startDate: Date;
  endDate: Date;
  totalDays: number;
  season: Season;
  childAges: number[];
  preferredStyles?: DestinationStyle[];
  maxFlightHours?: number;
  domesticOnly?: boolean;
  passportsReady?: boolean;
  budgetPerTripCents?: number;
}

/**
 * Rank destinations for a specific window. Deterministic and explainable —
 * every point added or removed produces a line of reasoning the UI shows, so
 * "why is Orlando not on this list" always has an answer.
 */
export function matchDestinations(input: MatchInput, limit = 6): DestinationMatch[] {
  const month = input.startDate.getUTCMonth() + 1;
  const youngest = input.childAges.length > 0 ? Math.min(...input.childAges) : 8;

  const matches: DestinationMatch[] = [];

  for (const destination of DESTINATIONS) {
    const reasons: string[] = [];
    const warnings: string[] = [];
    let score = 50;

    // Hard filters first — these remove a destination rather than penalise it.
    if (input.domesticOnly && destination.international) continue;
    if (destination.international && input.passportsReady === false) {
      warnings.push("Needs passports, and yours aren't marked ready.");
      score -= 25;
    }

    // Season fit is the heaviest signal.
    if (destination.avoidMonths.includes(month)) {
      score -= 45;
      warnings.push(destination.avoidReason ?? "Not a good month to visit.");
    } else if (destination.bestMonths.includes(month)) {
      score += 30;
      reasons.push(
        `${monthName(month)} is one of the best months to visit — good weather without the peak crowds.`
      );
    } else {
      score += 5;
      reasons.push(`${monthName(month)} is workable, if not the ideal month.`);
    }

    // Trip length fit.
    const [minIdeal, maxIdeal] = destination.idealDays;
    if (input.totalDays >= minIdeal && input.totalDays <= maxIdeal) {
      score += 20;
      reasons.push(`${input.totalDays} days is about right for this trip.`);
    } else if (input.totalDays < minIdeal) {
      score -= (minIdeal - input.totalDays) * 6;
      warnings.push(
        `Really wants ${minIdeal}+ days — at ${input.totalDays} you'd spend a lot of the trip travelling.`
      );
    } else {
      score -= 4;
    }

    // Kid age fit.
    if (youngest < destination.minKidAge) {
      score -= (destination.minKidAge - youngest) * 8;
      warnings.push(
        `Best from about age ${destination.minKidAge}; your youngest is ${youngest}.`
      );
    } else {
      score += 8;
    }

    // Stated preferences.
    if (input.preferredStyles && input.preferredStyles.length > 0) {
      const hits = destination.styles.filter((style) => input.preferredStyles!.includes(style));
      if (hits.length > 0) {
        score += 12 * hits.length;
        reasons.push(`Matches what you said you like: ${hits.map((h) => STYLE_LABELS[h].toLowerCase()).join(", ")}.`);
      } else {
        score -= 8;
      }
    }

    // Budget, on the ground only — flights are priced separately and for real.
    if (input.budgetPerTripCents && input.budgetPerTripCents > 0) {
      const groundCost = destination.dailyFamilyCost * input.totalDays * 100;
      if (groundCost > input.budgetPerTripCents) {
        score -= 20;
        warnings.push(
          `About $${Math.round((groundCost / 100)).toLocaleString()} on the ground before flights — over your per-trip budget.`
        );
      } else {
        reasons.push(
          `Roughly $${Math.round(groundCost / 100).toLocaleString()} on the ground for ${input.totalDays} days, before flights.`
        );
      }
    } else {
      reasons.push(
        `Roughly $${Math.round((destination.dailyFamilyCost * input.totalDays)).toLocaleString()} on the ground for ${input.totalDays} days, before flights.`
      );
    }

    // A cheap destination during an expensive week is the useful combination.
    if (input.season === "PEAK" && destination.costTier <= 2) {
      score += 10;
      reasons.push("One of the cheaper options in an otherwise expensive week.");
    }

    matches.push({ destination, score: Math.round(score), reasons, warnings });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

function monthName(month: number): string {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

export function parseStyles(csv: string | null | undefined): DestinationStyle[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is DestinationStyle => s in STYLE_LABELS);
}
