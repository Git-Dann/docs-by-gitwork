import { callGroqChatCompletion } from "@/lib/groq";

export interface ExtractedMsaFields {
  effectiveDate?: string;    // DD/MM/YYYY
  serviceTier?: string;
  sowReference?: string;
  charges?: string;
  paymentSchedule?: string;
  startDate?: string;        // DD/MM/YYYY
  duration?: string;
  publicityConsent?: "Yes" | "No";
}

/** Convert a YYYY-MM-DD or DD/MM/YYYY string to normalized DD/MM/YYYY. */
function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }

  // DD/MM/YYYY
  const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, d, m, y] = ddmmyyyyMatch;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }

  return trimmed;
}

/**
 * Smart Regex fallback if GROQ_API_KEY is not set.
 */
function extractWithRegex(docText: string): ExtractedMsaFields {
  const result: ExtractedMsaFields = {};

  // SOW Reference: e.g. SOW-2026-003, SOW #123, Ref: SOW-123
  const sowMatch = docText.match(/SOW(?:[-_\s#]*\d+|[-_\s#]*[A-Z0-9]+)/i);
  if (sowMatch) result.sowReference = sowMatch[0].trim();

  // Charges / Fees: e.g. £4,500/month, £5,000 + VAT, $10,000
  const chargesMatch = docText.match(/(?:[£$€]\s*[\d,]+(?:\.\d{2})?(?:\s*(?:\/|\s*per\s*)(?:month|mo|quarter|yr|year|milestone))?(?:\s*excl\.?\s*VAT|\s*\+\s*VAT)?)/i);
  if (chargesMatch) result.charges = chargesMatch[0].trim();

  // Payment Schedule: e.g. Monthly, Quarterly, Milestone, 50% upfront
  const scheduleMatch = docText.match(/(?:monthly|quarterly|milestone(?:-based)?|upfront|in advance|50%\s*upfront)/i);
  if (scheduleMatch) {
    const val = scheduleMatch[0].toLowerCase();
    result.paymentSchedule = val.includes("monthly") ? "Monthly in advance" : val.includes("quarterly") ? "Quarterly" : val.includes("upfront") ? "Upfront" : "Monthly";
  }

  // Duration: e.g. 12 months, 6 months, 1 year
  const durationMatch = docText.match(/\b(\d+\s*(?:months?|years?|weeks?))\b/i);
  if (durationMatch) result.duration = durationMatch[1].trim();

  // Service Tier: e.g. Care Plan, Growth, Enterprise, Maintenance
  const tierMatch = docText.match(/\b(Care\s*Plan|Growth|Enterprise|Starter|Pro|Premium|Handover|Maintenance)\b/i);
  if (tierMatch) result.serviceTier = tierMatch[1].trim();

  // Dates (find dates in text)
  const dateMatches = docText.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g);
  if (dateMatches && dateMatches.length > 0) {
    result.effectiveDate = normalizeDate(dateMatches[0]);
    if (dateMatches.length > 1) {
      result.startDate = normalizeDate(dateMatches[1]);
    }
  }

  return result;
}

/**
 * Extracts MSA Pre-Flight fields from document text using Groq Llama-3 / OpenAI-OSS AI model,
 * with graceful fallback to regex pattern matching if GROQ_API_KEY is not configured.
 */
export async function extractMsaFieldsFromText(docText: string): Promise<ExtractedMsaFields> {
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY);

  if (!hasGroqKey) {
    console.log("GROQ_API_KEY not set. Using smart regex fallback extractor.");
    return extractWithRegex(docText);
  }

  try {
    const prompt = `You are a contract analysis AI. Extract key Master Services Agreement (MSA) engagement details from the provided document text.

Return a JSON object strictly matching this schema:
{
  "serviceTier": string or null (e.g. "Care Plan", "Growth", "Enterprise"),
  "sowReference": string or null (e.g. "SOW-2026-003"),
  "charges": string or null (e.g. "£4,500/month excl. VAT"),
  "paymentSchedule": string or null (e.g. "Monthly in advance"),
  "startDate": string or null (Format: DD/MM/YYYY),
  "duration": string or null (e.g. "12 months"),
  "effectiveDate": string or null (Format: DD/MM/YYYY),
  "publicityConsent": "Yes" | "No" or null
}

Document Text:
"""
${docText.slice(0, 12000)}
"""`;

    const rawJson = await callGroqChatCompletion(
      [
        { role: "system", content: "You extract structured contract fields into JSON format accurately." },
        { role: "user", content: prompt },
      ],
      { jsonMode: true, temperature: 0.1 }
    );

    const parsed = JSON.parse(rawJson);

    return {
      serviceTier: parsed.serviceTier || undefined,
      sowReference: parsed.sowReference || undefined,
      charges: parsed.charges || undefined,
      paymentSchedule: parsed.paymentSchedule || undefined,
      startDate: normalizeDate(parsed.startDate),
      duration: parsed.duration || undefined,
      effectiveDate: normalizeDate(parsed.effectiveDate),
      publicityConsent: parsed.publicityConsent === "Yes" ? "Yes" : parsed.publicityConsent === "No" ? "No" : undefined,
    };
  } catch (err) {
    console.error("Groq AI extraction failed, using fallback:", err);
    return extractWithRegex(docText);
  }
}
