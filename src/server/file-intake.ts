/**
 * File Intake & Text Extraction Service.
 *
 * Extracts clean plain text from uploaded reference files (PDF, DOCX, TXT, MD, or raw brief).
 * Used by the AI Document Generation Engine to parse reference materials.
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
 * Extracts readable plain text from a Buffer (PDF, DOCX, TXT, MD) or text brief string.
 */
export function extractIntakeText(input: FileIntakeInput): ExtractedIntakeText {
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
  // 3. PDF files
  else if (lowerName.endsWith(".pdf") || input.mimeType?.includes("pdf")) {
    const str = buf.toString("latin1"); // Preserve PDF binary bytes

    // Extract text inside PDF BT ... ET (Begin Text ... End Text) blocks
    const btBlocks = str.match(/BT[\s\S]*?ET/g);
    if (btBlocks && btBlocks.length > 0) {
      const extractedParts: string[] = [];
      for (const block of btBlocks) {
        // Extract string literals in (text) Tj or [(text)] TJ
        const textMatches = block.match(/\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ/g);
        if (textMatches) {
          for (const tm of textMatches) {
            const inner = tm.replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/^[\(\[]|[\)\]]\s*T[jJ]$/g, "");
            extractedParts.push(inner);
          }
        }
      }
      rawText = extractedParts.join(" ");
    }

    // Fallback if BT ET blocks were encoded or missed
    if (!rawText || rawText.trim().length < 20) {
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
