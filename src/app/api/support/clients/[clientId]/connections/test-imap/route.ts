import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/support/clients/[clientId]/connections/test-imap
// Body: { config: { imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure, username, password } }
// Tries an IMAP login and an SMTP verify, returning per-leg ok/error so the connector form can
// show instant feedback before saving. Never persists anything.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      config?: {
        imapHost?: string;
        imapPort?: number;
        imapSecure?: boolean;
        smtpHost?: string;
        smtpPort?: number;
        smtpSecure?: boolean;
        username?: string;
        password?: string;
      };
    };
    const cfg = body.config ?? {};
    if (!cfg.username || !cfg.password) {
      return apiError("username and password are required to test", 400);
    }

    // ── IMAP login ──
    let imap: { ok: boolean; error?: string } = { ok: false };
    if (cfg.imapHost) {
      const client = new ImapFlow({
        host: cfg.imapHost,
        port: cfg.imapPort ?? 993,
        secure: cfg.imapSecure ?? true,
        auth: { user: cfg.username, pass: cfg.password },
        logger: false,
      });
      try {
        await client.connect();
        await client.logout();
        imap = { ok: true };
      } catch (err) {
        try { await client.logout(); } catch { /* already down */ }
        imap = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      imap = { ok: false, error: "No IMAP host set" };
    }

    // ── SMTP verify ──
    let smtp: { ok: boolean; error?: string } = { ok: false };
    if (cfg.smtpHost) {
      try {
        const transport = nodemailer.createTransport({
          host: cfg.smtpHost,
          port: cfg.smtpPort ?? 465,
          secure: cfg.smtpSecure ?? (cfg.smtpPort ?? 465) === 465,
          auth: { user: cfg.username, pass: cfg.password },
        });
        await transport.verify();
        smtp = { ok: true };
      } catch (err) {
        smtp = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      smtp = { ok: false, error: "No SMTP host set" };
    }

    return apiOk({ imap, smtp });
  } catch (error) {
    return fromError(error);
  }
}
