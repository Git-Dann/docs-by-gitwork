import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Downloads a file from a URL as a Node.js Buffer.
 */
async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file from ${url}: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Computes the SHA-256 hash of a buffer.
 */
function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export interface DocuSealSubmitterData {
  documents?: { url: string }[];
  document_url?: string;
  audit_log_url?: string;
}

/**
 * Handles archiving a completed DocuSeal submission by storing the direct signed PDF URL,
 * computing SHA-256 hashes for cryptographic integrity, and setting archivedAt in the DB.
 */
export async function archiveDocusealSubmission(
  submissionDbId: string,
  verifiedData: DocuSealSubmitterData | DocuSealSubmitterData[]
) {
  // 1. Fetch local submission
  const submission = await prisma.docusealSubmission.findUnique({
    where: { id: submissionDbId },
    include: { document: true }
  });

  if (!submission) {
    throw new Error(`Submission ${submissionDbId} not found.`);
  }

  // 2. Extract PDF and audit log URLs from DocuSeal API response
  const submitter = Array.isArray(verifiedData) ? verifiedData[0] : verifiedData;
  const pdfUrl = submitter.documents?.[0]?.url || submitter.document_url;
  const auditLogUrl = submitter.audit_log_url;

  if (!pdfUrl) {
    console.warn(`No PDF URL found in DocuSeal response for submission ${submissionDbId}.`);
    return;
  }

  let pdfSha256: string | null = null;
  let auditLogSha256: string | null = null;

  // 3. Attempt downloading to compute sha256 hashes for audit verification
  try {
    const pdfBuffer = await downloadFile(pdfUrl);
    pdfSha256 = computeSha256(pdfBuffer);

    if (auditLogUrl) {
      const auditLogBuffer = await downloadFile(auditLogUrl);
      auditLogSha256 = computeSha256(auditLogBuffer);
    }
  } catch (err) {
    console.warn(`Could not compute hashes for submission ${submissionDbId}:`, err);
  }

  // 4. Update Database with the actual DocuSeal direct PDF URL & hashes
  await prisma.docusealSubmission.update({
    where: { id: submissionDbId },
    data: {
      combinedPdfUrl: pdfUrl,
      auditLogUrl: auditLogUrl || null,
      pdfSha256: pdfSha256,
      auditLogSha256: auditLogSha256,
      archivedAt: new Date(),
    }
  });

  console.log(`Successfully archived submission ${submissionDbId} with direct PDF URL.`);
}
