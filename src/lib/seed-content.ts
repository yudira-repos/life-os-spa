// Static, curated content for KidsOS and FunOS. Not AI-generated, not
// personalized beyond age band — that's explicitly a later step (see
// DESIGN.md). The point of V1 is a real, useful "Today" view without
// building a recommendation engine first.

export interface KidsRecommendation {
  minAge: number;
  maxAge: number;
  learning: { subject: string; idea: string };
  activity: { title: string; category: string };
}

export const KIDS_RECOMMENDATIONS: KidsRecommendation[] = [
  {
    minAge: 0,
    maxAge: 5,
    learning: { subject: "Reading", idea: "Read a picture book together and ask them to retell it in their own words." },
    activity: { title: "Sensory play — sorting shapes and colors", category: "Development" },
  },
  {
    minAge: 6,
    maxAge: 9,
    learning: { subject: "Math", idea: "Practice fractions with a real snack — split it into equal parts together." },
    activity: { title: "Local library STEM story time", category: "Library" },
  },
  {
    minAge: 10,
    maxAge: 13,
    learning: { subject: "Coding", idea: "Try a 15-minute Scratch challenge: make a sprite respond to a key press." },
    activity: { title: "Robotics club drop-in session", category: "STEM" },
  },
  {
    minAge: 14,
    maxAge: 18,
    learning: { subject: "Career exploration", idea: "Watch a 10-minute 'day in the life' video for a career they're curious about." },
    activity: { title: "Volunteer shift at the community center", category: "Volunteering" },
  },
];

export function kidsRecommendationForAge(age: number | null): KidsRecommendation {
  if (age == null) return KIDS_RECOMMENDATIONS[1];
  return (
    KIDS_RECOMMENDATIONS.find((r) => age >= r.minAge && age <= r.maxAge) ??
    KIDS_RECOMMENDATIONS[KIDS_RECOMMENDATIONS.length - 1]
  );
}

export const FUN_SUGGESTIONS = {
  weekend: {
    title: "Mission-style scavenger hunt in the backyard or a nearby park",
    detail: "Write five simple clues leading to a small treat. Works for almost any age mix.",
  },
  movie: {
    title: "Family movie night: pick something nobody's seen in 2+ years",
    detail: "Rotate who picks each week so it never feels like the same person's choice every time.",
  },
};
