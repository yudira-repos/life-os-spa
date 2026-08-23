import { timingSafeEqual } from "node:crypto";

// Shared-secret auth for the machine-to-machine endpoints: the OpenClaw
// gateway draining the outbox, and the FastAPI LifeOS enqueueing into it.
//
// Reuses OPENCLAW_API_SECRET, which both services already carry. One more
// secret to rotate is one more secret that quietly stops matching at 6am.
export function isServiceRequest(request: Request): boolean {
  const expected = process.env.OPENCLAW_API_SECRET?.trim();
  // Fail CLOSED. These endpoints read and write family message content; an
  // unset secret must never mean an open door.
  if (!expected) return false;

  const provided = request.headers.get("x-lifeos-api-key")?.trim() ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
