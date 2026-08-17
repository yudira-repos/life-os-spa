import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute } from "@/lib/travelos/authz";
import { detectFormat, parseIcs, parseCsv, type ParseResult } from "@/lib/travelos/calendar/parse";
import {
  extractCalendar,
  extractionConfigured,
  ExtractionUnavailableError,
} from "@/lib/travelos/calendar/extract";

// Upload a school calendar.
//
// The uploaded file is parsed and DISCARDED. We keep the extracted dates and
// the file's name, never the file itself — there's no reason to hold a PDF
// that may carry a child's name, school and daily schedule once we have the
// six dates we needed from it.
//
// Everything lands as DRAFT. Nothing here reaches the window engine until a
// human has reviewed it.

export const maxDuration = 60; // PDF extraction is slower than a normal route

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;
  const { household, user } = guard;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1_048_576).toFixed(1)}MB. The limit is 12MB.` },
      { status: 413 }
    );
  }

  const childIds = form
    .getAll("childIds")
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (childIds.length === 0) {
    return NextResponse.json(
      { error: "Pick which children this calendar applies to." },
      { status: 400 }
    );
  }

  // Never trust ids off the wire.
  const children = await db.householdMember.findMany({
    where: { id: { in: childIds }, householdId: household.id, role: "CHILD" },
    select: { id: true },
  });
  if (children.length === 0) {
    return NextResponse.json({ error: "Those children aren't in this household." }, { status: 400 });
  }

  const format = detectFormat(file.name, file.type);
  if (format === "UNKNOWN") {
    return NextResponse.json(
      { error: "Unsupported file. Upload an .ics, .csv, .pdf, or a photo of the calendar." },
      { status: 415 }
    );
  }

  if ((format === "PDF" || format === "IMAGE") && !extractionConfigured()) {
    return NextResponse.json(
      {
        error:
          "Reading PDFs and photos needs ANTHROPIC_API_KEY to be set. Upload an .ics or .csv export instead, or add the dates by hand.",
      },
      { status: 503 }
    );
  }

  let result: ParseResult & {
    schoolName?: string;
    schoolYearStart?: Date;
    schoolYearEnd?: Date;
    notes?: string;
    model?: string;
  };

  try {
    if (format === "ICS") {
      result = parseIcs(await file.text());
    } else if (format === "CSV") {
      result = parseCsv(await file.text());
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      result = await extractCalendar({
        data: buffer,
        mediaType: file.type || (format === "PDF" ? "application/pdf" : "image/png"),
        format,
      });
    }
  } catch (error) {
    if (error instanceof ExtractionUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[travelos] calendar parse failed", error);
    return NextResponse.json(
      { error: "Could not read that calendar. Try an .ics export, or add the dates by hand." },
      { status: 422 }
    );
  }

  if (result.entries.length === 0) {
    return NextResponse.json(
      {
        error: "No dates could be read from that file.",
        warnings: result.warnings,
      },
      { status: 422 }
    );
  }

  const name =
    (form.get("name") as string | null)?.trim() ||
    result.schoolName ||
    file.name.replace(/\.[^.]+$/, "");

  const calendar = await db.schoolCalendar.create({
    data: {
      householdId: household.id,
      name: name.slice(0, 120),
      schoolName: result.schoolName?.slice(0, 120) ?? null,
      sourceType: format,
      sourceFileName: file.name.slice(0, 200),
      schoolYearStart: result.schoolYearStart ?? null,
      schoolYearEnd: result.schoolYearEnd ?? null,
      status: "DRAFT",
      extractionModel: result.model ?? null,
      extractionNotes: result.notes ?? null,
      createdByUserId: user.id,
      children: { create: children.map((child) => ({ childId: child.id })) },
      entries: {
        create: result.entries.map((entry) => ({
          startDate: entry.startDate,
          endDate: entry.endDate,
          title: entry.title,
          kind: entry.kind,
          noSchool: entry.noSchool,
          source: entry.source,
          confidence: entry.confidence ?? null,
          // Deterministic parses are pre-confirmed; a human still reviews the
          // list, but an .ics date doesn't need per-row attention the way an
          // extracted one does.
          confirmed: entry.source === "PARSED",
          rawText: entry.rawText ?? null,
        })),
      },
    },
    include: { entries: true },
  });

  return NextResponse.json({
    calendarId: calendar.id,
    entryCount: calendar.entries.length,
    needsReview: calendar.entries.filter((e) => !e.confirmed).length,
    warnings: result.warnings,
    notes: result.notes ?? null,
  });
}
