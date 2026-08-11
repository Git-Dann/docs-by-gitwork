/**
 * DocuSeal API integration module.
 *
 * Interacts with DocuSeal cloud (https://api.docuseal.com) or self-hosted DocuSeal instance.
 * Reads config from process.env.DOCUSEAL_API_KEY and process.env.DOCUSEAL_URL.
 */

export interface DocuSealSubmitterInput {
  name: string;
  email: string;
  role: "gitwork" | "client" | string;
  variableName?: string;
  fields?: Array<{
    name: string;
    type: string;
    required?: boolean;
  }>;
}

export interface CreateDocuSealSubmissionInput {
  title: string;
  html?: string;
  pdfBase64?: string;
  pdfUrl?: string;
  templateId?: string | number;
  submitters: DocuSealSubmitterInput[];
}

export interface DocuSealSubmitterResult {
  id: number | string;
  slug: string;
  embed_src: string;
  role: string;
  email: string;
  name: string;
  status: string;
}

export interface DocuSealSubmissionResult {
  id: number | string;
  name: string;
  submitters: DocuSealSubmitterResult[];
}

export function getDocuSealConfig() {
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim() || "";
  const rawUrl = process.env.DOCUSEAL_URL?.trim() || "https://api.docuseal.com";
  let baseUrl = rawUrl.replace(/\/+$/, "");

  // Normalize common URLs
  if (baseUrl === "https://docuseal.com" || baseUrl === "https://docuseal.co") {
    baseUrl = "https://api.docuseal.com";
  }

  const defaultTemplateId = process.env.DOCUSEAL_TEMPLATE_ID?.trim() || "";
  const webhookUrl =
    process.env.DOCUSEAL_WEBHOOK_URL?.trim() ||
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/webhooks/docuseal`
      : process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/+$/, "")}/api/webhooks/docuseal`
      : undefined);

  return { apiKey, baseUrl, defaultTemplateId, webhookUrl };
}

/**
 * Creates a submission on DocuSeal API using PDF base64 or HTML.
 * If DOCUSEAL_API_KEY is omitted or blank (e.g. offline dev/testing mode),
 * generates local fallback mock submitter tokens so the embedded staging UI remains fully functional.
 */
export async function createDocuSealSubmission(
  input: CreateDocuSealSubmissionInput,
): Promise<DocuSealSubmissionResult> {
  const { apiKey, baseUrl, defaultTemplateId, webhookUrl } = getDocuSealConfig();

  const formattedSubmitters = input.submitters.map((s) => {
    const defaultVarName = s.role === "gitwork" ? "gitwork_signature" : "client_signature";
    const varName = s.variableName?.trim() || defaultVarName;
    return {
      name: s.name.trim(),
      email: s.email.trim().toLowerCase(),
      role: s.role.trim().toLowerCase(),
      fields: s.fields ?? [
        {
          name: varName,
          type: "signature",
          required: true,
        },
      ],
    };
  });

  // Ensure gitwork submitters are placed first so DocuSeal sequential ordering has Gitwork sign first
  formattedSubmitters.sort((a, b) => {
    const aIsGitwork = a.role.startsWith("gitwork");
    const bIsGitwork = b.role.startsWith("gitwork");
    if (aIsGitwork && !bIsGitwork) return -1;
    if (!aIsGitwork && bIsGitwork) return 1;
    return 0;
  });

  // Offline / fallback mode if no external API key is set
  if (!apiKey) {
    const mockSubmissionId = `mock_ds_${Date.now()}`;
    return {
      id: mockSubmissionId,
      name: input.title,
      submitters: formattedSubmitters.map((s, index) => {
        const mockSlug = `ds_slug_${s.role}_${Date.now()}_${index}`;
        return {
          id: `sub_${Date.now()}_${index}`,
          slug: mockSlug,
          embed_src: `${baseUrl}/s/${mockSlug}`,
          role: s.role,
          email: s.email,
          name: s.name,
          status: "pending",
        };
      }),
    };
  }

  // Determine template ID:
  // 1) Explicit input templateId or DOCUSEAL_TEMPLATE_ID from env
  // 2) PDF template creation via POST /templates/pdf
  // 3) Or HTML template creation via POST /templates/html
  let targetTemplateId: string | number | undefined =
    input.templateId ?? (defaultTemplateId || undefined);

  if (!targetTemplateId && input.pdfBase64) {
    const base64File = input.pdfBase64.startsWith("data:")
      ? input.pdfBase64
      : `data:application/pdf;base64,${input.pdfBase64}`;

    const templateFields = formattedSubmitters.flatMap((s) =>
      s.fields.map((f) => ({
        name: f.name,
        type: f.type || "signature",
        role: s.role,
        required: f.required ?? true,
      })),
    );

    // PDF template creation
    let pdfRes = await fetch(`${baseUrl}/templates/pdf`, {
      method: "POST",
      headers: {
        "X-Auth-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.title,
        documents: [
          {
            name: `${input.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
            file: base64File,
            fields: templateFields,
          },
        ],
        fields: templateFields,
      }),
    });

    if (!pdfRes.ok && pdfRes.status === 404) {
      pdfRes = await fetch(`${baseUrl}/templates`, {
        method: "POST",
        headers: {
          "X-Auth-Token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: input.title,
          documents: [
            {
              name: `${input.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
              file: base64File,
              fields: templateFields,
            },
          ],
          fields: templateFields,
        }),
      });
    }

    if (pdfRes.ok) {
      const pdfJson = await pdfRes.json();
      targetTemplateId = pdfJson.id ?? pdfJson.template_id;
    }
  }

  // Fallback to HTML template creation if PDF creation wasn't used or failed
  if (!targetTemplateId) {
    let htmlContent = input.html || `<h1>${input.title}</h1><p>Document generated by Gitwork</p>`;

    // Ensure HTML contains at least one field tag {{role:signature:name}} for DocuSeal parsing
    if (!/\{\{.*\}\}/.test(htmlContent)) {
      const fieldTagsHtml = formattedSubmitters
        .map(
          (s) =>
            `<div style="margin-top:20px;"><p><strong>${s.name} (${s.role.toUpperCase()})</strong></p><p>{{${s.role}:signature:${s.fields[0]?.name || "signature"}}}</p></div>`,
        )
        .join("");
      htmlContent += `<div style="margin-top:40px;border-top:1px solid #ccc;padding-top:20px;"><h2>Signatures</h2>${fieldTagsHtml}</div>`;
    }

    let tplRes = await fetch(`${baseUrl}/templates/html`, {
      method: "POST",
      headers: {
        "X-Auth-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.title,
        html: htmlContent,
      }),
    });

    if (!tplRes.ok && tplRes.status === 404) {
      tplRes = await fetch(`${baseUrl}/templates`, {
        method: "POST",
        headers: {
          "X-Auth-Token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: input.title,
          documents: [
            {
              name: `${input.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.html`,
              html: htmlContent,
            },
          ],
        }),
      });
    }

    const tplJson = await tplRes.json();

    if (!tplRes.ok) {
      const errorMsg =
        typeof tplJson?.error === "string"
          ? tplJson.error
          : Array.isArray(tplJson?.errors)
          ? tplJson.errors.join(", ")
          : `DocuSeal Template Creation failed (${tplRes.status})`;
      throw new Error(`DocuSeal Template Error: ${errorMsg}`);
    }

    targetTemplateId = tplJson.id ?? tplJson.template_id;
  }

  if (!targetTemplateId) {
    throw new Error("DocuSeal Template Error: Unable to obtain valid template ID from DocuSeal API.");
  }

  // Create submission using template_id
  const subPayload: Record<string, unknown> = {
    template_id: Number(targetTemplateId) || targetTemplateId,
    submitters: formattedSubmitters,
  };

  if (webhookUrl) {
    subPayload.webhook_url = webhookUrl;
  }

  const res = await fetch(`${baseUrl}/submissions`, {
    method: "POST",
    headers: {
      "X-Auth-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subPayload),
  });

  const json = await res.json();

  if (!res.ok) {
    const errorMsg =
      typeof json?.error === "string"
        ? json.error
        : Array.isArray(json?.errors)
        ? json.errors.join(", ")
        : `DocuSeal API request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  const rawSubmitters = Array.isArray(json)
    ? json
    : Array.isArray(json.submitters)
    ? json.submitters
    : [json];

  return {
    id: json.id ?? json.submission_id ?? (rawSubmitters[0] as { submission_id?: string })?.submission_id ?? `ds_${Date.now()}`,
    name: input.title,
    submitters: rawSubmitters.map((sub: Record<string, unknown>) => {
      const slug = String(sub.slug ?? sub.id ?? "");
      const embedSrc = String(sub.embed_src ?? `${baseUrl}/s/${slug}`);
      return {
        id: String(sub.id ?? ""),
        slug,
        embed_src: embedSrc,
        role: String(sub.role ?? "client"),
        email: String(sub.email ?? ""),
        name: String(sub.name ?? ""),
        status: String(sub.status ?? "pending"),
      };
    }),
  };
}
