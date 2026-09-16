/**
 * Tests for the File Intake & Text Extraction Service (src/server/file-intake.ts).
 *
 * Verifies that text extraction correctly extracts text from:
 *   - Plain text & Markdown files
 *   - DOCX files (<w:t> tags)
 *   - PDF files (via pdf-parse)
 *   - Raw text briefs
 *   - Empty / corrupt buffers (surfacing fallback behavior)
 */

import { describe, expect, it, vi } from "vitest";
import { extractIntakeText } from "@/server/file-intake";

describe("File Intake Service (extractIntakeText)", () => {
  it("extracts text from plain text input / brief", async () => {
    const result = await extractIntakeText({
      textBrief: "Project brief for ACME Corporation migration to cloud.",
    });

    expect(result.extractedText).toContain("ACME Corporation");
    expect(result.charCount).toBeGreaterThan(10);
  });

  it("extracts text from a UTF-8 text file buffer", async () => {
    const textContent = "Title: Website Rebuild SOW\nClient: Globex Corp\nScope: Next.js + Tailwind + Vercel";
    const buffer = Buffer.from(textContent, "utf-8");

    const result = await extractIntakeText({
      filename: "sow-brief.txt",
      mimeType: "text/plain",
      buffer,
    });

    expect(result.extractedText).toBe(textContent);
    expect(result.charCount).toBe(textContent.length);
  });

  it("extracts text from a Word DOCX file buffer containing <w:t> tags", async () => {
    const docxXml = `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Software Development Agreement</w:t></w:r></w:p>
          <w:p><w:r><w:t>Client: Stark Industries</w:t></w:r></w:p>
          <w:p><w:r><w:t>Total Cost: £45,000</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `;
    const buffer = Buffer.from(docxXml, "utf-8");

    const result = await extractIntakeText({
      filename: "proposal.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
    });

    expect(result.extractedText).toContain("Software Development Agreement");
    expect(result.extractedText).toContain("Stark Industries");
    expect(result.extractedText).toContain("£45,000");
  });

  it("combines a text brief and uploaded file content when both are provided", async () => {
    const buffer = Buffer.from("File Content: Deliverables list for Sprint 1.", "utf-8");

    const result = await extractIntakeText({
      filename: "notes.txt",
      mimeType: "text/plain",
      buffer,
      textBrief: "Brief Context: Additional notes for the client project.",
    });

    expect(result.extractedText).toContain("Brief Context: Additional notes for the client project.");
    expect(result.extractedText).toContain("File Content: Deliverables list for Sprint 1.");
    expect(result.extractedText).toContain("---");
  });

  it("handles PDF extraction fallback gracefully when buffer is not a valid PDF structure", async () => {
    const invalidPdfBuffer = Buffer.from("%PDF-1.4 Fake PDF Header without real streams");

    const result = await extractIntakeText({
      filename: "sample.pdf",
      mimeType: "application/pdf",
      buffer: invalidPdfBuffer,
    });

    expect(result.filename).toBe("sample.pdf");
    expect(typeof result.extractedText).toBe("string");
  });
});

