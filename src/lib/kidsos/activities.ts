// KidsOS Activities — confirmed NOT present in the real lifeos-kids product
// (which is Studies-only). Net-new, static catalog for V1 — a family marks
// an activity "interested" or "active" for a child; no scheduling/booking
// integration yet, that's a later slice.

export interface ActivityDef {
  key: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  ageRange: [number, number];
}

export const ACTIVITY_CATEGORIES = [
  "Sports",
  "Music",
  "Dance",
  "Art",
  "Clubs",
  "Coding & Robotics",
  "Volunteering",
  "Camps",
] as const;

export const ACTIVITIES: ActivityDef[] = [
  { key: "soccer", name: "Soccer", emoji: "⚽", category: "Sports", description: "Team sport building endurance, footwork, and teamwork.", ageRange: [4, 18] },
  { key: "basketball", name: "Basketball", emoji: "🏀", category: "Sports", description: "Fast-paced team sport for coordination and strategy.", ageRange: [5, 18] },
  { key: "swimming", name: "Swimming", emoji: "🏊", category: "Sports", description: "A lifelong skill and full-body workout.", ageRange: [3, 18] },
  { key: "gymnastics", name: "Gymnastics", emoji: "🤸", category: "Sports", description: "Strength, flexibility, and body awareness.", ageRange: [3, 16] },
  { key: "martial_arts", name: "Martial Arts", emoji: "🥋", category: "Sports", description: "Discipline, focus, and self-defense fundamentals.", ageRange: [4, 18] },
  { key: "piano", name: "Piano", emoji: "🎹", category: "Music", description: "Builds musicality, discipline, and fine motor skill.", ageRange: [5, 18] },
  { key: "guitar", name: "Guitar", emoji: "🎸", category: "Music", description: "A popular first instrument with fast early wins.", ageRange: [6, 18] },
  { key: "choir", name: "Choir / Singing", emoji: "🎤", category: "Music", description: "Group singing builds confidence and ear training.", ageRange: [5, 18] },
  { key: "ballet", name: "Ballet", emoji: "🩰", category: "Dance", description: "Foundational technique, poise, and discipline.", ageRange: [3, 16] },
  { key: "hip_hop_dance", name: "Hip-Hop Dance", emoji: "💃", category: "Dance", description: "High-energy choreography and self-expression.", ageRange: [5, 18] },
  { key: "semi_classical_dance", name: "Semi Classical", emoji: "💃", category: "Dance", description: "Blends classical technique with contemporary styling and music.", ageRange: [4, 18] },
  { key: "indian_classical_dance", name: "Indian Classical", emoji: "🪷", category: "Dance", description: "Traditional Indian dance forms (e.g. Bharatanatyam, Kathak) building discipline, expression, and storytelling.", ageRange: [4, 18] },
  { key: "painting", name: "Painting & Drawing", emoji: "🎨", category: "Art", description: "Visual arts fundamentals — color, form, technique.", ageRange: [4, 18] },
  { key: "pottery", name: "Pottery / Ceramics", emoji: "🏺", category: "Art", description: "Hands-on 3D art and fine motor development.", ageRange: [6, 18] },
  { key: "photography", name: "Photography", emoji: "📷", category: "Art", description: "Visual storytelling and technical camera skills.", ageRange: [8, 18] },
  { key: "chess_club", name: "Chess Club", emoji: "♟️", category: "Clubs", description: "Strategic thinking and patience, one move at a time.", ageRange: [5, 18] },
  { key: "book_club", name: "Book Club", emoji: "📚", category: "Clubs", description: "Reading comprehension and discussion skills.", ageRange: [7, 18] },
  { key: "debate_club", name: "Debate Club", emoji: "🗣️", category: "Clubs", description: "Public speaking, argument structure, quick thinking.", ageRange: [10, 18] },
  { key: "coding_club", name: "Coding Club", emoji: "💻", category: "Coding & Robotics", description: "Block-based or text coding projects with peers.", ageRange: [7, 18] },
  { key: "robotics", name: "Robotics Team", emoji: "🤖", category: "Coding & Robotics", description: "Build and program robots for challenges/competitions.", ageRange: [8, 18] },
  { key: "game_design", name: "Game Design Club", emoji: "🕹️", category: "Coding & Robotics", description: "Design and build simple games — logic meets creativity.", ageRange: [9, 18] },
  { key: "animal_shelter_volunteer", name: "Animal Shelter Volunteering", emoji: "🐾", category: "Volunteering", description: "Hands-on care and empathy-building with rescue animals.", ageRange: [10, 18] },
  { key: "food_bank_volunteer", name: "Food Bank Volunteering", emoji: "🥫", category: "Volunteering", description: "Community service sorting and distributing food.", ageRange: [8, 18] },
  { key: "community_cleanup", name: "Community Cleanup Days", emoji: "🧹", category: "Volunteering", description: "Local environmental stewardship, done as a family or group.", ageRange: [5, 18] },
  { key: "stem_camp", name: "STEM Summer Camp", emoji: "🔬", category: "Camps", description: "A week of hands-on science and engineering projects.", ageRange: [7, 15] },
  { key: "outdoor_camp", name: "Outdoor / Nature Camp", emoji: "🏕️", category: "Camps", description: "Hiking, camping skills, and time away from screens.", ageRange: [6, 16] },
  { key: "sports_camp", name: "Multi-Sport Camp", emoji: "🏅", category: "Camps", description: "A rotating mix of sports over a week or two.", ageRange: [5, 14] },
];

export function activitiesForAge(age: number | null) {
  if (age == null) return ACTIVITIES;
  return ACTIVITIES.filter((a) => age >= a.ageRange[0] && age <= a.ageRange[1]);
}

export function getActivity(key: string) {
  return ACTIVITIES.find((a) => a.key === key);
}
