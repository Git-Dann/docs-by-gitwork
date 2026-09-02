import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

/**
 * Server SMTP Transport for Gitwork Emails (Gmail SMTP).
 * Reads SMTP configuration from environment variables.
 */

export function getSmtpTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || "muhammad.usman@gitwork.co.uk";
  const pass = process.env.SMTP_PASSWORD || "";

  if (!pass) {
    console.warn("[SMTP Warning] SMTP_PASSWORD is not set in .env. Emails may fail to deliver.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: {
      user,
      pass,
    },
  });
}

export interface EmailAttachment {
  filename?: string;
  content?: Buffer | string;
  contentType?: string;
  path?: string;
  cid?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: EmailAttachment[];
}

export async function sendSmtpEmail(options: SendEmailOptions) {
  const transporter = getSmtpTransporter();
  const defaultFrom = process.env.SMTP_FROM || `"Gitwork" <${process.env.SMTP_USER || "muhammad.usman@gitwork.co.uk"}>`;

  const attachments: EmailAttachment[] = [...(options.attachments || [])];

  // Auto-attach Gitwork logo CID inline attachment if referenced in HTML
  if (options.html.includes("cid:gitwork-logo")) {
    const gitworkMark = path.join(process.cwd(), "public", "gitwork-mark.png");
    const foundryMark = path.join(process.cwd(), "public", "foundry-mark.png");
    const logoPath = fs.existsSync(gitworkMark) ? gitworkMark : foundryMark;

    if (fs.existsSync(logoPath)) {
      attachments.push({
        filename: "gitwork-mark.png",
        path: logoPath,
        cid: "gitwork-logo",
      });
    }
  }

  const info = await transporter.sendMail({
    from: options.from || defaultFrom,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments,
  });

  console.log(`[SMTP] Email sent to ${options.to}. MessageId=${info.messageId}`);
  return info;
}
