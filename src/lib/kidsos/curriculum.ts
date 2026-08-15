// KidsOS Studies — curriculum. Mirrors the shape of the real lifeos-kids
// product (grade-scoped concepts with prereq chains, real standard codes,
// real-world hooks) but with a smaller concept set — enough per subject per
// grade to be genuinely useful without building out the full ~31-concepts-
// per-grade bank. See DESIGN.md for what's deliberately scoped down.

export type Subject = "MATH" | "READING" | "ENGLISH" | "SCIENCE" | "SOCIAL_STUDIES";

export const SUBJECTS: { id: Subject; name: string; emoji: string }[] = [
  { id: "MATH", name: "Math", emoji: "🔢" },
  { id: "READING", name: "Reading", emoji: "📖" },
  { id: "ENGLISH", name: "English & Writing", emoji: "✍️" },
  { id: "SCIENCE", name: "Science", emoji: "🔬" },
  { id: "SOCIAL_STUDIES", name: "Social Studies", emoji: "🗺️" },
];

export function subjectMeta(subject: string) {
  return SUBJECTS.find((s) => s.id === subject) ?? SUBJECTS[0];
}

// KidsOS Studies is scoped to grades 3-6, same as the real product — that's
// the age band with an actual curriculum here to draw on.
export const SUPPORTED_GRADES = [3, 4, 5, 6] as const;
export const DEFAULT_GRADE = 4;

export interface ConceptDef {
  base: string; // skill key shared across grades, e.g. "multiplication"
  name: string;
  subject: Subject;
  grade: number;
  standard: string;
  prereqs: string[]; // base keys, same grade only
  realWorld: string[];
  generator: boolean; // true if problem-bank.ts has a computed generator
}

// code = g{grade}_{base} — grade-scoped identity, so mastery never leaks
// across a grade promotion and prereq chains never cross grades.
export function conceptCode(grade: number, base: string) {
  return `g${grade}_${base}`;
}

const RAW: ConceptDef[] = [
  // ---------------------------------------------------------------- Grade 3
  { base: "rounding", name: "Rounding to 10s and 100s", subject: "MATH", grade: 3, standard: "CCSS.MATH.3.NBT.A.1", prereqs: [], realWorld: ["Rounding a price to the nearest dollar", "Estimating how many people are at a game"], generator: true },
  { base: "add_subtract", name: "Multi-digit addition & subtraction", subject: "MATH", grade: 3, standard: "CCSS.MATH.3.NBT.A.2", prereqs: ["rounding"], realWorld: ["Adding up an allowance", "Figuring out how much change you get"], generator: true },
  { base: "multiplication", name: "Multiplication facts", subject: "MATH", grade: 3, standard: "CCSS.MATH.3.OA.A.1", prereqs: ["add_subtract"], realWorld: ["Counting stickers in equal rows", "Splitting a pizza into slices for friends"], generator: true },
  { base: "division", name: "Division facts", subject: "MATH", grade: 3, standard: "CCSS.MATH.3.OA.A.2", prereqs: ["multiplication"], realWorld: ["Sharing snacks evenly among friends", "Splitting a team into equal groups"], generator: true },
  { base: "fractions_intro", name: "Understanding fractions", subject: "MATH", grade: 3, standard: "CCSS.MATH.3.NF.A.1", prereqs: ["division"], realWorld: ["Cutting a sandwich into equal parts", "Sharing a candy bar fairly"], generator: true },
  { base: "reading_main_idea", name: "Finding the main idea", subject: "READING", grade: 3, standard: "CCSS.ELA.RL.3.2", prereqs: [], realWorld: ["Summarizing a story for a friend who missed it"], generator: false },
  { base: "reading_context_clues", name: "Using context clues", subject: "READING", grade: 3, standard: "CCSS.ELA.RL.3.4", prereqs: [], realWorld: ["Figuring out a new word from a text message"], generator: false },
  { base: "grammar_sentences", name: "Complete sentences & punctuation", subject: "ENGLISH", grade: 3, standard: "CCSS.ELA.L.3.1", prereqs: [], realWorld: ["Writing a clear text to a grandparent"], generator: false },
  { base: "writing_paragraphs", name: "Writing a paragraph with a topic sentence", subject: "ENGLISH", grade: 3, standard: "CCSS.ELA.W.3.1", prereqs: ["grammar_sentences"], realWorld: ["Writing a note explaining why you want a pet"], generator: false },
  { base: "science_life_cycles", name: "Life cycles of plants & animals", subject: "SCIENCE", grade: 3, standard: "NGSS.3-LS1-1", prereqs: [], realWorld: ["Watching a caterpillar become a butterfly"], generator: false },
  { base: "science_forces", name: "Forces and motion", subject: "SCIENCE", grade: 3, standard: "NGSS.3-PS2-1", prereqs: [], realWorld: ["Why a ball rolls farther on a smooth floor than carpet"], generator: false },
  { base: "social_communities", name: "Communities and government", subject: "SOCIAL_STUDIES", grade: 3, standard: "NCSS.C3.D2.Civ.1.3-5", prereqs: [], realWorld: ["Why your town has traffic lights and libraries"], generator: false },
  { base: "social_maps", name: "Reading maps and map keys", subject: "SOCIAL_STUDIES", grade: 3, standard: "NCSS.C3.D2.Geo.2.3-5", prereqs: [], realWorld: ["Finding your street on a map app"], generator: false },

  // ---------------------------------------------------------------- Grade 4
  { base: "multi_digit_multiply", name: "Multi-digit multiplication", subject: "MATH", grade: 4, standard: "CCSS.MATH.4.NBT.B.5", prereqs: [], realWorld: ["Figuring out total cost for a class of 28 buying $4 tickets"], generator: true },
  { base: "long_division", name: "Long division", subject: "MATH", grade: 4, standard: "CCSS.MATH.4.NBT.B.6", prereqs: ["multi_digit_multiply"], realWorld: ["Splitting a $96 group gift evenly among 8 friends"], generator: true },
  { base: "fractions_equivalence", name: "Equivalent fractions & comparing", subject: "MATH", grade: 4, standard: "CCSS.MATH.4.NF.A.1", prereqs: ["long_division"], realWorld: ["Knowing 1/2 a pizza is the same as 4/8"], generator: true },
  { base: "decimals_intro", name: "Introducing decimals", subject: "MATH", grade: 4, standard: "CCSS.MATH.4.NF.C.6", prereqs: ["fractions_equivalence"], realWorld: ["Reading prices with dollars and cents"], generator: true },
  { base: "area_perimeter", name: "Area and perimeter", subject: "MATH", grade: 4, standard: "CCSS.MATH.4.MD.A.3", prereqs: ["multi_digit_multiply"], realWorld: ["How much fence a backyard needs", "How much carpet covers a room"], generator: true },
  { base: "reading_inference", name: "Making inferences", subject: "READING", grade: 4, standard: "CCSS.ELA.RL.4.1", prereqs: [], realWorld: ["Guessing how a character feels from their actions"], generator: false },
  { base: "reading_theme", name: "Identifying theme", subject: "READING", grade: 4, standard: "CCSS.ELA.RL.4.2", prereqs: [], realWorld: ["What lesson a movie is trying to teach"], generator: false },
  { base: "grammar_parts_of_speech", name: "Parts of speech in context", subject: "ENGLISH", grade: 4, standard: "CCSS.ELA.L.4.1", prereqs: [], realWorld: ["Fixing a run-on sentence in a text"], generator: false },
  { base: "writing_persuasive", name: "Persuasive writing with reasons", subject: "ENGLISH", grade: 4, standard: "CCSS.ELA.W.4.1", prereqs: ["grammar_parts_of_speech"], realWorld: ["Convincing a parent to extend screen time with real reasons"], generator: false },
  { base: "science_energy", name: "Energy and its transfer", subject: "SCIENCE", grade: 4, standard: "NGSS.4-PS3-2", prereqs: [], realWorld: ["Why a flashlight battery runs out"], generator: false },
  { base: "science_earth_processes", name: "Earth's changing surface", subject: "SCIENCE", grade: 4, standard: "NGSS.4-ESS2-1", prereqs: [], realWorld: ["Why rivers carve canyons over time"], generator: false },
  { base: "social_us_regions", name: "US regions and geography", subject: "SOCIAL_STUDIES", grade: 4, standard: "NCSS.C3.D2.Geo.4.3-5", prereqs: [], realWorld: ["Why Florida grows oranges and Idaho grows potatoes"], generator: false },
  { base: "social_state_history", name: "State history and government", subject: "SOCIAL_STUDIES", grade: 4, standard: "NCSS.C3.D2.His.1.3-5", prereqs: [], realWorld: ["Why your state capital isn't always the biggest city"], generator: false },

  // ---------------------------------------------------------------- Grade 5
  { base: "fractions_operations", name: "Adding & subtracting fractions", subject: "MATH", grade: 5, standard: "CCSS.MATH.5.NF.A.1", prereqs: [], realWorld: ["Combining 3/4 cup and 1/2 cup of flour in a recipe"], generator: true },
  { base: "fraction_multiply", name: "Multiplying fractions", subject: "MATH", grade: 5, standard: "CCSS.MATH.5.NF.B.4", prereqs: ["fractions_operations"], realWorld: ["Finding 2/3 of a recipe that serves 6"], generator: true },
  { base: "decimal_operations", name: "Adding, subtracting, multiplying decimals", subject: "MATH", grade: 5, standard: "CCSS.MATH.5.NBT.B.7", prereqs: ["fraction_multiply"], realWorld: ["Totaling a grocery receipt"], generator: true },
  { base: "volume", name: "Volume of rectangular prisms", subject: "MATH", grade: 5, standard: "CCSS.MATH.5.MD.C.5", prereqs: ["decimal_operations"], realWorld: ["How much water fills a fish tank"], generator: true },
  { base: "order_of_operations", name: "Order of operations", subject: "MATH", grade: 5, standard: "CCSS.MATH.5.OA.A.1", prereqs: ["fractions_operations"], realWorld: ["Why calculators give different answers for the same numbers in a different order"], generator: true },
  { base: "reading_compare_texts", name: "Comparing two texts", subject: "READING", grade: 5, standard: "CCSS.ELA.RL.5.9", prereqs: [], realWorld: ["Comparing a book to its movie adaptation"], generator: false },
  { base: "reading_authors_purpose", name: "Author's purpose and point of view", subject: "READING", grade: 5, standard: "CCSS.ELA.RI.5.6", prereqs: [], realWorld: ["Spotting bias in a news headline"], generator: false },
  { base: "grammar_verb_tense", name: "Verb tense consistency", subject: "ENGLISH", grade: 5, standard: "CCSS.ELA.L.5.1", prereqs: [], realWorld: ["Editing a story so it doesn't jump between past and present"], generator: false },
  { base: "writing_narrative", name: "Narrative writing with detail", subject: "ENGLISH", grade: 5, standard: "CCSS.ELA.W.5.3", prereqs: ["grammar_verb_tense"], realWorld: ["Writing about a memorable weekend with vivid details"], generator: false },
  { base: "science_ecosystems", name: "Ecosystems and food webs", subject: "SCIENCE", grade: 5, standard: "NGSS.5-LS2-1", prereqs: [], realWorld: ["Why removing one animal from a pond affects everything else"], generator: false },
  { base: "science_matter", name: "Matter and its properties", subject: "SCIENCE", grade: 5, standard: "NGSS.5-PS1-3", prereqs: [], realWorld: ["Why ice, water, and steam are the same substance"], generator: false },
  { base: "social_early_america", name: "Early American history", subject: "SOCIAL_STUDIES", grade: 5, standard: "NCSS.C3.D2.His.2.3-5", prereqs: [], realWorld: ["Why the 13 colonies wanted independence"], generator: false },
  { base: "social_civics_rights", name: "Civics: rights and responsibilities", subject: "SOCIAL_STUDIES", grade: 5, standard: "NCSS.C3.D2.Civ.5.3-5", prereqs: [], realWorld: ["Why voting age is 18, and what rights kids already have"], generator: false },

  // ---------------------------------------------------------------- Grade 6
  { base: "ratios", name: "Ratios and rates", subject: "MATH", grade: 6, standard: "CCSS.MATH.6.RP.A.1", prereqs: [], realWorld: ["Comparing which trail mix has more raisins per cup"], generator: true },
  { base: "unit_rate", name: "Unit rate problems", subject: "MATH", grade: 6, standard: "CCSS.MATH.6.RP.A.2", prereqs: ["ratios"], realWorld: ["Figuring out which size bag of chips is the better deal"], generator: true },
  { base: "percents", name: "Percents", subject: "MATH", grade: 6, standard: "CCSS.MATH.6.RP.A.3", prereqs: ["unit_rate"], realWorld: ["Calculating a tip or a discount at checkout"], generator: true },
  { base: "gcf_lcm", name: "GCF and LCM", subject: "MATH", grade: 6, standard: "CCSS.MATH.6.NS.B.4", prereqs: [], realWorld: ["Figuring out when two blinking lights will flash together again"], generator: true },
  { base: "negative_numbers", name: "Negative numbers", subject: "MATH", grade: 6, standard: "CCSS.MATH.6.NS.C.5", prereqs: [], realWorld: ["Reading a thermometer below zero", "A bank balance that's overdrawn"], generator: true },
  { base: "one_step_equations", name: "One-step equations", subject: "MATH", grade: 6, standard: "CCSS.MATH.6.EE.B.7", prereqs: ["negative_numbers"], realWorld: ["Figuring out how many weeks of saving to afford something"], generator: true },
  { base: "reading_arguments", name: "Evaluating arguments and evidence", subject: "READING", grade: 6, standard: "CCSS.ELA.RI.6.8", prereqs: [], realWorld: ["Deciding if an ad's claim is actually backed up"], generator: false },
  { base: "grammar_active_passive", name: "Active vs. passive voice", subject: "ENGLISH", grade: 6, standard: "CCSS.ELA.L.6.1", prereqs: [], realWorld: ["Making an email sound more direct and confident"], generator: false },
  { base: "writing_argument", name: "Argumentative writing with evidence", subject: "ENGLISH", grade: 6, standard: "CCSS.ELA.W.6.1", prereqs: ["grammar_active_passive"], realWorld: ["Making the case for a later bedtime with actual reasons"], generator: false },
  { base: "science_cells", name: "Cells and body systems", subject: "SCIENCE", grade: 6, standard: "NGSS.MS-LS1-2", prereqs: [], realWorld: ["Why your muscles get tired after exercise"], generator: false },
  { base: "science_energy_transfer", name: "Thermal energy transfer", subject: "SCIENCE", grade: 6, standard: "NGSS.MS-PS3-3", prereqs: [], realWorld: ["Why a metal spoon in hot soup gets hot but a wooden one doesn't"], generator: false },
  { base: "social_world_geography", name: "World geography and climate", subject: "SOCIAL_STUDIES", grade: 6, standard: "NCSS.C3.D2.Geo.2.6-8", prereqs: [], realWorld: ["Why some countries farm rice and others farm wheat"], generator: false },
  { base: "social_ancient_civilizations", name: "Ancient civilizations", subject: "SOCIAL_STUDIES", grade: 6, standard: "NCSS.C3.D2.His.1.6-8", prereqs: [], realWorld: ["Why Rome's roads still shape some highways today"], generator: false },
];

export const CONCEPTS: (ConceptDef & { code: string })[] = RAW.map((c) => ({
  ...c,
  code: conceptCode(c.grade, c.base),
}));

export function getConcept(code: string) {
  return CONCEPTS.find((c) => c.code === code);
}

export function conceptsForGradeSubject(grade: number, subject: Subject) {
  return CONCEPTS.filter((c) => c.grade === grade && c.subject === subject);
}

export function conceptsForGrade(grade: number) {
  return CONCEPTS.filter((c) => c.grade === grade);
}

// A concept is unlocked once every same-grade prereq is at/above mastery
// threshold. No prereqs => always unlocked.
export const MASTERY_THRESHOLD = 0.85;

export function isUnlocked(
  concept: ConceptDef & { code: string },
  masteryByCode: Record<string, number>
) {
  if (concept.prereqs.length === 0) return true;
  return concept.prereqs.every((base) => {
    const prereqCode = conceptCode(concept.grade, base);
    return (masteryByCode[prereqCode] ?? 0) >= MASTERY_THRESHOLD;
  });
}
