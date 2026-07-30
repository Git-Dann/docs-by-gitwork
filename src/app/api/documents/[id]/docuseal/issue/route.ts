import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertCan, canShareDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";

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
    if (!document.client) return apiError("Document must be assigned to a client to issue an MSA", 400);
    // Let's allow PROPOSAL and MSA types to be flexible
    if (document.documentType !== "MSA" && document.documentType !== "PROPOSAL") {
      return apiError("This document type is not supported for DocuSeal right now", 400);
    }

    const client = document.client;

    // 3. Extract required DocuSeal payload data
    const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY;
    if (!DOCUSEAL_API_KEY) return apiError("DocuSeal integration is not configured", 500);

    // We assume the template ID is stored in env, or hardcoded for the MSA
    const MSA_TEMPLATE_ID = process.env.DOCUSEAL_MSA_TEMPLATE_ID;
    if (!MSA_TEMPLATE_ID) return apiError("DocuSeal MSA template ID is not configured", 500);

    // Build the registered office string
    const officeParts = [client.addressLine1, client.city, client.county, client.postcode, client.country].filter(Boolean);
    const registeredOffice = officeParts.length > 0 ? officeParts.join(", ") : "N/A";

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
            client_registered_office: registeredOffice,
            client_contact_name: client.primaryContactName || client.name,
            client_notices_email: client.primaryContactEmail || "client@example.com",
            effective_date: new Date().toLocaleDateString("en-GB"), // DD/MM/YYYY
            agreement_ref: document.documentNumber || document.id,
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
            { name: "publicity_consent", required: true }
          ]
        },
        {
          role: "Gitwork",
          name: user?.name || "Gitwork Admin",
          email: user?.email || "muhammad.usman@gitwork.co.uk",
          external_id: `${document.id}:gitwork`,
          send_email: true
        }
      ]
    };

    // 4. Call DocuSeal API
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

    // 5. Store in Database
    const docusealSubmission = await prisma.docusealSubmission.create({
      data: {
        documentId: document.id,
        submissionId: clientSubmitter.submission_id,
        slug: clientSubmitter.slug || "",
        gitworkSlug: gitworkSubmitter?.slug,
        status: "PENDING"
      }
    });

    // 6. Return the slug and wiki details back to the frontend
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
