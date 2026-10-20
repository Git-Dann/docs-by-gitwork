/**
 * Upload links for Sheet images (CLAUDE.md §73.4) — how Claude gets a dropped image into a sheet.
 *
 * In a Claude chat, Claude can SEE an image you drop in but cannot hand its bytes to a tool; it
 * can only reach the file from its code sandbox. So MCP issues a short-lived signed link, and the
 * sandbox POSTs the files to it (`curl -F file=@…`). The link is the credential:
 *
 *  - **Stateless and signed** (HMAC-SHA256 over the payload, same secret as wiki access cookies),
 *    so nothing is stored and nothing can be forged without the server secret.
 *  - **Scoped**: one client, one sheet, optionally one row + media column. It cannot be pointed
 *    anywhere else, and the save path still runs every check the grid's upload runs.
 *  - **Short-lived** (`UPLOAD_TICKET_TTL_MS`) and usable for several files within that window —
 *    one link per batch of screenshots, not per file.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const UPLOAD_TICKET_TTL_MS = 30 * 60 * 1000;

export interface UploadTicket {
  /** Client id. */
  c: string;
  /** Sheet id. */
  s: string;
  /** Row id to attach to, if any. */
  r?: string;
  /** Media column id to attach to, if any (always with r). */
  k?: string;
  /** Name the uploads are recorded under. */
  n: string;
  /** Issuing user id (audit). */
  u: string | null;
  /** Expiry, epoch ms. */
  e: number;
}

function secret(): string {
  const s = process.env.ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("No signing secret for upload links — set ENCRYPTION_KEY (or NEXTAUTH_SECRET).");
  return s;
}

const sign = (body: string) => createHmac("sha256", `sheet-upload:${secret()}`).update(body).digest("base64url");

export function issueUploadTicket(t: Omit<UploadTicket, "e">, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...t, e: now + UPLOAD_TICKET_TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export type TicketCheck = { ok: true; ticket: UploadTicket } | { ok: false; reason: "invalid" | "expired" };

export function readUploadTicket(raw: string, now = Date.now()): TicketCheck {
  const [body, sig, extra] = raw.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "invalid" };
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "invalid" };
  let t: UploadTicket;
  try {
    t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadTicket;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof t.c !== "string" || typeof t.s !== "string" || typeof t.e !== "number") return { ok: false, reason: "invalid" };
  if (now > t.e) return { ok: false, reason: "expired" };
  return { ok: true, ticket: t };
}
