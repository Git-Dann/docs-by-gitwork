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

const ALLOWED_SERVICE_TIERS = [
  "Launch Pad",
  "MVP Sprint",
  "Greenfield Build",
  "Care Plan",
] as const;

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

/** Matches and normalizes a string to one of the 4 allowed Service Tiers. */
function normalizeServiceTier(raw?: string): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().trim();

  if (lower.includes("launch")) return "Launch Pad";
  if (lower.includes("mvp")) return "MVP Sprint";
  if (lower.includes("greenfield") || lower.includes("build")) return "Greenfield Build";
  if (lower.includes("care") || lower.includes("maintenance") || lower.includes("support")) return "Care Plan";

  // Check direct exact match
  const exact = ALLOWED_SERVICE_TIERS.find((t) => t.toLowerCase() === lower);
  return exact || raw;
}

/**
 * Smart Regex fallback if GROQ_API_KEY is not set or AI fails.
 */
function extractWithRegex(docText: string, defaultDocNumber?: string): ExtractedMsaFields {
  const result: ExtractedMsaFields = {};

  // SOW Reference: e.g. SOW-2026-007 (https://staging.foundry.gitwork.tech/docs/...)
  if (defaultDocNumber) {
    result.sowReference = defaultDocNumber;
  } else {
    const sowMatch = docText.match(/(?:SOW|PROP)[-_\s#]*\d{4}[-_\s#]*\d+/i) || docText.match(/SOW(?:[-_\s#]*\d+|[-_\s#]*[A-Z0-9]+)/i);
    if (sowMatch) {
      result.sowReference = sowMatch[0].trim().replace(/^PROP/i, "SOW");
    }
  }

  // Charges / Fees: e.g. £4,500/month, £5,000 + VAT, $10,000
  const chargesMatch = docText.match(/(?:[£$€]\s*[\d,]+(?:\.\d{2})?(?:\s*(?:\/|\s*per\s*)(?:month|mo|quarter|yr|year|milestone))?(?:\s*excl\.?\s*VAT|\s*\+\s*VAT)?)/i);
  if (chargesMatch) result.charges = chargesMatch[0].trim();

  // Payment Schedule: e.g. Monthly, Quarterly, Milestone, 50% upfront
  const scheduleMatch = docText.match(/(?:monthly|quarterly|milestone(?:-based)?|upfront|in advance|50%\s*upfront)/i);
  if (scheduleMatch) {
    const val = scheduleMatch[0].toLowerCase();
    result.paymentSchedule = val.includes("monthly") ? "Monthly in advance" : val.includes("quarterly") ? "Quarterly" : val.includes("upfront") ? "Upfront" : "Monthly";
  }

  // Duration: e.g. 12 months, 16 weeks, 6 months
  const durationMatch = docText.match(/\b(\d+\s*(?:months?|weeks?|years?))\b/i);
  if (durationMatch) result.duration = durationMatch[1].trim();

  // Service Tier: strictly mapped to Launch Pad, MVP Sprint, Greenfield Build, Care Plan
  const tierMatch = docText.match(/\b(Launch\s*Pad|MVP\s*Sprint|Greenfield\s*Build|Care\s*Plan|Handover|Maintenance|Growth|Care)\b/i);
  if (tierMatch) {
    result.serviceTier = normalizeServiceTier(tierMatch[1]);
  } else {
    result.serviceTier = "Launch Pad"; // Default fallback tier
  }

  // Target Start Date extraction
  const startDateMatch = docText.match(/(?:start\s*date|commencement\s*date|target\s*start)[^0-9]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i);
  if (startDateMatch) {
    result.startDate = normalizeDate(startDateMatch[1]);
  }

  // Dates (find dates in text)
  const dateMatches = docText.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g);
  if (dateMatches && dateMatches.length > 0) {
    if (!result.effectiveDate) result.effectiveDate = normalizeDate(dateMatches[0]);
    if (!result.startDate && dateMatches.length > 1) {
      result.startDate = normalizeDate(dateMatches[1]);
    }
  }

  return result;
}

/**
 * Extracts MSA Pre-Flight fields from document text using Groq Llama-3 / OpenAI-OSS AI model,
 * with graceful fallback to regex pattern matching if GROQ_API_KEY is not configured.
 */
export async function extractMsaFieldsFromText(docText: string, defaultDocNumber?: string): Promise<ExtractedMsaFields> {
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY);

  if (!hasGroqKey) {
    console.log("GROQ_API_KEY not set. Using smart regex fallback extractor.");
    return extractWithRegex(docText, defaultDocNumber);
  }

  try {
    const prompt = `You are a contract analysis AI. Extract key Master Services Agreement (MSA) engagement details from the provided document text.

CRITICAL INSTRUCTIONS FOR "serviceTier":
You MUST select the single best matching service tier from ONLY these 4 exact allowed values:
1. "Launch Pad"
2. "MVP Sprint"
3. "Greenfield Build"
4. "Care Plan"

Return a JSON object strictly matching this schema:
{
  "serviceTier": "Launch Pad" | "MVP Sprint" | "Greenfield Build" | "Care Plan",
  "sowReference": string or null (e.g. "SOW-2026-007" or document ref),
  "charges": string or null (e.g. "£4,500/month excl. VAT"),
  "paymentSchedule": string or null (e.g. "Monthly in advance"),
  "startDate": string or null (Format: DD/MM/YYYY - Target start date or commencement date),
  "duration": string or null (e.g. "12 months" or "16 weeks"),
  "effectiveDate": string or null (Format: DD/MM/YYYY),
  "publicityConsent": "Yes" | "No" or null
}

Document Text:
"""
${docText.slice(0, 14000)}
"""`;

    const rawJson = await callGroqChatCompletion(
      [
        { role: "system", content: "You extract structured contract fields into JSON format accurately." },
        { role: "user", content: prompt },
      ],
      { jsonMode: true, temperature: 0.1 }
    );

    const parsed = JSON.parse(rawJson);
    const extractedTier = normalizeServiceTier(parsed.serviceTier);

    const sowRef = defaultDocNumber || parsed.sowReference || undefined;

    return {
      serviceTier: extractedTier || "Launch Pad",
      sowReference: sowRef,
      charges: parsed.charges || undefined,
      paymentSchedule: parsed.paymentSchedule || undefined,
      startDate: normalizeDate(parsed.startDate),
      duration: parsed.duration || undefined,
      effectiveDate: normalizeDate(parsed.effectiveDate),
      publicityConsent: parsed.publicityConsent === "Yes" ? "Yes" : parsed.publicityConsent === "No" ? "No" : undefined,
    };
  } catch (err) {
    console.error("Groq AI extraction failed, using fallback:", err);
    return extractWithRegex(docText, defaultDocNumber);
  }
}
