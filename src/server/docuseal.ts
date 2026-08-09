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
  pdfUrl?: string;
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
  const baseUrl = rawUrl.replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

/**
 * Creates a submission on DocuSeal API.
 * If DOCUSEAL_API_KEY is omitted or blank (e.g. offline dev/testing mode),
 * generates local fallback mock submitter tokens so the embedded staging UI remains fully functional.
 */
export async function createDocuSealSubmission(
  input: CreateDocuSealSubmissionInput,
): Promise<DocuSealSubmissionResult> {
  const { apiKey, baseUrl } = getDocuSealConfig();

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

  // Live callout to DocuSeal API
  const payload = {
    name: input.title,
    documents: [
      {
        name: `${input.title}.html`,
        html: input.html || `<h1>${input.title}</h1>`,
      },
    ],
    submitters: formattedSubmitters,
  };

  const res = await fetch(`${baseUrl}/submissions`, {
    method: "POST",
    headers: {
      "X-Auth-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
    id: json.id ?? json.submission_id ?? `ds_${Date.now()}`,
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
