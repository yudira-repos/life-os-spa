// KidsOS Career Paths — confirmed NOT present in the real lifeos-kids
// product. Net-new, static catalog: browsable career cards linking back to
// the subjects that matter for each one, so a child can see the thread from
// "I'm good at Science" to "here's where that could go." No AI matching
// yet — that's a later slice once there's real usage to learn from.

import type { Subject } from "./curriculum";

export interface CareerDef {
  key: string;
  title: string;
  emoji: string;
  whatTheyDo: string;
  skills: string[];
  subjects: Subject[];
  roadmap: string[];
}

export const CAREERS: CareerDef[] = [
  {
    key: "doctor",
    title: "Doctor",
    emoji: "🩺",
    whatTheyDo: "Diagnoses and treats illness, and helps people stay healthy.",
    skills: ["Problem-solving", "Empathy", "Attention to detail"],
    subjects: ["SCIENCE", "MATH"],
    roadmap: ["Middle/high school: strong science & math grades", "College: pre-med / biology", "Medical school + residency"],
  },
  {
    key: "veterinarian",
    title: "Veterinarian",
    emoji: "🐶",
    whatTheyDo: "Diagnoses and treats sick or injured animals.",
    skills: ["Compassion for animals", "Science knowledge", "Steady hands"],
    subjects: ["SCIENCE", "MATH"],
    roadmap: ["Middle/high school: biology & chemistry", "College: pre-vet / animal science", "Veterinary school"],
  },
  {
    key: "software_engineer",
    title: "Software Engineer",
    emoji: "💻",
    whatTheyDo: "Designs and builds the apps, websites, and systems people use every day.",
    skills: ["Logical thinking", "Problem-solving", "Patience with debugging"],
    subjects: ["MATH", "SCIENCE"],
    roadmap: ["Middle/high school: coding clubs, math", "College: computer science (or self-taught path)", "Internships / entry-level roles"],
  },
  {
    key: "teacher",
    title: "Teacher",
    emoji: "🍎",
    whatTheyDo: "Helps students learn new skills and ideas, and grow in confidence.",
    skills: ["Communication", "Patience", "Organization"],
    subjects: ["ENGLISH", "READING"],
    roadmap: ["High school: tutoring or mentoring younger kids", "College: education or a subject major", "Teaching credential"],
  },
  {
    key: "architect",
    title: "Architect",
    emoji: "🏛️",
    whatTheyDo: "Designs buildings and spaces that are safe, useful, and beautiful.",
    skills: ["Spatial reasoning", "Creativity", "Math"],
    subjects: ["MATH", "SCIENCE"],
    roadmap: ["High school: geometry, art, drafting", "College: architecture degree", "Licensure after supervised practice"],
  },
  {
    key: "marine_biologist",
    title: "Marine Biologist",
    emoji: "🐬",
    whatTheyDo: "Studies ocean life and ecosystems to understand and protect them.",
    skills: ["Curiosity about nature", "Science", "Fieldwork stamina"],
    subjects: ["SCIENCE"],
    roadmap: ["High school: biology, chemistry", "College: marine biology / environmental science", "Graduate research or field work"],
  },
  {
    key: "graphic_designer",
    title: "Graphic Designer",
    emoji: "🖌️",
    whatTheyDo: "Creates visual designs for brands, apps, books, and more.",
    skills: ["Creativity", "Visual sense", "Software tools"],
    subjects: ["ENGLISH"],
    roadmap: ["High school: art classes, build a portfolio", "College: design degree (or self-taught path)", "Internships / freelance work"],
  },
  {
    key: "chef",
    title: "Chef",
    emoji: "👨‍🍳",
    whatTheyDo: "Plans and prepares food, often running or leading a kitchen.",
    skills: ["Creativity", "Precision", "Working well under pressure"],
    subjects: ["MATH", "SCIENCE"],
    roadmap: ["High school: part-time kitchen work", "Culinary school (optional) or apprenticeship", "Line cook -> sous chef -> head chef"],
  },
  {
    key: "entrepreneur",
    title: "Entrepreneur",
    emoji: "🚀",
    whatTheyDo: "Starts and runs a business, solving a problem for customers.",
    skills: ["Initiative", "Resilience", "Communication"],
    subjects: ["MATH", "ENGLISH"],
    roadmap: ["Middle/high school: small side projects (a lemonade stand counts!)", "College: business, or any major plus real-world projects", "Start small, learn from failure, iterate"],
  },
  {
    key: "firefighter",
    title: "Firefighter",
    emoji: "🚒",
    whatTheyDo: "Responds to emergencies to protect people, animals, and property.",
    skills: ["Physical fitness", "Calm under pressure", "Teamwork"],
    subjects: ["SCIENCE"],
    roadmap: ["High school: stay active, first-aid training", "Fire academy training", "Apply to a local fire department"],
  },
  {
    key: "astronaut",
    title: "Astronaut",
    emoji: "🧑‍🚀",
    whatTheyDo: "Trains for and conducts missions in space, often doing scientific research.",
    skills: ["Science & engineering knowledge", "Physical fitness", "Teamwork under pressure"],
    subjects: ["SCIENCE", "MATH"],
    roadmap: ["High school: strong science & math grades", "College: engineering, physics, or related field", "Military/flight experience or advanced degree, then apply to a space agency"],
  },
  {
    key: "journalist",
    title: "Journalist",
    emoji: "📰",
    whatTheyDo: "Researches and reports true stories to inform the public.",
    skills: ["Curiosity", "Writing", "Fact-checking"],
    subjects: ["ENGLISH", "READING", "SOCIAL_STUDIES"],
    roadmap: ["High school: school newspaper, writing practice", "College: journalism or communications", "Internships at local papers/outlets"],
  },
  {
    key: "lawyer",
    title: "Lawyer",
    emoji: "⚖️",
    whatTheyDo: "Advises and represents people on legal matters and rights.",
    skills: ["Argumentation", "Reading closely", "Research"],
    subjects: ["ENGLISH", "SOCIAL_STUDIES"],
    roadmap: ["High school: debate club, government class", "College: any major with strong writing", "Law school + bar exam"],
  },
  {
    key: "game_designer",
    title: "Game Designer",
    emoji: "🎮",
    whatTheyDo: "Designs the rules, levels, and stories that make games fun.",
    skills: ["Creativity", "Logical thinking", "Storytelling"],
    subjects: ["MATH", "ENGLISH"],
    roadmap: ["Middle/high school: game design or coding clubs", "College: game design / computer science (or self-taught)", "Build a portfolio of small games"],
  },
];

export function subjectsToCareers(subjects: Subject[]) {
  return CAREERS.filter((c) => c.subjects.some((s) => subjects.includes(s)));
}

export function getCareer(key: string) {
  return CAREERS.find((c) => c.key === key);
}
