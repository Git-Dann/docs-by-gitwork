import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertCan, canShareDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";

import { enableDocumentShare } from "@/server/documents";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 1. Authorize user
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canShareDocs, "issue DocuSeal MSA");

    const { id } = await context.params;
    if (!id) return apiError("Missing document id", 400);

    // 2. Fetch Document and Client details
    const document = await prisma.document.findUnique({
      where: { id },
      include: { client: { include: { wiki: true } } },
    });

    if (!document) return apiError("Document not found", 404);

    // Ensure proposal sharing is active so client can access the public link
    await enableDocumentShare(document.id);
    if (!document.client) return apiError("Document must be assigned to a client to issue an MSA", 400);
    // Let's allow PROPOSAL and MSA types to be flexible
    if (document.documentType !== "MSA" && document.documentType !== "PROPOSAL") {
      return apiError("This document type is not supported for DocuSeal right now", 400);
    }

    const client = document.client;

    // 3. Extract required DocuSeal payload data
    const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY;
    if (!DOCUSEAL_API_KEY) return apiError("DocuSeal integration is not configured", 500);

    const MSA_TEMPLATE_ID = process.env.DOCUSEAL_MSA_TEMPLATE_ID;
    if (!MSA_TEMPLATE_ID) return apiError("DocuSeal MSA template ID is not configured", 500);

    // Build the registered office string (fallback if billingAddressLine1 is missing)
    const officeParts = [client.addressLine1, client.city, client.county, client.postcode, client.country].filter(Boolean);
    const registeredOffice = officeParts.length > 0 ? officeParts.join(", ") : "N/A";

    // 4. Read pre-flight fields from the request body (collected via the modal)
    interface PreflightBody {
      effectiveDate?: string;       // DD/MM/YYYY — admin picks any date
      serviceTier?: string;
      sowReference?: string;
      charges?: string;
      paymentSchedule?: string;
      startDate?: string;           // DD/MM/YYYY
      duration?: string;
      publicityConsent?: "Yes" | "No";
    }
    const body: PreflightBody = await request.json().catch(() => ({}));

    // Fallback: effective_date defaults to today if not provided
    const effectiveDate =
      body.effectiveDate || new Date().toLocaleDateString("en-GB"); // DD/MM/YYYY

    // Helper to ensure any URL inside a text string (e.g. sowReference) has spaces URL-encoded as %20
    function encodeUrlInText(text?: string): string {
      if (!text) return "";
      let formatted = text.replace(/\((https?:\/\/[^\)]+)\)/gi, (_match, urlInside: string) => {
        const fixedUrl = urlInside.replace(/\s+/g, "%20");
        return `(${fixedUrl})`;
      });
      formatted = formatted.replace(/(https?:\/\/[^\s\)]+)/gi, (url: string) => {
        return url.replace(/\s+/g, "%20");
      });
      return formatted;
    }

    const sowReference = encodeUrlInText(body.sowReference ?? "");

    // 5. Persist these details into document.metadata.msaDetails so the modal
    //    is pre-filled on the next visit (no schema migration required — metadata is Json?).
    const existingMeta = (document.metadata as Record<string, unknown>) ?? {};
    await prisma.document.update({
      where: { id },
      data: {
        metadata: {
          ...existingMeta,
          msaDetails: {
            effectiveDate,
            serviceTier: body.serviceTier ?? "",
            sowReference,
            charges: body.charges ?? "",
            paymentSchedule: body.paymentSchedule ?? "",
            startDate: body.startDate ?? "",
            duration: body.duration ?? "",
            publicityConsent: body.publicityConsent ?? "No",
          },
        },
      },
    });

    // 6. Build DocuSeal payload
    const payload = {
      template_id: parseInt(MSA_TEMPLATE_ID, 10),
      send_email: false, // Foundry handles the emails via mailto:
      order: "preserved", // Client signs first, then Gitwork
      external_id: document.id,
      submitters: [
        {
          role: "Client",
          name: client.primaryContactName || client.name,
          email: client.primaryContactEmail || "client@example.com",
          external_id: `${document.id}:client`,
          send_email: false,
          values: {
            client_legal_name: client.legalCompanyName || client.name,
            client_company_no: client.companyNumber || "N/A",
            client_registered_office: client.billingAddressLine1 || registeredOffice,
            client_contact_name: client.primaryContactName || client.name,
            client_notices_email: client.primaryContactEmail || "client@example.com",
            effective_date: effectiveDate,
            agreement_ref: document.documentNumber,
            // Pre-flight fields supplied by the admin via modal
            service_tier: body.serviceTier ?? "",
            sow_reference: sowReference,
            charges: body.charges ?? "",
            payment_schedule: body.paymentSchedule ?? "",
            start_date: body.startDate ?? "",
            duration: body.duration ?? "",
            // Admin pre-sets publicity consent — locked for the client
            publicity_consent: body.publicityConsent ?? "No",
          },
          fields: [
            { name: "client_legal_name", readonly: true },
            { name: "client_company_no", readonly: true },
            { name: "client_registered_office", readonly: true },
            { name: "effective_date", readonly: true },
            { name: "agreement_ref", readonly: true },
            { name: "service_tier", readonly: true },
            { name: "sow_reference", readonly: true },
            { name: "charges", readonly: true },
            { name: "payment_schedule", readonly: true },
            { name: "start_date", readonly: true },
            { name: "duration", readonly: true },
            { name: "publicity_consent", readonly: true },
          ]
        },
        {
          role: "Gitwork",
          name: user?.name || "Gitwork Admin",
          email: user?.email || process.env.GITWORK_ADMIN_EMAIL || "muhammad.usman@gitwork.co.uk",
          external_id: `${document.id}:gitwork`,
          send_email: true
        }
      ]
    };

    // 7. Call DocuSeal API
    const response = await fetch("https://api.docuseal.com/submissions", {
      method: "POST",
      headers: {
        "X-Auth-Token": DOCUSEAL_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DocuSeal API Error:", response.status, errorText);
      return apiError(`DocuSeal API Error: ${response.statusText}`, 502);
    }

    interface DocuSealSubmitterResponse {
      role: string;
      submission_id?: number;
      slug?: string;
    }
    const submitters = (await response.json()) as DocuSealSubmitterResponse[];

    const clientSubmitter = submitters.find((s) => s.role === "Client");
    const gitworkSubmitter = submitters.find((s) => s.role === "Gitwork");

    if (!clientSubmitter || !clientSubmitter.submission_id) {
      return apiError("Invalid response from DocuSeal API", 502);
    }

    // 8. Store in Database
    const docusealSubmission = await prisma.docusealSubmission.upsert({
      where: { documentId: document.id },
      create: {
        documentId: document.id,
        submissionId: clientSubmitter.submission_id,
        slug: clientSubmitter.slug || "",
        gitworkSlug: gitworkSubmitter?.slug,
        status: "PENDING",
      },
      update: {
        submissionId: clientSubmitter.submission_id,
        slug: clientSubmitter.slug || "",
        gitworkSlug: gitworkSubmitter?.slug,
        status: "PENDING",
        combinedPdfUrl: null,
        auditLogUrl: null,
        archivedAt: null,
      },
    });

    // 9. Return the slug and wiki details back to the frontend
    const wiki = document.client.wiki;
    return apiOk({
      submissionId: docusealSubmission.submissionId,
      clientSlug: docusealSubmission.slug,
      wikiSlug: document.client.slug,
      wikiToken: wiki?.courseIngestToken,
      message: "DocuSeal submission created successfully."
    });

  } catch (error) {
    return fromError(error);
  }
}
