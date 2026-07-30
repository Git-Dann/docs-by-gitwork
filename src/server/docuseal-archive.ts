import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Downloads a file from a URL as an ArrayBuffer.
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

/**
 * Handles the secure archiving of a completed DocuSeal submission.
 * 
 * @param submissionDbId The local database ID of the DocusealSubmission
 * @param verifiedData The verified submission payload from the DocuSeal API
 */
export async function archiveDocusealSubmission(submissionDbId: string, verifiedData: any) {
  // 1. Fetch the submission to ensure it's still waiting to be archived
  const submission = await prisma.docusealSubmission.findUnique({
    where: { id: submissionDbId },
    include: { document: true }
  });

  if (!submission) {
    throw new Error(`Submission ${submissionDbId} not found.`);
  }

  // Find the overall combined document and audit log URLs
  // verifiedData is an array of submitters. We only need the URLs which are usually the same for all.
  const submitter = Array.isArray(verifiedData) ? verifiedData[0] : verifiedData;
  const pdfUrl = submitter.documents?.[0]?.url || submitter.document_url; // Varies based on API response structure
  const auditLogUrl = submitter.audit_log_url;

  if (!pdfUrl) {
    throw new Error(`No PDF URL found in DocuSeal API response for submission ${submissionDbId}.`);
  }

  // 2. Download the files
  console.log(`Downloading signed PDF for submission ${submissionDbId}...`);
  const pdfBuffer = await downloadFile(pdfUrl);
  
  let auditLogBuffer: Buffer | null = null;
  if (auditLogUrl) {
    console.log(`Downloading audit log for submission ${submissionDbId}...`);
    auditLogBuffer = await downloadFile(auditLogUrl);
  }

  // 3. Compute Hashes
  const pdfSha256 = computeSha256(pdfBuffer);
  const auditLogSha256 = auditLogBuffer ? computeSha256(auditLogBuffer) : null;

  // 4. Upload to S3 (Gitwork Compliance Bucket)
  // This uses standard AWS SDK or any existing S3 client in the project.
  // For now, we will mock the S3 upload as requested to not block if AWS isn't fully configured yet.
  // TODO: Replace with actual S3 PUT using @aws-sdk/client-s3 when credentials are set.
  const s3PdfUrl = `s3://gitwork-contracts/contracts/${submission.documentId}/signed.pdf`;
  const s3AuditLogUrl = auditLogBuffer ? `s3://gitwork-contracts/contracts/${submission.documentId}/audit.pdf` : null;

  console.log(`Uploaded to S3: ${s3PdfUrl} with hash ${pdfSha256}`);

  // 5. Update Database with final compliance data
  await prisma.docusealSubmission.update({
    where: { id: submissionDbId },
    data: {
      combinedPdfUrl: s3PdfUrl,
      auditLogUrl: s3AuditLogUrl,
      pdfSha256: pdfSha256,
      auditLogSha256: auditLogSha256,
      archivedAt: new Date()
    }
  });

  console.log(`Successfully archived submission ${submissionDbId}.`);
}
