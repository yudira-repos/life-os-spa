import { NextResponse, type NextRequest } from "next/server";
import { tickAll } from "@/lib/dayos/agent";

// The proactive loop's entry point, called by the platform scheduler.
//
// Not a user route: it acts for every household at once, so it authenticates
// with a shared secret rather than a session. If DAYOS_TICK_SECRET is unset the
// route refuses to run at all — an open endpoint that can make the product
// message an entire user base is not something to leave on by default in a
// misconfigured environment.
//
// Cadence: every 5 minutes is the sweet spot. The DRIVE_NOW window is 5 minutes
// wide on either side of the departure (see leave.ts), so a 5-minute tick can
// never step over it, and anything faster mostly re-reads a cached routing
// estimate.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.DAYOS_TICK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "DAYOS_TICK_SECRET is not set — the proactive loop is disabled." },
      { status: 503 }
    );
  }

  const presented =
    request.headers.get("x-dayos-tick-secret") ??
    request.nextUrl.searchParams.get("secret") ??
    "";

  if (presented !== secret) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const started = Date.now();
  const results = await tickAll(new Date());

  return NextResponse.json({
    households: results.length,
    briefsSent: results.reduce((n, r) => n + r.briefsSent, 0),
    departureAlerts: results.reduce((n, r) => n + r.departureAlerts, 0),
    retimeAlerts: results.reduce((n, r) => n + r.retimeAlerts, 0),
    escalations: results.reduce((n, r) => n + r.escalations, 0),
    errors: results.flatMap((r) => r.errors),
    elapsedMs: Date.now() - started,
  });
}
