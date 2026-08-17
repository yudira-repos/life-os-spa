import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { stableHash } from "@/lib/financialos/crypto";
import { ENGINE_VERSION } from "@/lib/financialos/advice/engine";
import type { Recommendation } from "@/lib/financialos/advice/types";

// The LLM layer, and the boundary it is not allowed to cross.
//
//   The rules decide WHAT to recommend. The model only rewrites the WHY.
//
// A model is never asked whether to max a 401(k), what the 2026 limit is, or
// whether whole life is a good idea. Those are computed, from published
// constants, by code you can read. The model receives an already-decided
// recommendation and rewrites the reasoning in warmer, plainer language for
// someone who finds the deterministic version intimidating.
//
// That boundary is the whole design. It means:
//   - the advice cannot hallucinate a contribution limit
//   - the advice is identical for identical inputs, whether or not the API
//     key is set
//   - a model outage degrades the prose, never the substance
//
// Everything is cached by (rule, engine version, salient inputs), so the same
// situation always reads the same way and nobody pays per page view.

const MODEL = process.env.FINANCIAL_EXPLAIN_MODEL ?? "claude-sonnet-4-5";
const MAX_TOKENS = 700;

export function explainerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type LiteracyLevel = "BEGINNER" | "LEARNING" | "CONFIDENT";

function cacheKeyFor(
  recommendation: Recommendation,
  literacy: LiteracyLevel
): string {
  // Deliberately keyed on the *rule output*, not the household. Two families
  // in the same situation share a cache entry, and nothing household-specific
  // is stored in the cache table.
  return stableHash({
    engine: ENGINE_VERSION,
    model: MODEL,
    literacy,
    id: recommendation.id.replace(/_[a-z0-9]{20,}$/i, ""), // strip member id
    status: recommendation.status,
    priority: recommendation.priority,
    headline: recommendation.headline,
    why: recommendation.why,
    math: recommendation.math.map((m) => `${m.label}:${m.value}`),
    actions: recommendation.actions,
  });
}

const SYSTEM_PROMPT = `You rewrite already-decided personal finance recommendations into plain, warm English for someone who has never been taught personal finance.

Hard rules:
- You are NOT deciding anything. The recommendation, the numbers, and the reasoning are given to you and are correct. Never change a dollar figure, a percentage, a limit, a year, or the conclusion.
- Never introduce a number that is not in the input.
- Never add advice that is not in the input. No "you might also consider".
- Never hedge the conclusion into mush. If the input says buy term insurance, the rewrite says buy term insurance.
- Define any jargon inline, in the same sentence, the first time it appears.
- Write at roughly an 8th grade reading level without being condescending. The reader is intelligent and simply was not taught this.
- Second person. Short sentences. No bullet points, no headers, no markdown.
- 3 to 5 short paragraphs maximum.
- No emojis. No exclamation marks. No "Great news!" or similar filler.
- Do not open with a greeting or a restatement of the title. Start with the substance.

You are writing for a household financial tool, not a sales page. Nobody is being sold anything here.`;

function userPromptFor(
  recommendation: Recommendation,
  literacy: LiteracyLevel
): string {
  const literacyNote =
    literacy === "BEGINNER"
      ? "This reader is a complete beginner. Assume no prior knowledge whatsoever. Define every term, including ones that seem obvious like '401(k)' or 'index fund'."
      : literacy === "LEARNING"
        ? "This reader knows the basics but is not confident. Define anything beyond common terms."
        : "This reader is comfortable with personal finance. Skip the basic definitions and keep it tight.";

  return [
    literacyNote,
    "",
    `RECOMMENDATION: ${recommendation.title}`,
    `CONCLUSION (do not change): ${recommendation.headline}`,
    "",
    "REASONING TO REWRITE:",
    ...recommendation.why.map((w) => `- ${w}`),
    "",
    "THE NUMBERS (use only these):",
    ...recommendation.math.map((m) => `- ${m.label}: ${m.value}`),
    "",
    "WHAT THEY SHOULD DO:",
    ...recommendation.actions.map((a) => `- ${a}`),
    ...(recommendation.caveats?.length
      ? ["", "CAVEATS TO PRESERVE:", ...recommendation.caveats.map((c) => `- ${c}`)]
      : []),
    "",
    "Rewrite the reasoning as 3-5 short paragraphs of plain English prose. Keep every number exactly as given.",
  ].join("\n");
}

/**
 * Deterministic fallback: the rule's own words, joined into prose. Used when
 * no API key is set, or when the call fails. The substance is identical —
 * only the tone differs, which is exactly the intended failure mode.
 */
export function fallbackExplanation(recommendation: Recommendation): string {
  return recommendation.why.join("\n\n");
}

export async function explainRecommendation(
  recommendation: Recommendation,
  literacy: LiteracyLevel = "BEGINNER"
): Promise<{ text: string; source: "CACHE" | "MODEL" | "FALLBACK" }> {
  const cacheKey = cacheKeyFor(recommendation, literacy);

  const cached = await db.explanationCache.findUnique({ where: { cacheKey } });
  if (cached) return { text: cached.text, source: "CACHE" };

  if (!explainerConfigured()) {
    return { text: fallbackExplanation(recommendation), source: "FALLBACK" };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPromptFor(recommendation, literacy) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      return { text: fallbackExplanation(recommendation), source: "FALLBACK" };
    }

    // Guard rail: if the model invented a dollar figure that isn't anywhere in
    // the source material, don't trust the rewrite. This is cheap to check and
    // catches the one failure mode that actually matters here.
    if (containsUnknownFigures(text, recommendation)) {
      console.warn("[financialos] explanation contained unverified figures, using fallback", {
        ruleId: recommendation.id,
      });
      return { text: fallbackExplanation(recommendation), source: "FALLBACK" };
    }

    await db.explanationCache.create({
      data: { cacheKey, ruleId: recommendation.id, text, model: MODEL },
    });

    return { text, source: "MODEL" };
  } catch (error) {
    console.error("[financialos] explanation failed", {
      ruleId: recommendation.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { text: fallbackExplanation(recommendation), source: "FALLBACK" };
  }
}

/**
 * Every dollar figure in the rewrite must appear in the source. Rounding
 * ("$24,500" -> "$24.5k") is tolerated by comparing on digits only.
 */
function containsUnknownFigures(text: string, recommendation: Recommendation): boolean {
  const source = [
    recommendation.headline,
    ...recommendation.why,
    ...recommendation.math.map((m) => `${m.label} ${m.value}`),
    ...recommendation.actions,
    ...(recommendation.caveats ?? []),
  ]
    .join(" ")
    .replace(/[,$]/g, "");

  const figures = text.match(/\$[\d,]+(\.\d+)?/g) ?? [];
  for (const figure of figures) {
    const digits = figure.replace(/[$,]/g, "").split(".")[0];
    if (digits.length < 3) continue; // ignore trivial amounts like $50
    if (!source.includes(digits)) return true;
  }
  return false;
}

/** Explain a batch, sequentially — this runs on demand, not on page load. */
export async function explainAll(
  recommendations: Recommendation[],
  literacy: LiteracyLevel = "BEGINNER"
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const recommendation of recommendations) {
    const { text } = await explainRecommendation(recommendation, literacy);
    out[recommendation.id] = text;
  }
  return out;
}
