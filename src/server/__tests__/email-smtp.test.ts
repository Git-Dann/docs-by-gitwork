// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { workspace: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

const sendMail = vi.fn();
const createTransport = vi.fn((_opts: Record<string, unknown>) => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport: (o: Record<string, unknown>) => createTransport(o) } }));

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

import { envSmtp, sendWorkspaceEmail } from "@/server/email";
import { readSmtpPassword, storeSmtpPassword } from "@/server/smtp-password";

const google = {
  emailProvider: "SMTP",
  emailApiKey: null,
  emailFromAddress: "hello@gitwork.co.uk",
  emailFromName: "Gitwork",
  emailReplyTo: null,
  emailSmtpHost: "smtp.gmail.com",
  emailSmtpPort: 465,
  emailSmtpUser: "hello@gitwork.co.uk",
  emailSmtpPassword: "",
};

beforeEach(() => {
  findUnique.mockReset();
  sendMail.mockReset().mockResolvedValue({ messageId: "<m1@gmail>" });
  createTransport.mockClear();
  google.emailSmtpPassword = storeSmtpPassword("abcd efgh ijkl mnop");
});

describe("workspace email over SMTP (Google Workspace)", () => {
  it("sends through the saved SMTP server, with the decrypted password and the attachment", async () => {
    findUnique.mockResolvedValue(google);
    const res = await sendWorkspaceEmail({
      workspaceId: "w1",
      to: "buyer@acme.test",
      subject: "Your Pulse report",
      html: "<p>hi</p>",
      attachments: [{ filename: "report.pdf", content: new Uint8Array([37, 80, 68, 70]) }],
    });
    expect(res).toEqual({ ok: true, id: "<m1@gmail>" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.gmail.com", port: 465, secure: true, auth: { user: "hello@gitwork.co.uk", pass: "abcd efgh ijkl mnop" },
    }));
    const mail = sendMail.mock.calls[0][0];
    expect(mail.from).toBe("Gitwork <hello@gitwork.co.uk>");
    expect(mail.to).toEqual(["buyer@acme.test"]);
    expect(mail.attachments[0].filename).toBe("report.pdf");
    expect(Buffer.isBuffer(mail.attachments[0].content)).toBe(true);
  });

  it("uses STARTTLS, required, on port 587", async () => {
    findUnique.mockResolvedValue({ ...google, emailSmtpPort: 587 });
    await sendWorkspaceEmail({ workspaceId: "w1", to: "a@b.test", subject: "s", html: "h" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true }));
  });

  it("still reads a password saved in plain text before encryption", async () => {
    findUnique.mockResolvedValue({ ...google, emailSmtpPassword: "legacy-plain" });
    await sendWorkspaceEmail({ workspaceId: "w1", to: "a@b.test", subject: "s", html: "h" });
    expect(createTransport.mock.calls[0][0]).toMatchObject({ auth: { pass: "legacy-plain" } });
  });

  it("says what is missing instead of sending without a password", async () => {
    findUnique.mockResolvedValue({ ...google, emailSmtpPassword: null });
    const res = await sendWorkspaceEmail({ workspaceId: "w1", to: "a@b.test", subject: "s", html: "h" });
    expect(res).toEqual({ ok: false, error: expect.stringContaining("password is missing") });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("reports an SMTP rejection (e.g. a wrong app password) as a failure, not a throw", async () => {
    findUnique.mockResolvedValue(google);
    sendMail.mockRejectedValue(new Error("535-5.7.8 Username and Password not accepted"));
    const res = await sendWorkspaceEmail({ workspaceId: "w1", to: "a@b.test", subject: "s", html: "h" });
    expect(res).toEqual({ ok: false, error: expect.stringContaining("535") });
  });

  it("does not need a Resend key when SMTP is chosen", async () => {
    findUnique.mockResolvedValue({ ...google, emailApiKey: null });
    const res = await sendWorkspaceEmail({ workspaceId: "w1", to: "a@b.test", subject: "s", html: "h" });
    expect(res.ok).toBe(true);
  });
});

describe("the server's own SMTP account, when Settings is empty", () => {
  const env = {
    SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_USER: "foundry@gitwork.co.uk",
    SMTP_PASSWORD: "app-pass", SMTP_FROM: '\\"Gitwork\\" <foundry@gitwork.co.uk>',
  };

  it("is used when no provider is chosen, so reports still go out", async () => {
    Object.assign(process.env, env);
    try {
      findUnique.mockResolvedValue({ ...google, emailProvider: null, emailApiKey: null, emailFromAddress: null });
      const res = await sendWorkspaceEmail({ workspaceId: "w1", to: "buyer@acme.test", subject: "s", html: "h" });
      expect(res.ok).toBe(true);
      expect(createTransport.mock.calls[0][0]).toMatchObject({
        host: "smtp.gmail.com", port: 587, requireTLS: true, auth: { user: "foundry@gitwork.co.uk", pass: "app-pass" },
      });
      expect(sendMail.mock.calls[0][0].from).toBe('"Gitwork" <foundry@gitwork.co.uk>');
    } finally {
      for (const k of Object.keys(env)) delete process.env[k];
    }
  });

  it("says how to fix it when neither Settings nor the server has email", async () => {
    findUnique.mockResolvedValue({ ...google, emailProvider: null, emailApiKey: null });
    const res = await sendWorkspaceEmail({ workspaceId: "w1", to: "a@b.test", subject: "s", html: "h" });
    expect(res).toEqual({ ok: false, error: expect.stringContaining("Settings") });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("is not used once a provider is chosen in Settings", async () => {
    Object.assign(process.env, env);
    try {
      findUnique.mockResolvedValue(google);
      await sendWorkspaceEmail({ workspaceId: "w1", to: "a@b.test", subject: "s", html: "h" });
      expect(createTransport.mock.calls[0][0]).toMatchObject({ auth: { user: "hello@gitwork.co.uk" } });
    } finally {
      for (const k of Object.keys(env)) delete process.env[k];
    }
  });

  it("needs both a user and a password", () => {
    expect(envSmtp({ SMTP_USER: "a@b.test" })).toBeNull();
    expect(envSmtp({ SMTP_USER: "a@b.test", SMTP_PASSWORD: "p" })).toMatchObject({ from: "a@b.test", port: 587 });
  });
});

describe("the stored SMTP password", () => {
  it("is not kept in plain text", () => {
    const stored = storeSmtpPassword("secret-app-pass");
    expect(stored).not.toContain("secret-app-pass");
    expect(readSmtpPassword(stored)).toBe("secret-app-pass");
  });
});
