import Anthropic from "@anthropic-ai/sdk";
import { parseDay } from "@/lib/travelos/dates";
import { classifyTitle, type ParsedEntry, type ParseResult } from "@/lib/travelos/calendar/parse";

// Extraction for the format most districts actually publish: a PDF of a
// year-at-a-glance grid, or a photo of the one stuck to the fridge.
//
// The PDF goes to the model as a document, not as scraped text. School
// calendars are visual — a coloured grid where a legend maps colours to
// "no school" and dates are cells rather than sentences. Text extraction
// flattens that into an unordered soup of numbers and loses which day each
// label belongs to, which is the only thing we need.
//
// THE IMPORTANT PART: nothing here is trusted. Every extracted entry lands in
// a DRAFT calendar with a per-entry confidence score and `confirmed: false`,
// and a human reviews the list before it can feed the window engine. A model
// misreading "March 23-27" as "March 23-31" would otherwise silently produce a
// vacation window that doesn't exist — the family finds out at the airport.

const MODEL = process.env.TRAVEL_EXTRACT_MODEL ?? "claude-sonnet-4-5";
const MAX_TOKENS = 8_000;

export function extractionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class ExtractionUnavailableError extends Error {
  constructor() {
    super(
      "PDF and image calendars need ANTHROPIC_API_KEY to be set. Upload an .ics " +
        "or .csv export instead, or add the dates by hand."
    );
    this.name = "ExtractionUnavailableError";
  }
}

const SYSTEM_PROMPT = `You extract non-attendance dates from school calendars.

You are reading a school district calendar, usually a year-at-a-glance grid with a colour legend. Extract EVERY date on which students do not attend school, plus the first and last day of school.

Rules:
- Report dates exactly as printed. Never infer, extend, or "tidy" a range.
- A multi-day break is ONE entry with a start and end date, inclusive of both. "Winter Break Dec 22 - Jan 2" is one entry, not twelve.
- Use the calendar's own wording for the title.
- Distinguish these kinds:
  BREAK        — multi-day vacation (winter, spring, summer, thanksgiving)
  HOLIDAY      — single-day closure (Labor Day, Memorial Day, Juneteenth)
  TEACHER_DAY  — staff development / in-service / parent conferences, students off
  EARLY_RELEASE— shortened day, students DO attend (noSchool must be false)
  FIRST_DAY    — first day of school (noSchool false)
  LAST_DAY     — last day of school (noSchool false)
- If the year is ambiguous, use the school year context: months Aug-Dec belong to the first year, Jan-Jul to the second.
- confidence: 1.0 when the date and label are printed unambiguously; 0.5 when you inferred a boundary from a colour block or a partially legible cell; below 0.5 if you are guessing.
- If a region is unreadable, do not invent entries for it. Say so in notes.

Return only what you can actually see. An omission is recoverable by the human reviewer; a fabricated date is not.`;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "record_calendar",
  description: "Record the extracted school calendar dates.",
  input_schema: {
    type: "object",
    properties: {
      schoolName: { type: "string", description: "School or district name, if printed." },
      schoolYearStart: { type: "string", description: "First day of school, YYYY-MM-DD." },
      schoolYearEnd: { type: "string", description: "Last day of school, YYYY-MM-DD." },
      notes: {
        type: "string",
        description: "Anything unreadable, ambiguous, or worth the reviewer's attention.",
      },
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            startDate: { type: "string", description: "YYYY-MM-DD" },
            endDate: { type: "string", description: "YYYY-MM-DD, inclusive. Same as start for one day." },
            kind: {
              type: "string",
              enum: ["BREAK", "HOLIDAY", "TEACHER_DAY", "EARLY_RELEASE", "FIRST_DAY", "LAST_DAY", "OTHER"],
            },
            noSchool: { type: "boolean" },
            confidence: { type: "number", description: "0 to 1." },
          },
          required: ["title", "startDate", "endDate", "kind", "noSchool", "confidence"],
        },
      },
    },
    required: ["entries"],
  },
};

export interface ExtractionResult extends ParseResult {
  schoolName?: string;
  schoolYearStart?: Date;
  schoolYearEnd?: Date;
  notes?: string;
  model: string;
}

interface RawEntry {
  title: string;
  startDate: string;
  endDate: string;
  kind: string;
  noSchool: boolean;
  confidence: number;
}

export async function extractCalendar(params: {
  data: Buffer;
  mediaType: string;
  format: "PDF" | "IMAGE";
  hintYear?: number;
}): Promise<ExtractionResult> {
  if (!extractionConfigured()) throw new ExtractionUnavailableError();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = params.data.toString("base64");

  const content: Anthropic.ContentBlockParam[] =
    params.format === "PDF"
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: params.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
              data: base64,
            },
          },
        ];

  content.push({
    type: "text",
    text: params.hintYear
      ? `Extract every non-attendance date. This calendar covers the ${params.hintYear}-${params.hintYear + 1} school year.`
      : "Extract every non-attendance date from this school calendar.",
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_calendar" },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    return {
      entries: [],
      warnings: ["Could not read any dates from that file. Try a clearer scan, or upload an .ics export."],
      model: MODEL,
    };
  }

  const payload = toolUse.input as {
    schoolName?: string;
    schoolYearStart?: string;
    schoolYearEnd?: string;
    notes?: string;
    entries?: RawEntry[];
  };

  const warnings: string[] = [];
  const entries: ParsedEntry[] = [];

  for (const raw of payload.entries ?? []) {
    const start = parseDay(raw.startDate);
    const end = parseDay(raw.endDate) ?? start;
    if (!start || !end) {
      warnings.push(`Dropped "${raw.title}" — the extracted date wasn't a valid date.`);
      continue;
    }
    if (end < start) {
      warnings.push(`Dropped "${raw.title}" — it ended before it started.`);
      continue;
    }

    // Sanity bound. A "break" spanning months is a misread grid, not a break,
    // and it would swallow the entire window engine if it got through.
    const span = (end.getTime() - start.getTime()) / 86_400_000;
    if (span > 100) {
      warnings.push(`Dropped "${raw.title}" — ${Math.round(span)} days is too long to be a real break.`);
      continue;
    }

    // Trust the model's label, but fall back to our own classifier when it
    // returns something outside the enum.
    const classified = classifyTitle(raw.title);
    const kind = isKnownKind(raw.kind) ? raw.kind : classified.kind;

    entries.push({
      title: raw.title.trim().slice(0, 120),
      startDate: start,
      endDate: end,
      kind,
      noSchool: kind === "EARLY_RELEASE" || kind === "FIRST_DAY" || kind === "LAST_DAY" ? false : raw.noSchool !== false,
      source: "LLM",
      confidence: clamp01(raw.confidence ?? 0.5),
      rawText: `${raw.title} (${raw.startDate}–${raw.endDate})`,
    });
  }

  if (entries.length === 0) {
    warnings.push("No dates were extracted. Try a clearer scan, or upload an .ics export.");
  }

  const lowConfidence = entries.filter((e) => (e.confidence ?? 1) < 0.7).length;
  if (lowConfidence > 0) {
    warnings.push(
      `${lowConfidence} ${lowConfidence === 1 ? "entry needs" : "entries need"} a careful look — they were read from an ambiguous part of the calendar.`
    );
  }

  return {
    entries: entries.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
    warnings,
    schoolName: payload.schoolName?.trim().slice(0, 120),
    schoolYearStart: parseDay(payload.schoolYearStart ?? "") ?? undefined,
    schoolYearEnd: parseDay(payload.schoolYearEnd ?? "") ?? undefined,
    notes: payload.notes?.trim().slice(0, 1000),
    model: MODEL,
  };
}

const KNOWN_KINDS = [
  "BREAK",
  "HOLIDAY",
  "TEACHER_DAY",
  "EARLY_RELEASE",
  "FIRST_DAY",
  "LAST_DAY",
  "OTHER",
] as const;

function isKnownKind(value: string): value is (typeof KNOWN_KINDS)[number] {
  return (KNOWN_KINDS as readonly string[]).includes(value);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(Math.max(value, 0), 1);
}
