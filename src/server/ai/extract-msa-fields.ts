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

export interface ExtractionHints {
  totalNetValue?: string;
  hasMilestones?: boolean;
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

/** Matches and normalizes a string to strictly one of the 4 allowed Service Tiers. */
function normalizeServiceTier(raw?: string): string {
  if (!raw) return "MVP Sprint";
  const lower = raw.toLowerCase().trim();

  if (lower.includes("launch")) return "Launch Pad";
  if (lower.includes("mvp")) return "MVP Sprint";
  if (lower.includes("greenfield") || lower.includes("build")) return "Greenfield Build";
  if (lower.includes("care") || lower.includes("maintenance") || lower.includes("support")) return "Care Plan";

  // Check direct exact match
  const exact = ALLOWED_SERVICE_TIERS.find((t) => t.toLowerCase() === lower);
  return exact || "MVP Sprint"; // Strict fallback guarantee
}

/**
 * Smart Regex fallback if GROQ_API_KEY is not set or AI fails.
 */
function extractWithRegex(
  docText: string,
  defaultDocNumber?: string,
  hints?: ExtractionHints
): ExtractedMsaFields {
  const result: ExtractedMsaFields = {};

  // 1. SOW Reference
  if (defaultDocNumber) {
    result.sowReference = defaultDocNumber;
  } else {
    const sowMatch = docText.match(/(?:SOW|PROP)[-_\s#]*\d{4}[-_\s#]*\d+/i) || docText.match(/SOW(?:[-_\s#]*\d+|[-_\s#]*[A-Z0-9]+)/i);
    if (sowMatch) {
      result.sowReference = sowMatch[0].trim().replace(/^PROP/i, "SOW");
    }
  }

  // 2. Charges / Total Contract Value
  if (hints?.totalNetValue) {
    result.charges = hints.totalNetValue;
  } else {
    const totalMatch = docText.match(/(?:Total Net Contract Value|Grand Total|Subtotal|Total Value)[^£$€0-9]*([£$€]\s*[\d,]+(?:\.\d{2})?)/i);
    if (totalMatch) {
      result.charges = totalMatch[1].trim();
    } else {
      const chargesMatch = docText.match(/(?:[£$€]\s*[\d,]+(?:\.\d{2})?(?:\s*(?:\/|\s*per\s*)(?:month|mo|quarter|yr|year|milestone))?(?:\s*excl\.?\s*VAT|\s*\+\s*VAT)?)/i);
      if (chargesMatch) result.charges = chargesMatch[0].trim();
    }
  }

  // 3. Payment Schedule
  if (hints?.hasMilestones || /milestone/i.test(docText)) {
    result.paymentSchedule = "Milestone-based";
  } else {
    const scheduleMatch = docText.match(/(?:monthly|quarterly|upfront|in advance|50%\s*upfront)/i);
    if (scheduleMatch) {
      const val = scheduleMatch[0].toLowerCase();
      result.paymentSchedule = val.includes("monthly") ? "Monthly in advance" : val.includes("quarterly") ? "Quarterly" : val.includes("upfront") ? "Upfront" : "Monthly";
    } else {
      result.paymentSchedule = "Monthly in advance";
    }
  }

  // 4. Duration
  const durationMatch = docText.match(/\b(\d+\s*(?:months?|weeks?|years?))\b/i);
  if (durationMatch) result.duration = durationMatch[1].trim();

  // 5. Service Tier: strictly mapped to 1 of 4 allowed options
  const tierMatch = docText.match(/\b(Launch\s*Pad|MVP\s*Sprint|Greenfield\s*Build|Care\s*Plan|MVP|Greenfield|Care|Launch)\b/i);
  result.serviceTier = normalizeServiceTier(tierMatch ? tierMatch[1] : undefined);

  // 6. Target Start Date & Effective Date
  const startDateMatch = docText.match(/(?:start\s*date|commencement\s*date|target\s*start)[^0-9]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/i);
  if (startDateMatch) {
    result.startDate = normalizeDate(startDateMatch[1]);
  }

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
export async function extractMsaFieldsFromText(
  docText: string,
  defaultDocNumber?: string,
  hints?: ExtractionHints
): Promise<ExtractedMsaFields> {
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY);

  if (!hasGroqKey) {
    console.log("GROQ_API_KEY not set. Using smart regex fallback extractor.");
    return extractWithRegex(docText, defaultDocNumber, hints);
  }

  try {
    const prompt = `You are a contract analysis AI. Extract key Master Services Agreement (MSA) engagement details from the provided document text.

CRITICAL INSTRUCTIONS:
1. "serviceTier": MUST be strictly ONE of these 4 exact allowed values (NEVER use any other string):
   - "Launch Pad"
   - "MVP Sprint"
   - "Greenfield Build"
   - "Care Plan"

2. "charges": Extract the TOTAL project contract value / total net budget (e.g. "£32,000"), NOT an individual role line item subtotal.

3. "paymentSchedule": If the document uses milestone payments or lists milestones, return "Milestone-based". Otherwise return the payment structure (e.g. "Monthly in advance").

Return a JSON object strictly matching this schema:
{
  "serviceTier": "Launch Pad" | "MVP Sprint" | "Greenfield Build" | "Care Plan",
  "sowReference": string or null,
  "charges": string or null,
  "paymentSchedule": string or null,
  "startDate": string or null (Format: DD/MM/YYYY),
  "duration": string or null (e.g. "16 weeks"),
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
      serviceTier: extractedTier,
      sowReference: sowRef,
      charges: hints?.totalNetValue || parsed.charges || undefined,
      paymentSchedule: hints?.hasMilestones ? "Milestone-based" : (parsed.paymentSchedule || undefined),
      startDate: normalizeDate(parsed.startDate),
      duration: parsed.duration || undefined,
      effectiveDate: normalizeDate(parsed.effectiveDate),
      publicityConsent: parsed.publicityConsent === "Yes" ? "Yes" : parsed.publicityConsent === "No" ? "No" : undefined,
    };
  } catch (err) {
    console.error("Groq AI extraction failed, using fallback:", err);
    return extractWithRegex(docText, defaultDocNumber, hints);
  }
}
