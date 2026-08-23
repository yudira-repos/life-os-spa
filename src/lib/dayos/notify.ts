// Outbound messages, and the honest truth about what each channel can do.
//
// The PRD asks for Telegram, WhatsApp, iMessage, SMS, email and push behind
// one notification service. That abstraction is right, but a registry that
// pretends the six are equivalent is worse than no registry — it lets the
// product promise a family a WhatsApp reminder that will never arrive.
//
// So the capability table below is part of the interface. Each driver declares
// what it can actually do, and the UI reads the same table: a member whose
// preferred channel can't be automated is told so at the moment they choose
// it, not at 3:15 on a Tuesday.
//
//   TELEGRAM  Fully automatable. Bot API, inline keyboards for Confirm /
//             Can't do it, and inbound replies. This is why the original
//             LifeOS was a Telegram bot, and it remains the best channel.
//   EMAIL     Fully automatable, but wrong for a 12-minute warning.
//   SMS       Automatable via a provider (Twilio/MessageBird), costs per
//             message, no buttons. Best for a grandparent with no apps.
//   PUSH      Automatable once there's a mobile client. There isn't one yet.
//   WHATSAPP  Only via the WhatsApp Business Platform, only with
//             pre-approved message templates, and — outside a 24-hour
//             customer-service window — ONLY templates. A carpool broadcast is
//             a template that has to be approved before it can ever be sent.
//             This is a business decision with a lead time, not a sprint task.
//   IMESSAGE  Not automatable. Apple exposes no send API to third parties.
//             Modelled so a member can record it as how they prefer to be
//             reached, and so the UI can say "you'll need to forward this" —
//             never silently dropped.
//
// Nothing here composes copy. Messages arrive fully rendered from leave.ts,
// escalation.ts and brief.ts, so the same words go to every channel and a test
// can assert them.

import { db } from "@/lib/db";
import { enqueueWhatsapp, type OutboxKind } from "@/lib/dayos/outbox";

export type Channel =
  | "TELEGRAM"
  | "WHATSAPP"
  | "SMS"
  | "EMAIL"
  | "PUSH"
  | "IMESSAGE"
  | "IN_APP";

export interface ChannelCapability {
  channel: Channel;
  /** Can LifeOS send on this channel unattended, today? */
  automatable: boolean;
  /** Can it carry Confirm / Can't-do-it buttons? */
  supportsReplyButtons: boolean;
  /** Suitable for a time-critical "leave now"? */
  realtime: boolean;
  /** Shown in the UI wherever this channel can be chosen. */
  note: string;
}

export const CHANNEL_CAPABILITIES: Record<Channel, ChannelCapability> = {
  TELEGRAM: {
    channel: "TELEGRAM",
    automatable: true,
    supportsReplyButtons: true,
    realtime: true,
    note: "Full support — reminders, buttons and replies.",
  },
  EMAIL: {
    channel: "EMAIL",
    automatable: true,
    supportsReplyButtons: false,
    realtime: false,
    note: "Good for the morning brief; too slow for a departure warning.",
  },
  SMS: {
    channel: "SMS",
    automatable: true,
    supportsReplyButtons: false,
    realtime: true,
    note: "Reliable and instant. Costs per message and can't carry buttons.",
  },
  PUSH: {
    channel: "PUSH",
    automatable: false,
    supportsReplyButtons: true,
    realtime: true,
    note: "Needs the LifeOS mobile app, which doesn't exist yet.",
  },
  WHATSAPP: {
    channel: "WHATSAPP",
    // Automatable now, but NOT the way the comment above once assumed. Not the
    // Business Cloud API — that cannot post to a consumer group at all and
    // needs pre-approved templates for anything outside a 24h window. This is
    // the OpenClaw gateway's paired WhatsApp Web session, which sends free
    // text. The gateway exposes no HTTP send API, so LifeOS queues to the
    // outbox and the gateway pulls. See outbox.ts.
    automatable: true,
    // The session can receive replies, but LifeOS has no inbound handler for
    // them yet, so a confirm/decline button would be a promise it can't keep.
    supportsReplyButtons: false,
    realtime: true,
    note: "Sent through the paired WhatsApp session on the LifeOS gateway.",
  },
  IMESSAGE: {
    channel: "IMESSAGE",
    automatable: false,
    supportsReplyButtons: false,
    realtime: false,
    note: "Apple provides no send API. Recorded as a preference; LifeOS can't send it.",
  },
  IN_APP: {
    channel: "IN_APP",
    automatable: true,
    supportsReplyButtons: true,
    realtime: false,
    note: "Always available. Only seen when someone opens LifeOS.",
  },
};

export function isAutomatable(channel: string): boolean {
  return CHANNEL_CAPABILITIES[channel as Channel]?.automatable ?? false;
}

export interface Recipient {
  /** "member:<id>" or "contact:<id>" — the dispatch dedupe key. */
  key: string;
  displayName: string;
  channel: Channel;
  address: string;
  quietFromMinute?: number | null;
  quietToMinute?: number | null;
}

export type DispatchKind =
  | "BRIEF"
  | "PREPARE"
  | "DRIVE_NOW"
  | "RETIME"
  | "ASK"
  | "REMIND"
  | "ESCALATE"
  | "BROADCAST"
  | "UNCOVERED";

/** Kinds that ignore quiet hours. Missing a pickup outranks a quiet hour. */
export const URGENT_KINDS: DispatchKind[] = ["DRIVE_NOW", "RETIME", "UNCOVERED"];

export interface SendRequest {
  occurrenceId: string;
  kind: DispatchKind;
  recipient: Recipient;
  body: string;
  localMinuteOfDay: number;
}

export type SendOutcome =
  | { sent: true; channel: Channel }
  | { sent: false; status: "DUPLICATE" | "SUPPRESSED" | "UNSUPPORTED" | "FAILED"; detail: string };

/**
 * Send exactly once.
 *
 * The dispatch row is written FIRST, inside a unique constraint on
 * (occurrence, kind, recipient). If two worker ticks race — and with a
 * per-minute cron and a slow provider they will — the second one loses the
 * insert and returns DUPLICATE instead of sending a second "drive now". A
 * duplicate urgent message is not a cosmetic bug: it teaches people that the
 * alerts are noise.
 */
export async function sendOnce(req: SendRequest): Promise<SendOutcome> {
  const capability = CHANNEL_CAPABILITIES[req.recipient.channel];

  let claimed = false;
  try {
    await db.notificationDispatch.create({
      data: {
        occurrenceId: req.occurrenceId,
        kind: req.kind,
        channel: req.recipient.channel,
        recipient: req.recipient.key,
        status: "PENDING",
        body: req.body,
      },
    });
    claimed = true;
  } catch {
    // Unique violation — someone else already has this one.
    return { sent: false, status: "DUPLICATE", detail: "Already dispatched." };
  }

  const finish = async (status: string, detail: string) => {
    if (!claimed) return;
    await db.notificationDispatch.updateMany({
      where: {
        occurrenceId: req.occurrenceId,
        kind: req.kind,
        recipient: req.recipient.key,
      },
      data: { status, detail, sentAt: status === "SENT" ? new Date() : null },
    });
  };

  if (!capability.automatable) {
    await finish("SUPPRESSED", `${req.recipient.channel} can't be sent automatically.`);
    return { sent: false, status: "UNSUPPORTED", detail: capability.note };
  }

  if (!URGENT_KINDS.includes(req.kind) && inQuietHours(req)) {
    await finish("SUPPRESSED", "Inside this member's quiet hours.");
    return { sent: false, status: "SUPPRESSED", detail: "Quiet hours." };
  }

  const ok = await deliver(req.recipient, req.body, req.kind);
  await finish(ok ? "SENT" : "FAILED", ok ? "" : "Provider rejected the message.");
  return ok
    ? { sent: true, channel: req.recipient.channel }
    : { sent: false, status: "FAILED", detail: "Provider rejected the message." };
}

function inQuietHours(req: SendRequest): boolean {
  const from = req.recipient.quietFromMinute;
  const to = req.recipient.quietToMinute;
  if (from == null || to == null) return false;
  const m = req.localMinuteOfDay;
  // A window that wraps midnight (22:00–07:00) is the normal case.
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

async function deliver(
  recipient: Recipient,
  body: string,
  kind: DispatchKind = "BRIEF"
): Promise<boolean> {
  switch (recipient.channel) {
    case "TELEGRAM":
      return sendTelegram(recipient.address, body);
    case "WHATSAPP":
      return queueWhatsapp(recipient, body, kind);
    case "EMAIL":
      return sendEmail(recipient.address, body);
    case "SMS":
      return sendSms(recipient.address, body);
    case "IN_APP":
      return true; // The dispatch row IS the in-app notification.
    default:
      return false;
  }
}

/**
 * WhatsApp is queued, not sent inline.
 *
 * A queued row is reported as SENT to the caller, and that is a deliberate
 * choice worth naming: the alternative is holding the escalation ladder open
 * until a cron tick confirms delivery, which would stall the whole rung. The
 * dispatch row and the outbox row are both durable and both carry status, so
 * a message that later fails to deliver is still answerable — it is not lost,
 * just recorded in outbox.lastError rather than here.
 */
async function queueWhatsapp(
  recipient: Recipient,
  body: string,
  kind: DispatchKind
): Promise<boolean> {
  const result = await enqueueWhatsapp({
    toAddress: recipient.address,
    body,
    kind: kind as OutboxKind,
    // Same identity the dispatch row is unique on, so the two layers agree on
    // what "the same message" means and a retry can never double-send.
    dedupeKey: `dispatch:${recipient.key}:${kind}:${hashBody(body)}`,
  });
  return result.queued || result.reason === "DUPLICATE";
}

/** Short stable digest, so a re-sent identical body dedupes and a changed one doesn't. */
function hashBody(body: string): string {
  let h = 5381;
  for (let i = 0; i < body.length; i += 1) h = ((h << 5) + h + body.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_notification: false }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendEmail(to: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.DAYOS_MAIL_FROM?.trim();
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject: "LifeOS", text }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendSms(to: string, text: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) return false;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: text }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Which configured channels can actually send right now. For the settings UI. */
export function configuredChannels(): Channel[] {
  const out: Channel[] = ["IN_APP"];
  if (process.env.TELEGRAM_BOT_TOKEN) out.push("TELEGRAM");
  if (process.env.RESEND_API_KEY && process.env.DAYOS_MAIL_FROM) out.push("EMAIL");
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) out.push("SMS");
  // WhatsApp needs no key here — it is queued locally and delivered by the
  // gateway. It is listed only when a gateway is actually configured to drain
  // the queue, so the settings UI never offers a channel that goes nowhere.
  if (process.env.OPENCLAW_API_SECRET) out.push("WHATSAPP");
  return out;
}
