// The maintenance catalog: what a homeowner actually has to do, how often,
// and why it matters when skipped.
//
// Static content, same pattern as the KidsOS activity catalog and the TravelOS
// destination list. Intervals come from manufacturer guidance and standard
// practice, and each entry says what happens if you don't — because "clean the
// dryer vent" is a chore, while "clean the dryer vent, it's the leading cause
// of dryer fires" is a task people actually do.
//
// Two things the catalog gets right that a generic checklist doesn't:
//
//   CONDITIONS. A task only applies if the house has the thing. No water
//   softener, no salt reminder. No trees, no monthly gutter check.
//
//   ADJUSTMENTS. The same task runs at different frequencies in different
//   houses. Hard water eats a softener's salt faster; wildfire smoke and
//   desert dust halve the life of an air filter. Those adjust the interval
//   rather than being a footnote nobody reads.

export type TaskCategory =
  | "HVAC"
  | "WATER"
  | "EXTERIOR"
  | "SAFETY"
  | "APPLIANCE"
  | "LANDSCAPE"
  | "PLUMBING"
  | "ELECTRICAL"
  | "IOT"
  | "OTHER";

export type TaskPriority = "CRITICAL" | "IMPORTANT" | "ROUTINE";

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  HVAC: "Heating & cooling",
  WATER: "Water",
  EXTERIOR: "Exterior",
  SAFETY: "Safety",
  APPLIANCE: "Appliances",
  LANDSCAPE: "Yard & landscape",
  PLUMBING: "Plumbing",
  ELECTRICAL: "Electrical",
  IOT: "Smart home",
  OTHER: "Other",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  CRITICAL: "Don't skip",
  IMPORTANT: "Important",
  ROUTINE: "Routine",
};

/** Property facts a task can depend on. */
export interface PropertyConditions {
  hasWaterSoftener: boolean;
  hasIrrigation: boolean;
  hasPool: boolean;
  hasSepticTank: boolean;
  hasFireplace: boolean;
  hardWater: boolean;
  dustyOrSmoky: boolean;
  heavyTreeCover: boolean;
}

export interface TaskTemplate {
  key: string;
  name: string;
  category: TaskCategory;
  priority: TaskPriority;
  /** Base interval in days, for a typical house. */
  intervalDays: number;
  /** Months (1-12) this should happen in, when timing matters more than interval. */
  seasonalMonths?: number[];
  diy: boolean;
  estimatedMinutes: number;
  estimatedCostCents: number;
  /** Why it matters — shown in the UI, not buried in docs. */
  why: string;
  /** How to actually do it, for the DIY ones. */
  how?: string[];
  /** Only include this task when the predicate passes. */
  appliesWhen?: (conditions: PropertyConditions) => boolean;
  /** Adjust the interval for this house. Returns days. */
  adjustInterval?: (base: number, conditions: PropertyConditions) => number;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  // --- HVAC ---
  {
    key: "hvac_filter",
    name: "Replace HVAC air filter",
    category: "HVAC",
    priority: "IMPORTANT",
    intervalDays: 90,
    diy: true,
    estimatedMinutes: 10,
    estimatedCostCents: 2_500,
    why: "A clogged filter makes the system work harder, which raises the power bill and shortens the life of the most expensive appliance in the house. It's the cheapest maintenance with the highest return.",
    how: [
      "Note the size printed on the edge of the old filter (e.g. 20x25x1) — this is the number you can never find later, so save it on the equipment record.",
      "Match the airflow arrow to the direction air moves toward the unit.",
      "MERV 8-11 is the sweet spot for most homes. Higher isn't automatically better — very restrictive filters can strain older systems.",
    ],
    adjustInterval: (base, c) => (c.dustyOrSmoky ? Math.round(base / 2) : base),
  },
  {
    key: "hvac_service",
    name: "HVAC professional service",
    category: "HVAC",
    priority: "IMPORTANT",
    intervalDays: 365,
    seasonalMonths: [3, 4],
    diy: false,
    estimatedMinutes: 90,
    estimatedCostCents: 20_000,
    why: "An annual service catches a failing capacitor or low refrigerant before it becomes a dead system in a heatwave — when every HVAC company in town is booked for two weeks and charging emergency rates.",
  },
  {
    key: "hvac_condenser_clean",
    name: "Clear debris around the outdoor condenser",
    category: "HVAC",
    priority: "ROUTINE",
    intervalDays: 180,
    diy: true,
    estimatedMinutes: 20,
    estimatedCostCents: 0,
    why: "Leaves and grass clippings block airflow, which makes cooling less efficient and the unit run hotter than it should.",
    how: ["Cut power at the disconnect first.", "Clear two feet in every direction.", "Rinse the fins gently from the inside out with a hose — never a pressure washer."],
  },

  // --- Water ---
  {
    key: "softener_salt",
    name: "Refill water softener salt",
    category: "WATER",
    priority: "ROUTINE",
    intervalDays: 56,
    diy: true,
    estimatedMinutes: 15,
    estimatedCostCents: 1_200,
    why: "An empty brine tank means the softener quietly stops working, and you find out weeks later from scale on the fixtures and a water heater that's aging faster than it should.",
    how: [
      "Keep the tank at least a third full; top it to about two thirds, not to the brim.",
      "Watch for a salt bridge — a hard crust spanning the tank with a gap underneath. It looks full while doing nothing. Break it up with a broom handle.",
    ],
    appliesWhen: (c) => c.hasWaterSoftener,
    adjustInterval: (base, c) => (c.hardWater ? Math.round(base * 0.75) : base),
  },
  {
    key: "ro_filter",
    name: "Replace drinking water filter",
    category: "WATER",
    priority: "IMPORTANT",
    intervalDays: 182,
    diy: true,
    estimatedMinutes: 30,
    estimatedCostCents: 6_000,
    why: "A spent filter stops filtering and can become a place for bacteria to grow. Past its life it's doing less than nothing.",
    how: [
      "Shut the supply valve and depressurise before opening the housing.",
      "RO membranes last far longer than the pre/post filters — usually 2-3 years against 6-12 months. Don't replace them on the same schedule.",
    ],
    adjustInterval: (base, c) => (c.hardWater ? Math.round(base * 0.8) : base),
  },
  {
    key: "water_heater_flush",
    name: "Flush the water heater",
    category: "WATER",
    priority: "IMPORTANT",
    intervalDays: 365,
    diy: true,
    estimatedMinutes: 60,
    estimatedCostCents: 0,
    why: "Sediment settles at the bottom and insulates the burner from the water, so the tank runs hotter, costs more, and fails years early. This single task is the difference between a 7-year and a 13-year water heater.",
    how: [
      "Turn the heater to vacation/pilot and let it cool for a couple of hours.",
      "Hose from the drain valve to somewhere that can take hot, rusty water.",
      "Open the valve and a hot tap upstairs to break the vacuum; run until clear.",
    ],
    adjustInterval: (base, c) => (c.hardWater ? Math.round(base * 0.5) : base),
  },
  {
    key: "water_heater_anode",
    name: "Inspect the water heater anode rod",
    category: "WATER",
    priority: "ROUTINE",
    intervalDays: 1_095,
    diy: false,
    estimatedMinutes: 60,
    estimatedCostCents: 15_000,
    why: "The anode rod corrodes so the tank doesn't. Replacing a $40 rod every few years is what keeps a $2,000 tank from rusting through.",
  },
  {
    key: "shutoff_valve_test",
    name: "Test the main water shutoff",
    category: "PLUMBING",
    priority: "IMPORTANT",
    intervalDays: 365,
    diy: true,
    estimatedMinutes: 10,
    estimatedCostCents: 0,
    why: "The moment you need this valve, you need it in seconds. Valves that sit untouched for years seize — and discovering that during a burst pipe is how a leak becomes a renovation.",
    how: ["Close it fully, check a tap runs dry, then reopen fully.", "Make sure everyone in the house knows where it is."],
  },
  {
    key: "septic_pump",
    name: "Pump the septic tank",
    category: "PLUMBING",
    priority: "CRITICAL",
    intervalDays: 1_095,
    diy: false,
    estimatedMinutes: 120,
    estimatedCostCents: 55_000,
    why: "A neglected tank backs up into the house or destroys the leach field. Pumping costs hundreds; a failed leach field costs tens of thousands.",
    appliesWhen: (c) => c.hasSepticTank,
  },

  // --- Safety ---
  {
    key: "smoke_alarm_test",
    name: "Test smoke & CO alarms",
    category: "SAFETY",
    priority: "CRITICAL",
    intervalDays: 182,
    diy: true,
    estimatedMinutes: 15,
    estimatedCostCents: 0,
    why: "The most consequential ten minutes of maintenance in the house. Test every unit — the one that fails is never the one you'd guess.",
    how: [
      "Hold the test button until it sounds.",
      "Replace batteries yearly even if they still work.",
      "Replace the whole unit after 10 years — the sensor degrades whatever the battery says. Check the manufacture date on the back.",
    ],
  },
  {
    key: "dryer_vent",
    name: "Clean the dryer vent",
    category: "SAFETY",
    priority: "CRITICAL",
    intervalDays: 365,
    diy: true,
    estimatedMinutes: 45,
    estimatedCostCents: 3_000,
    why: "Lint in the duct is a leading cause of house fires, and thousands happen every year. It also makes the dryer take two cycles to do one load, which you're paying for.",
    how: [
      "Pull the dryer out and disconnect the duct.",
      "A vent brush kit on a drill clears the run properly; the shop vac alone doesn't.",
      "Check the exterior flap actually opens — they get painted shut or blocked by nests.",
    ],
  },
  {
    key: "fire_extinguisher",
    name: "Check fire extinguisher pressure",
    category: "SAFETY",
    priority: "IMPORTANT",
    intervalDays: 365,
    diy: true,
    estimatedMinutes: 5,
    estimatedCostCents: 0,
    why: "The gauge needle should sit in the green. An extinguisher that's lost pressure is an ornament.",
  },
  {
    key: "gfci_test",
    name: "Test GFCI outlets",
    category: "ELECTRICAL",
    priority: "IMPORTANT",
    intervalDays: 182,
    diy: true,
    estimatedMinutes: 10,
    estimatedCostCents: 0,
    why: "GFCIs are what stop a bathroom or kitchen outlet from electrocuting someone. They fail silently, and the test button is the only way to know.",
    how: ["Press TEST — power should cut. Press RESET to restore.", "If it doesn't trip, replace it."],
  },
  {
    key: "chimney_sweep",
    name: "Chimney inspection & sweep",
    category: "SAFETY",
    priority: "CRITICAL",
    intervalDays: 365,
    seasonalMonths: [9, 10],
    diy: false,
    estimatedMinutes: 90,
    estimatedCostCents: 25_000,
    why: "Creosote builds up and ignites. A chimney fire is fast, hot, and spreads into the structure.",
    appliesWhen: (c) => c.hasFireplace,
  },

  // --- Exterior ---
  {
    key: "gutters",
    name: "Clean gutters & downspouts",
    category: "EXTERIOR",
    priority: "IMPORTANT",
    intervalDays: 182,
    seasonalMonths: [10, 11],
    diy: true,
    estimatedMinutes: 120,
    estimatedCostCents: 0,
    why: "Blocked gutters send water down the walls and into the foundation. Water intrusion is the most expensive category of home damage, and it starts with a $0 chore.",
    how: ["Do it before the rainy season, not during.", "Flush the downspouts — a clear gutter with a blocked downspout still overflows.", "Check that water exits at least a metre from the foundation."],
    adjustInterval: (base, c) => (c.heavyTreeCover ? Math.round(base / 2) : base),
  },
  {
    key: "roof_inspect",
    name: "Inspect the roof",
    category: "EXTERIOR",
    priority: "IMPORTANT",
    intervalDays: 365,
    seasonalMonths: [9],
    diy: true,
    estimatedMinutes: 30,
    estimatedCostCents: 0,
    why: "A single lifted shingle found from the ground with binoculars is a cheap repair. The same shingle found from a ceiling stain is a roof, a ceiling, and possibly mould.",
    how: ["Binoculars from the ground is safer and nearly as effective as climbing.", "Look for lifted, cracked or missing shingles, and damaged flashing around vents and chimneys."],
  },
  {
    key: "exterior_caulk",
    name: "Check exterior caulking & weather stripping",
    category: "EXTERIOR",
    priority: "ROUTINE",
    intervalDays: 365,
    seasonalMonths: [10],
    diy: true,
    estimatedMinutes: 90,
    estimatedCostCents: 4_000,
    why: "Gaps around windows and doors are where the heating bill leaks out and where water and insects get in. Cheap to fix, invisible until it isn't.",
  },
  {
    key: "pressure_wash",
    name: "Wash exterior surfaces & walkways",
    category: "EXTERIOR",
    priority: "ROUTINE",
    intervalDays: 365,
    seasonalMonths: [5],
    diy: true,
    estimatedMinutes: 180,
    estimatedCostCents: 0,
    why: "Algae and moss on walkways is a slip hazard, and left on siding it holds moisture against the surface.",
  },

  // --- Landscape ---
  {
    key: "irrigation_check",
    name: "Test irrigation & adjust the timer",
    category: "LANDSCAPE",
    priority: "ROUTINE",
    intervalDays: 182,
    seasonalMonths: [4, 10],
    diy: true,
    estimatedMinutes: 45,
    estimatedCostCents: 0,
    why: "A broken head or a timer still running the summer schedule in November is the most common cause of a shocking water bill — and it runs at 4am where nobody sees it.",
    how: ["Run each zone manually and watch it.", "Look for heads spraying the pavement, sunken heads, and soggy patches that suggest an underground leak."],
    appliesWhen: (c) => c.hasIrrigation,
  },
  {
    key: "tree_trim",
    name: "Trim trees away from the house & roof",
    category: "LANDSCAPE",
    priority: "IMPORTANT",
    intervalDays: 365,
    seasonalMonths: [2],
    diy: false,
    estimatedMinutes: 180,
    estimatedCostCents: 45_000,
    why: "Branches over the roof drop debris into gutters, give rodents a bridge into the attic, and become projectiles in a storm.",
    appliesWhen: (c) => c.heavyTreeCover,
  },
  {
    key: "pool_service",
    name: "Pool chemical balance & service",
    category: "LANDSCAPE",
    priority: "IMPORTANT",
    intervalDays: 7,
    diy: false,
    estimatedMinutes: 30,
    estimatedCostCents: 15_000,
    why: "Chemistry drifts fast. Left alone a week or two in summer, a clear pool turns green and costs far more to recover than to maintain.",
    appliesWhen: (c) => c.hasPool,
  },

  // --- Appliances ---
  {
    key: "fridge_coils",
    name: "Vacuum refrigerator coils",
    category: "APPLIANCE",
    priority: "ROUTINE",
    intervalDays: 365,
    diy: true,
    estimatedMinutes: 20,
    estimatedCostCents: 0,
    why: "Dusty coils make the compressor run longer and hotter. It's the difference between a fridge that lasts 10 years and one that lasts 15.",
  },
  {
    key: "fridge_water_filter",
    name: "Replace refrigerator water filter",
    category: "APPLIANCE",
    priority: "ROUTINE",
    intervalDays: 182,
    diy: true,
    estimatedMinutes: 5,
    estimatedCostCents: 4_500,
    why: "Manufacturers specify six months. Past that it stops filtering and starts restricting flow.",
  },
  {
    key: "garbage_disposal",
    name: "Clean & sharpen the garbage disposal",
    category: "APPLIANCE",
    priority: "ROUTINE",
    intervalDays: 90,
    diy: true,
    estimatedMinutes: 10,
    estimatedCostCents: 0,
    why: "Keeps the smell down and the grind effective.",
    how: ["Ice cubes and a cup of rock salt, run with cold water.", "Half a lemon afterwards for the smell."],
  },
  {
    key: "dishwasher_filter",
    name: "Clean the dishwasher filter",
    category: "APPLIANCE",
    priority: "ROUTINE",
    intervalDays: 90,
    diy: true,
    estimatedMinutes: 15,
    estimatedCostCents: 0,
    why: "Most modern dishwashers have a filter that people never learn about, then conclude the machine 'stopped cleaning well'.",
  },
  {
    key: "washer_hoses",
    name: "Inspect washing machine hoses",
    category: "APPLIANCE",
    priority: "IMPORTANT",
    intervalDays: 365,
    diy: true,
    estimatedMinutes: 15,
    estimatedCostCents: 0,
    why: "A burst supply hose puts hundreds of gallons an hour into the floor and is a top-five homeowner insurance claim. Replace rubber hoses with braided stainless every 5 years.",
  },

  // --- Smart home / IoT ---
  {
    key: "iot_batteries",
    name: "Check smart device & sensor batteries",
    category: "IOT",
    priority: "IMPORTANT",
    intervalDays: 182,
    diy: true,
    estimatedMinutes: 30,
    estimatedCostCents: 3_000,
    why: "A door sensor or leak detector with a dead battery is worse than not having one — you believe you're covered. Leak sensors especially: the whole point is catching water while it's still a puddle.",
    how: ["Check the battery level in each device's app rather than waiting for the low-battery alert.", "Note the battery type on the equipment record so you can buy them all at once."],
  },
  {
    key: "iot_firmware",
    name: "Update smart home firmware",
    category: "IOT",
    priority: "IMPORTANT",
    intervalDays: 90,
    diy: true,
    estimatedMinutes: 30,
    estimatedCostCents: 0,
    why: "Cameras, doorbells and hubs are internet-connected computers on your home network. Unpatched ones are a genuine security exposure, and old smart home devices are routinely found with known vulnerabilities.",
    how: [
      "Check for firmware updates on cameras, doorbell, thermostat, hub and router.",
      "The router matters most — it's the front door.",
      "Delete devices you no longer use rather than leaving them online unpatched.",
    ],
  },
  {
    key: "iot_audit",
    name: "Review smart home accounts & access",
    category: "IOT",
    priority: "ROUTINE",
    intervalDays: 365,
    diy: true,
    estimatedMinutes: 30,
    estimatedCostCents: 0,
    why: "Old guest access, a former housekeeper's door code, a shared camera login from a contractor — these accumulate silently and nobody audits them.",
    how: ["Review who has access to cameras, locks and the hub.", "Rotate door codes.", "Turn on two-factor authentication where it exists."],
  },
  {
    key: "backup_power",
    name: "Test backup power / UPS batteries",
    category: "ELECTRICAL",
    priority: "ROUTINE",
    intervalDays: 365,
    diy: true,
    estimatedMinutes: 20,
    estimatedCostCents: 0,
    why: "UPS batteries last 3-5 years and fail without warning. A UPS with a dead battery passes power through happily until the moment it's needed.",
  },
];

export const TEMPLATE_BY_KEY: Record<string, TaskTemplate> = Object.fromEntries(
  TASK_TEMPLATES.map((t) => [t.key, t])
);

/**
 * The tasks that apply to a specific house, with intervals already adjusted
 * for its conditions. This is what gets seeded when a property is created.
 */
export function templatesFor(conditions: PropertyConditions): {
  template: TaskTemplate;
  intervalDays: number;
  adjusted: boolean;
  adjustmentReason?: string;
}[] {
  return TASK_TEMPLATES.filter(
    (template) => !template.appliesWhen || template.appliesWhen(conditions)
  ).map((template) => {
    const intervalDays = template.adjustInterval
      ? template.adjustInterval(template.intervalDays, conditions)
      : template.intervalDays;

    return {
      template,
      intervalDays,
      adjusted: intervalDays !== template.intervalDays,
      adjustmentReason:
        intervalDays !== template.intervalDays
          ? adjustmentReasonFor(template, conditions)
          : undefined,
    };
  });
}

function adjustmentReasonFor(
  template: TaskTemplate,
  conditions: PropertyConditions
): string | undefined {
  if (template.category === "HVAC" && conditions.dustyOrSmoky) {
    return "Shortened because you flagged dust or wildfire smoke — filters load up roughly twice as fast.";
  }
  if (template.key === "softener_salt" && conditions.hardWater) {
    return "Shortened for hard water — the softener regenerates more often, so it goes through salt faster.";
  }
  if (template.key === "water_heater_flush" && conditions.hardWater) {
    return "Doubled in frequency for hard water — sediment accumulates much faster.";
  }
  if (template.key === "ro_filter" && conditions.hardWater) {
    return "Shortened for hard water — filters clog sooner.";
  }
  if (template.key === "gutters" && conditions.heavyTreeCover) {
    return "Doubled in frequency because of tree cover — one clean a year isn't enough under trees.";
  }
  return undefined;
}
