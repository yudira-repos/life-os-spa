import { parseDay, dayKey, addDays } from "@/lib/travelos/dates";

// Deterministic parsers for the two machine-readable formats schools publish.
//
// No dependency for either. An ICS file is a line-oriented format with a
// handful of rules (unfolding, escaping, DATE vs DATE-TIME), and a school
// calendar uses maybe five of them. Pulling in a full RFC 5545 library to read
// VEVENT summaries and dates would be more code to audit than the ~80 lines
// below, and the failure mode we care about — a wrong date — is exactly what
// we'd still have to verify ourselves.
//
// Anything these can't read (a PDF, a photo of a printed calendar) goes to
// the extraction path in extract.ts and comes back needing human review.

export type EntryKind =
  | "BREAK"
  | "HOLIDAY"
  | "TEACHER_DAY"
  | "EARLY_RELEASE"
  | "FIRST_DAY"
  | "LAST_DAY"
  | "OTHER";

export interface ParsedEntry {
  title: string;
  startDate: Date;
  endDate: Date;
  kind: EntryKind;
  noSchool: boolean;
  source: "PARSED" | "LLM" | "MANUAL";
  confidence?: number;
  rawText?: string;
}

export interface ParseResult {
  entries: ParsedEntry[];
  warnings: string[];
}

// --- Classification ---------------------------------------------------------
// The title is the only signal these formats give us about what a date means.
// Order matters: "no school - teacher inservice" should classify as a teacher
// day, and "early release" must be caught before the generic no-school check,
// because an early release day is NOT a day you can fly somewhere.

const RULES: { pattern: RegExp; kind: EntryKind; noSchool: boolean }[] = [
  { pattern: /\b(early\s*(release|dismissal)|half\s*day|minimum\s*day)\b/i, kind: "EARLY_RELEASE", noSchool: false },
  { pattern: /\b(first\s*day|school\s*(begins|starts)|back\s*to\s*school)\b/i, kind: "FIRST_DAY", noSchool: false },
  { pattern: /\b(last\s*day|school\s*ends|end\s*of\s*(school\s*)?year)\b/i, kind: "LAST_DAY", noSchool: false },
  { pattern: /\b(teacher|staff|professional\s*(development|learning)|in[-\s]?service|prep\s*day|pd\s*day|conference[s]?)\b/i, kind: "TEACHER_DAY", noSchool: true },
  { pattern: /\b(winter|spring|fall|autumn|summer|thanksgiving|mid[-\s]?winter|february|april)\s*(break|recess|vacation|holiday)\b/i, kind: "BREAK", noSchool: true },
  { pattern: /\b(break|recess|intersession)\b/i, kind: "BREAK", noSchool: true },
  { pattern: /\b(holiday|day\b.*\bobserved|memorial|labor|independence|veterans|thanksgiving|christmas|new\s*year|juneteenth|presidents|martin\s*luther|indigenous|columbus|lunar\s*new\s*year|diwali|eid|yom\s*kippur|rosh\s*hashanah)\b/i, kind: "HOLIDAY", noSchool: true },
  { pattern: /\bno\s*(school|classes|students)\b/i, kind: "HOLIDAY", noSchool: true },
  { pattern: /\b(closed|closure)\b/i, kind: "HOLIDAY", noSchool: true },
];

export function classifyTitle(title: string): { kind: EntryKind; noSchool: boolean } {
  for (const rule of RULES) {
    if (rule.pattern.test(title)) return { kind: rule.kind, noSchool: rule.noSchool };
  }
  return { kind: "OTHER", noSchool: false };
}

// --- ICS --------------------------------------------------------------------

/**
 * Unfold RFC 5545 line folding: a CRLF followed by a space or tab is a
 * continuation of the previous line, not a new one. Long event titles are
 * folded routinely, and not unfolding them truncates every one of them.
 */
function unfold(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = [];
  for (const line of normalized.split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseIcs(text: string): ParseResult {
  const entries: ParsedEntry[] = [];
  const warnings: string[] = [];
  const lines = unfold(text);

  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {};
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (current) {
        const entry = icsEventToEntry(current, warnings);
        if (entry) entries.push(entry);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rawKey = line.slice(0, colon);
    const value = line.slice(colon + 1);
    // Strip parameters: DTSTART;VALUE=DATE -> DTSTART, but keep the params so
    // we can tell an all-day event from a timed one.
    const [key, ...params] = rawKey.split(";");
    current[key.toUpperCase()] = value;
    if (params.length > 0) current[`${key.toUpperCase()}_PARAMS`] = params.join(";");
  }

  if (entries.length === 0) {
    warnings.push("No calendar events found in this file. Is it a valid .ics export?");
  }

  return { entries: dedupe(entries), warnings };
}

function icsEventToEntry(
  event: Record<string, string>,
  warnings: string[]
): ParsedEntry | null {
  const title = unescapeIcsText(event.SUMMARY ?? "");
  if (!title) return null;

  const start = parseDay(event.DTSTART ?? "");
  if (!start) {
    warnings.push(`Skipped "${title}" — could not read its start date.`);
    return null;
  }

  // ICS DTEND on an all-day event is EXCLUSIVE: a single day off on March 23
  // is DTSTART=20270323, DTEND=20270324. Treating DTEND as inclusive adds a
  // phantom day to every break, which then shows up as a longer vacation
  // window than the school actually gives you.
  let end = start;
  const rawEnd = event.DTEND;
  if (rawEnd) {
    const parsedEnd = parseDay(rawEnd);
    if (parsedEnd) {
      const isAllDay =
        (event.DTEND_PARAMS ?? "").toUpperCase().includes("VALUE=DATE") ||
        /^\d{8}$/.test(rawEnd.trim());
      end = isAllDay ? addDays(parsedEnd, -1) : parsedEnd;
      if (end < start) end = start;
    }
  }

  const { kind, noSchool } = classifyTitle(title);
  return {
    title,
    startDate: start,
    endDate: end,
    kind,
    noSchool,
    source: "PARSED",
    rawText: title,
  };
}

// --- CSV --------------------------------------------------------------------

/**
 * Accepts the shapes people actually export: a date column plus a title, with
 * an optional end date. Header names are matched loosely because every district
 * names them differently ("Date", "Start", "Begin Date", "Event", "Description").
 */
export function parseCsv(text: string): ParseResult {
  const warnings: string[] = [];
  const rows = splitCsvRows(text).filter((row) => row.some((cell) => cell.trim()));

  if (rows.length < 2) {
    return { entries: [], warnings: ["The file has no data rows."] };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const startIndex = findColumn(header, ["start date", "start", "begin date", "begin", "date", "from"]);
  const endIndex = findColumn(header, ["end date", "end", "through", "to", "finish"]);
  const titleIndex = findColumn(header, ["title", "event", "name", "description", "summary", "holiday"]);

  if (startIndex === -1 || titleIndex === -1) {
    return {
      entries: [],
      warnings: [
        "Could not find a date column and a title column. Expected headers like \"Date\" and \"Event\".",
      ],
    };
  }

  const entries: ParsedEntry[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const title = (row[titleIndex] ?? "").trim();
    const start = parseDay(row[startIndex] ?? "");
    if (!title || !start) {
      if (title || (row[startIndex] ?? "").trim()) {
        warnings.push(`Row ${i + 1}: skipped — needs both a date and a title.`);
      }
      continue;
    }

    const end = endIndex >= 0 ? (parseDay(row[endIndex] ?? "") ?? start) : start;
    const { kind, noSchool } = classifyTitle(title);
    entries.push({
      title,
      startDate: start,
      endDate: end < start ? start : end,
      kind,
      noSchool,
      source: "PARSED",
      rawText: row.join(","),
    });
  }

  return { entries: dedupe(entries), warnings };
}

function findColumn(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = header.indexOf(candidate);
    if (index !== -1) return index;
  }
  for (const candidate of candidates) {
    const index = header.findIndex((h) => h.includes(candidate));
    if (index !== -1) return index;
  }
  return -1;
}

/** Minimal CSV reader that respects quoted fields containing commas. */
function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --- Shared -----------------------------------------------------------------

/** Same title on the same day twice is a duplicate, not two days off. */
function dedupe(entries: ParsedEntry[]): ParsedEntry[] {
  const seen = new Set<string>();
  const out: ParsedEntry[] = [];
  for (const entry of entries) {
    const key = `${dayKey(entry.startDate)}|${dayKey(entry.endDate)}|${entry.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

export function detectFormat(fileName: string, contentType?: string): "ICS" | "CSV" | "PDF" | "IMAGE" | "UNKNOWN" {
  const name = fileName.toLowerCase();
  const type = (contentType ?? "").toLowerCase();

  if (name.endsWith(".ics") || type.includes("calendar")) return "ICS";
  if (name.endsWith(".csv") || type.includes("csv")) return "CSV";
  if (name.endsWith(".pdf") || type.includes("pdf")) return "PDF";
  if (/\.(png|jpe?g|webp|gif|heic)$/.test(name) || type.startsWith("image/")) return "IMAGE";
  return "UNKNOWN";
}
