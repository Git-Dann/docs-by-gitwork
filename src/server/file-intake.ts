/**
 * File Intake & Text Extraction Service.
 *
 * Extracts plain text context from uploaded reference files (PDF, DOCX, TXT, MD, or raw brief).
 * Used by the AI Document Generation Wizard to parse reference materials.
 */

export interface FileIntakeInput {
  filename?: string;
  mimeType?: string;
  buffer?: Buffer;
  textBrief?: string;
}

export interface ExtractedIntakeText {
  filename: string;
  extractedText: string;
  charCount: number;
}

/**
 * Extracts readable plain text from a Buffer or text brief string.
 */
export function extractIntakeText(input: FileIntakeInput): ExtractedIntakeText {
  const filename = input.filename?.trim() || "reference-brief.txt";
  const briefText = input.textBrief?.trim() || "";

  if (!input.buffer || input.buffer.length === 0) {
    return {
      filename,
      extractedText: briefText,
      charCount: briefText.length,
    };
  }

  const buf = input.buffer;
  let rawText = "";

  // 1. Text or Markdown files
  if (
    input.mimeType?.includes("text/") ||
    input.mimeType?.includes("markdown") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".md") ||
    filename.endsWith(".json")
  ) {
    rawText = buf.toString("utf-8");
  } else {
    // 2. Binary files (PDF / DOCX / RTF / generic)
    // Extract printable ASCII/UTF-8 string sequences from the buffer
    const str = buf.toString("utf-8");
    // Strip binary garbage characters while preserving words and punctuation
    const cleanStr = str
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ")
      .replace(/\s+/g, " ");

    // Extract textual blocks
    const matches = cleanStr.match(/[A-Za-z0-9\s.,;:'"!?()\-–—@#&]{4,}/g);
    rawText = matches ? matches.join("\n") : cleanStr;
  }

  // Combine with optional text brief if provided
  const combinedText = [briefText, rawText].filter(Boolean).join("\n\n---\n\n");
  const trimmed = combinedText.trim().slice(0, 30_000); // Cap at 30k chars for LLM safety

  return {
    filename,
    extractedText: trimmed,
    charCount: trimmed.length,
  };
}
