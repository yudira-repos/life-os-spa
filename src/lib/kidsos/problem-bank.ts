// KidsOS Studies — problem generation. Math answers are always *computed*,
// never predicted, same top engineering call the real lifeos-kids product
// makes: a wrong "sounds right" answer from an LLM is worse than no AI at
// all for a grading tool kids and parents need to trust. Reading/English/
// Science/Social Studies use hand-written question banks instead — no
// generator needed for those.

import { getConcept, type Subject } from "./curriculum";

export type Problem =
  | { type: "numeric"; prompt: string; answer: string }
  | { type: "mc"; prompt: string; options: string[]; correctIndex: number }
  | { type: "short"; prompt: string; keywords: string[]; sampleAnswer: string };

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Flavors word problems using a child's free-text interests, same idea as
// the real product's FLAVOURS table — falls back to a generic set.
const FLAVOURS: Record<string, { item: string; unit: string }> = {
  soccer: { item: "soccer balls", unit: "teammates" },
  minecraft: { item: "blocks", unit: "chests" },
  art: { item: "paintbrushes", unit: "art kits" },
  animals: { item: "dog treats", unit: "shelters" },
  space: { item: "stickers of planets", unit: "poster boards" },
  cooking: { item: "cupcakes", unit: "trays" },
  dance: { item: "hair ribbons", unit: "dancers" },
  music: { item: "guitar picks", unit: "band members" },
  books: { item: "books", unit: "shelves" },
  basketball: { item: "basketballs", unit: "teammates" },
  gaming: { item: "game tokens", unit: "arcade machines" },
};
const DEFAULT_FLAVOUR = { item: "stickers", unit: "friends" };

function flavourFor(interests?: string | null) {
  if (!interests) return DEFAULT_FLAVOUR;
  const lower = interests.toLowerCase();
  for (const key of Object.keys(FLAVOURS)) {
    if (lower.includes(key)) return FLAVOURS[key];
  }
  return DEFAULT_FLAVOUR;
}

// Grade -> a rough difficulty band (1-5), used to size numbers.
function gradeDifficulty(grade: number) {
  return Math.min(5, Math.max(1, grade - 2));
}

function scale(difficulty: number) {
  return [10, 20, 50, 99, 999][Math.min(4, Math.max(0, difficulty - 1))];
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// ---------------------------------------------------------------- Math ----

function genRounding(grade: number): Problem {
  const nearest = grade <= 3 ? 10 : 100;
  const n = randInt(nearest, scale(gradeDifficulty(grade)) + nearest);
  const rounded = Math.round(n / nearest) * nearest;
  return { type: "numeric", prompt: `Round ${n} to the nearest ${nearest}.`, answer: String(rounded) };
}

function genAddSubtract(grade: number, interests?: string | null): Problem {
  const bound = scale(gradeDifficulty(grade));
  const a = randInt(bound / 2, bound);
  const b = randInt(1, bound / 2);
  const f = flavourFor(interests);
  if (Math.random() < 0.5) {
    return { type: "numeric", prompt: `You have ${a} ${f.item}. A friend gives you ${b} more. How many do you have now?`, answer: String(a + b) };
  }
  return { type: "numeric", prompt: `You have ${a} ${f.item} and give away ${b}. How many are left?`, answer: String(a - b) };
}

function genMultiplication(grade: number, interests?: string | null): Problem {
  const max = grade <= 3 ? 10 : 12;
  const a = randInt(2, max);
  const b = randInt(2, max);
  const f = flavourFor(interests);
  return { type: "numeric", prompt: `There are ${a} ${f.unit}, each with ${b} ${f.item}. How many ${f.item} in total?`, answer: String(a * b) };
}

function genDivision(grade: number, interests?: string | null): Problem {
  const max = grade <= 3 ? 10 : 12;
  const b = randInt(2, max);
  const answer = randInt(2, max);
  const a = b * answer;
  const f = flavourFor(interests);
  return { type: "numeric", prompt: `You have ${a} ${f.item} to share evenly among ${b} ${f.unit}. How many does each get?`, answer: String(answer) };
}

function genFractionsIntro(): Problem {
  const denom = randInt(3, 8);
  const num = randInt(1, denom - 1);
  return {
    type: "numeric",
    prompt: `A pizza is cut into ${denom} equal slices. You eat ${num} of them. What fraction of the pizza did you eat? (answer as a/b, e.g. 3/8)`,
    answer: `${num}/${denom}`,
  };
}

function genMultiDigitMultiply(grade: number, interests?: string | null): Problem {
  const a = randInt(12, grade >= 5 ? 99 : 50);
  const b = randInt(2, 9);
  const f = flavourFor(interests);
  return { type: "numeric", prompt: `A store sells ${f.item} in packs of ${a}. If ${b} classes each buy one pack, how many ${f.item} is that in total?`, answer: String(a * b) };
}

function genLongDivision(): Problem {
  const b = randInt(3, 12);
  const answer = randInt(4, 25);
  const a = b * answer;
  return { type: "numeric", prompt: `${a} ÷ ${b} = ?`, answer: String(answer) };
}

function genFractionsEquivalence(): Problem {
  const denom = randInt(2, 6);
  const num = randInt(1, denom - 1);
  const mult = randInt(2, 5);
  return {
    type: "numeric",
    prompt: `${num}/${denom} is equivalent to ?/${denom * mult}. What number goes on top?`,
    answer: String(num * mult),
  };
}

function genDecimalsIntro(): Problem {
  const a = (randInt(100, 999) / 100).toFixed(2);
  const b = (randInt(10, 500) / 100).toFixed(2);
  return { type: "numeric", prompt: `$${a} + $${b} = ? (answer with 2 decimal places, no $ sign)`, answer: (Number(a) + Number(b)).toFixed(2) };
}

function genAreaPerimeter(): Problem {
  const l = randInt(3, 20);
  const w = randInt(3, 20);
  const askArea = Math.random() < 0.5;
  return askArea
    ? { type: "numeric", prompt: `A room is ${l} feet by ${w} feet. What is its area in square feet?`, answer: String(l * w) }
    : { type: "numeric", prompt: `A garden is ${l} feet by ${w} feet. What is its perimeter in feet?`, answer: String(2 * (l + w)) };
}

function genFractionsOperations(): Problem {
  const denom = randInt(3, 10);
  const n1 = randInt(1, denom - 2);
  const n2 = randInt(1, denom - n1 - 1) || 1;
  return { type: "numeric", prompt: `${n1}/${denom} + ${n2}/${denom} = ? (simplest form, a/b)`, answer: simplifyFraction(n1 + n2, denom) };
}

function simplifyFraction(num: number, denom: number) {
  const g = gcd(num, denom);
  return `${num / g}/${denom / g}`;
}

function genFractionMultiply(): Problem {
  const denom = randInt(2, 6);
  const num = randInt(1, denom - 1);
  const whole = randInt(2, 12);
  const productNum = num * whole;
  const g = gcd(productNum, denom);
  const simplified = `${productNum / g}/${denom / g}`;
  return { type: "numeric", prompt: `${num}/${denom} × ${whole} = ? (simplest form, or a whole number if it simplifies fully)`, answer: denom / g === 1 ? String(productNum / g) : simplified };
}

function genDecimalOperations(): Problem {
  const a = (randInt(100, 5000) / 100).toFixed(2);
  const b = (randInt(100, 2000) / 100).toFixed(2);
  return { type: "numeric", prompt: `A receipt shows $${a} and $${b}. What's the total? (2 decimal places, no $ sign)`, answer: (Number(a) + Number(b)).toFixed(2) };
}

function genVolume(): Problem {
  const l = randInt(2, 12);
  const w = randInt(2, 12);
  const h = randInt(2, 12);
  return { type: "numeric", prompt: `A fish tank is ${l} in long, ${w} in wide, and ${h} in tall. What is its volume in cubic inches?`, answer: String(l * w * h) };
}

function genOrderOfOperations(): Problem {
  const a = randInt(2, 9);
  const b = randInt(2, 9);
  const c = randInt(2, 9);
  const answer = a + b * c;
  return { type: "numeric", prompt: `${a} + ${b} × ${c} = ?`, answer: String(answer) };
}

function genRatios(): Problem {
  const g = randInt(2, 6);
  const a = g * randInt(2, 6);
  const b = g * randInt(2, 6);
  return { type: "numeric", prompt: `Simplify the ratio ${a}:${b} to lowest terms (answer as a:b).`, answer: `${a / gcd(a, b)}:${b / gcd(a, b)}` };
}

function genUnitRate(interests?: string | null): Problem {
  const rate = randInt(2, 15);
  const hours = randInt(2, 8);
  const f = flavourFor(interests);
  return { type: "numeric", prompt: `You collect ${rate * hours} ${f.item} over ${hours} hours. What's the rate per hour?`, answer: String(rate) };
}

function genPercents(): Problem {
  const pct = [10, 20, 25, 50, 75][randInt(0, 4)];
  const base = randInt(2, 40) * 4;
  return { type: "numeric", prompt: `What is ${pct}% of ${base}?`, answer: String((pct / 100) * base) };
}

function genGcfLcm(): Problem {
  const a = randInt(4, 24);
  const b = randInt(4, 24);
  const askGcf = Math.random() < 0.5;
  if (askGcf) return { type: "numeric", prompt: `What is the greatest common factor (GCF) of ${a} and ${b}?`, answer: String(gcd(a, b)) };
  const lcm = (a * b) / gcd(a, b);
  return { type: "numeric", prompt: `What is the least common multiple (LCM) of ${a} and ${b}?`, answer: String(lcm) };
}

function genNegativeNumbers(): Problem {
  const a = randInt(-20, 20);
  const b = randInt(-20, 20);
  return { type: "numeric", prompt: `${a} + (${b}) = ?`, answer: String(a + b) };
}

function genOneStepEquations(): Problem {
  const x = randInt(-15, 15);
  const a = randInt(-20, 20);
  const b = x + a;
  return { type: "numeric", prompt: `Solve for x: x + ${a} = ${b}`, answer: String(x) };
}

const MATH_GENERATORS: Record<string, (grade: number, interests?: string | null) => Problem> = {
  rounding: (g) => genRounding(g),
  add_subtract: (g, i) => genAddSubtract(g, i),
  multiplication: (g, i) => genMultiplication(g, i),
  division: (g, i) => genDivision(g, i),
  fractions_intro: () => genFractionsIntro(),
  multi_digit_multiply: (g, i) => genMultiDigitMultiply(g, i),
  long_division: () => genLongDivision(),
  fractions_equivalence: () => genFractionsEquivalence(),
  decimals_intro: () => genDecimalsIntro(),
  area_perimeter: () => genAreaPerimeter(),
  fractions_operations: () => genFractionsOperations(),
  fraction_multiply: () => genFractionMultiply(),
  decimal_operations: () => genDecimalOperations(),
  volume: () => genVolume(),
  order_of_operations: () => genOrderOfOperations(),
  ratios: () => genRatios(),
  unit_rate: (_g, i) => genUnitRate(i),
  percents: () => genPercents(),
  gcf_lcm: () => genGcfLcm(),
  negative_numbers: () => genNegativeNumbers(),
  one_step_equations: () => genOneStepEquations(),
};

// -------------------------------------------------- Non-math static banks --

const STATIC_BANKS: Record<string, Problem[]> = {
  reading_main_idea: [
    { type: "mc", prompt: "A story is mostly about a girl who trains her puppy every day and finally teaches it to fetch. What's the main idea?", options: ["Puppies are cute", "Practice and patience help you reach a goal", "Fetch is a fun game", "Girls like dogs"], correctIndex: 1 },
    { type: "mc", prompt: "An article describes three different ways bees help gardens grow. What is it mainly about?", options: ["A specific garden", "Why bees are important to gardens", "How to avoid bee stings", "The life of one bee"], correctIndex: 1 },
  ],
  reading_context_clues: [
    { type: "mc", prompt: "\"The room was frigid, so she put on a heavy coat.\" What does 'frigid' most likely mean?", options: ["Very warm", "Very cold", "Very bright", "Very quiet"], correctIndex: 1 },
    { type: "mc", prompt: "\"He was famished after the long hike, so he ate two whole sandwiches.\" What does 'famished' mean?", options: ["Very tired", "Very happy", "Very hungry", "Very lost"], correctIndex: 2 },
  ],
  grammar_sentences: [
    { type: "mc", prompt: "Which is a complete sentence?", options: ["Running to the store.", "The dog barked loudly.", "Because it was raining.", "After the game ended."], correctIndex: 1 },
    { type: "mc", prompt: "Which sentence uses correct end punctuation?", options: ["Where are you going", "Where are you going.", "Where are you going?", "where are you going?"], correctIndex: 2 },
  ],
  writing_paragraphs: [
    { type: "short", prompt: "Write a topic sentence for a paragraph about why recess is important.", keywords: ["recess", "important", "break", "play", "exercise"], sampleAnswer: "Recess is important because it gives students a chance to move and recharge." },
  ],
  science_life_cycles: [
    { type: "mc", prompt: "What comes right after the caterpillar stage in a butterfly's life cycle?", options: ["Egg", "Chrysalis (pupa)", "Adult butterfly", "Larva again"], correctIndex: 1 },
  ],
  science_forces: [
    { type: "mc", prompt: "Why does a ball roll farther on a smooth floor than on carpet?", options: ["The floor is colder", "Less friction on the smooth floor", "The ball is heavier", "Carpet is bouncier"], correctIndex: 1 },
  ],
  social_communities: [
    { type: "mc", prompt: "Who is mainly responsible for deciding local rules like speed limits in a town?", options: ["The president", "Local/city government", "A different country", "No one"], correctIndex: 1 },
  ],
  social_maps: [
    { type: "mc", prompt: "What does a map key (legend) tell you?", options: ["The map's price", "What the symbols on the map mean", "The map's age", "Who drew the map"], correctIndex: 1 },
  ],
  reading_inference: [
    { type: "mc", prompt: "A character slams the door and refuses to eat dinner. What can you infer?", options: ["They are hungry", "They are upset about something", "They are tired", "They love the food"], correctIndex: 1 },
  ],
  reading_theme: [
    { type: "mc", prompt: "A story where a slow-but-steady turtle beats a fast-but-lazy rabbit in a race most likely teaches...", options: ["Fast is always better", "Persistence beats overconfidence", "Turtles are better athletes", "Races are unfair"], correctIndex: 1 },
  ],
  grammar_parts_of_speech: [
    { type: "mc", prompt: "In \"The quick fox jumped gracefully,\" which word is an adverb?", options: ["quick", "fox", "jumped", "gracefully"], correctIndex: 3 },
  ],
  writing_persuasive: [
    { type: "short", prompt: "Give one strong reason to convince a parent to let you get a pet.", keywords: ["responsib", "learn", "care", "compan", "exercise", "love"], sampleAnswer: "Having a pet teaches responsibility because I'd need to feed and care for it every day." },
  ],
  science_energy: [
    { type: "mc", prompt: "A flashlight battery eventually stops working because...", options: ["The bulb wears out instantly", "Its stored chemical energy runs out", "It gets too cold", "Light disappears"], correctIndex: 1 },
  ],
  science_earth_processes: [
    { type: "mc", prompt: "Rivers can carve deep canyons over time mainly through...", options: ["Erosion", "Evaporation", "Magnetism", "Photosynthesis"], correctIndex: 0 },
  ],
  social_us_regions: [
    { type: "mc", prompt: "Why does Idaho grow a lot of potatoes while Florida grows a lot of oranges?", options: ["Random chance", "Different climate and soil suit different crops", "Idaho has more farmers", "Oranges can't grow in cold places at all"], correctIndex: 1 },
  ],
  social_state_history: [
    { type: "mc", prompt: "A state capital is chosen mainly for reasons of...", options: ["Being the largest city always", "History, geography, and government convenience", "Random selection", "Population under 1000"], correctIndex: 1 },
  ],
  reading_compare_texts: [
    { type: "short", prompt: "Name one thing that's often different between a book and its movie adaptation.", keywords: ["scene", "character", "detail", "ending", "plot", "cut"], sampleAnswer: "Movies often cut scenes or characters that were in the book." },
  ],
  reading_authors_purpose: [
    { type: "mc", prompt: "An ad says \"Everyone loves SuperCrunch cereal!\" with no evidence. This is an example of...", options: ["A verified fact", "Bias / an unsupported claim", "A scientific study", "A neutral statement"], correctIndex: 1 },
  ],
  grammar_verb_tense: [
    { type: "mc", prompt: "Which sentence keeps consistent verb tense? \"Yesterday I walked to school and I eat lunch.\" vs. \"Yesterday I walked to school and I ate lunch.\"", options: ["The first one", "The second one", "Both are correct", "Neither is correct"], correctIndex: 1 },
  ],
  writing_narrative: [
    { type: "short", prompt: "Add one vivid sensory detail to this sentence: \"We walked into the kitchen.\"", keywords: ["smell", "sound", "warm", "bright", "sweet", "loud", "cold"], sampleAnswer: "We walked into the kitchen, the sweet smell of fresh cookies filling the air." },
  ],
  science_ecosystems: [
    { type: "mc", prompt: "If frogs disappeared from a pond ecosystem, what would most likely happen?", options: ["Nothing changes", "Insect populations they ate would likely grow, and animals that eat frogs would have less food", "The pond dries up", "Fish would disappear too"], correctIndex: 1 },
  ],
  science_matter: [
    { type: "mc", prompt: "Ice, liquid water, and steam are all the same substance in different...", options: ["Colors", "States of matter", "Elements", "Chemicals"], correctIndex: 1 },
  ],
  social_early_america: [
    { type: "mc", prompt: "A major reason the 13 colonies wanted independence was...", options: ["They wanted a king", "Taxation without representation and desire for self-government", "They ran out of land", "Britain asked them to leave"], correctIndex: 1 },
  ],
  social_civics_rights: [
    { type: "mc", prompt: "Which of these is a responsibility that comes with living in a community?", options: ["Ignoring local laws", "Following rules that keep everyone safe", "Never helping neighbors", "Avoiding all group activities"], correctIndex: 1 },
  ],
  reading_arguments: [
    { type: "mc", prompt: "An ad claims a product is \"the best ever\" with no data. What should a careful reader do?", options: ["Believe it immediately", "Look for actual evidence before deciding", "Assume it's a lie", "Ignore all ads forever"], correctIndex: 1 },
  ],
  grammar_active_passive: [
    { type: "mc", prompt: "Which sentence is in active voice?", options: ["The ball was thrown by Sam.", "Sam threw the ball.", "The ball had been thrown.", "The ball is being thrown."], correctIndex: 1 },
  ],
  writing_argument: [
    { type: "short", prompt: "Give one piece of evidence you'd use to argue kids should have a later bedtime on weekends.", keywords: ["study", "research", "rest", "weekend", "school", "sleep", "evidence"], sampleAnswer: "Studies show kids can catch up on sleep on weekends without hurting school performance." },
  ],
  science_cells: [
    { type: "mc", prompt: "Why do your muscles feel tired after exercise?", options: ["Muscle cells use up energy and build up waste products", "Muscles shrink permanently", "Bones get soft", "Blood stops flowing"], correctIndex: 0 },
  ],
  science_energy_transfer: [
    { type: "mc", prompt: "Why does a metal spoon in hot soup get hot but a wooden spoon doesn't as much?", options: ["Metal conducts heat much better than wood", "Wood is naturally cold", "Metal is always hotter", "Wood repels heat"], correctIndex: 0 },
  ],
  social_world_geography: [
    { type: "mc", prompt: "Why might one country farm mostly rice and another mostly wheat?", options: ["Random preference", "Climate and rainfall suit different crops", "Rice is illegal in some places", "Wheat only grows in cities"], correctIndex: 1 },
  ],
  social_ancient_civilizations: [
    { type: "mc", prompt: "Ancient Rome's road-building is still relevant today because...", options: ["Modern roads sometimes follow the same routes", "Romans invented cars", "Rome still controls Europe", "It has no lasting effect"], correctIndex: 0 },
  ],
};

export function generateProblem(conceptCodeStr: string, interests?: string | null): Problem {
  const concept = getConcept(conceptCodeStr);
  if (!concept) {
    return { type: "short", prompt: "This concept isn't available yet.", keywords: [], sampleAnswer: "" };
  }
  if (concept.generator && MATH_GENERATORS[concept.base]) {
    return MATH_GENERATORS[concept.base](concept.grade, interests);
  }
  const bank = STATIC_BANKS[concept.base];
  if (bank && bank.length > 0) {
    return bank[randInt(0, bank.length - 1)];
  }
  return { type: "short", prompt: `Tell me one thing you know about ${concept.name}.`, keywords: [], sampleAnswer: "" };
}

export function generateProblemSet(conceptCodeStr: string, count: number, interests?: string | null): Problem[] {
  return Array.from({ length: count }, () => generateProblem(conceptCodeStr, interests));
}

export type { Subject };
