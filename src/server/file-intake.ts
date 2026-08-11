/**
 * File Intake & Text Extraction Service.
 *
 * Extracts clean plain text from uploaded reference files (PDF, DOCX, TXT, MD, or raw brief).
 * Used by the AI Document Generation Engine to parse reference materials.
 */

import { PDFParse } from "pdf-parse";

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
 * Extracts readable plain text from a Buffer (PDF, DOCX, TXT, MD) or text brief string.
 */
export async function extractIntakeText(input: FileIntakeInput): Promise<ExtractedIntakeText> {
  const filename = input.filename?.trim() || "reference-brief.txt";
  const briefText = input.textBrief?.trim() || "";
  const lowerName = filename.toLowerCase();

  if (!input.buffer || input.buffer.length === 0) {
    return {
      filename,
      extractedText: briefText,
      charCount: briefText.length,
    };
  }

  const buf = input.buffer;
  let rawText = "";

  // 1. Text / Markdown / JSON / Plain Text
  if (
    input.mimeType?.includes("text/") ||
    input.mimeType?.includes("markdown") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".json")
  ) {
    rawText = buf.toString("utf-8");
  }
  // 2. Word DOCX files (Zip container holding word/document.xml)
  else if (lowerName.endsWith(".docx") || input.mimeType?.includes("officedocument.wordprocessingml")) {
    const str = buf.toString("utf-8");
    // Extract text inside Word XML tags <w:t>text</w:t>
    const matches = str.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
    if (matches && matches.length > 0) {
      rawText = matches.map((m) => m.replace(/<[^>]+>/g, "")).join(" ");
    } else {
      // Fallback text extraction
      const clean = str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const words = clean.match(/[A-Za-z0-9\s.,;:'"!?()\-–—@#&]{4,}/g);
      rawText = words ? words.join("\n") : clean;
    }
  }
  // 3. PDF files (using pdf-parse for stream decompression and font decoding)
  else if (lowerName.endsWith(".pdf") || input.mimeType?.includes("pdf")) {
    try {
      const parser = new PDFParse({ data: buf });
      const parsed = await parser.getText();
      rawText = parsed.text || "";
      await parser.destroy();
    } catch (err) {
      console.warn(`[File Intake] pdf-parse failed for ${filename}, attempting raw fallback:`, err);
      // Fallback in case of corrupted or password-protected PDF structures
      const str = buf.toString("latin1");
      const cleanStr = str.replace(/[\x00-\x1F\x7F-\xFF]/g, " ").replace(/\s+/g, " ");
      const matches = cleanStr.match(/[A-Za-z0-9\s.,;:'"!?()\-–—@#&]{4,}/g);
      rawText = matches ? matches.join("\n") : cleanStr;
    }
  }
  // 4. Generic fallback
  else {
    const str = buf.toString("utf-8");
    const cleanStr = str.replace(/[\x00-\x1F\x7F-\xFF]/g, " ").replace(/\s+/g, " ");
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

