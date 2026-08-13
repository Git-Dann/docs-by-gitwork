import nodemailer from "nodemailer";

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
  filename: string;
  content: Buffer | string;
  contentType?: string;
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

  const info = await transporter.sendMail({
    from: options.from || defaultFrom,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });

  console.log(`[SMTP] Email sent to ${options.to}. MessageId=${info.messageId}`);
  return info;
}
