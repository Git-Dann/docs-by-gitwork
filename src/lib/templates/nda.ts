/**
 * NDA (Non-Disclosure Agreement) template blueprint.
 *
 * Mutual NDA by default. Gitwork is pre-filled as the Disclosing Party in the parties block —
 * for a one-way NDA in the other direction the operator just swaps the roles in the editor.
 *
 * **Important:** This is a starting scaffold. Legal counsel must review before sending. Gitwork
 * takes no responsibility for unreviewed contracts generated from this template.
 */

import type { SectionBlueprint } from "@/lib/default-template";

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}

export const ndaSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page and confidentiality metadata.",
    data: {
      proposalTitle: "Mutual Non-Disclosure Agreement",
      productName: "",
      clientName: "Client name",
      subtitle: "v1.0",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "Confidential. Between the parties named on the cover.",
      confidentialityMode: "EXTERNAL",
      heroImage: "",
      brandLockup: "GITWORK",
    },
  },
  {
    key: "parties",
    title: "Parties",
    description: "Counterparties to this Agreement.",
    data: {
      intro:
        "This Mutual Non-Disclosure Agreement is entered into between the following parties (each a “Party”, together the “Parties”):",
      parties: [
        {
          id: id(),
          name: "Gitwork Ltd",
          role: "Disclosing Party",
          organization: "Gitwork Ltd",
          email: "hello@gitwork.io",
          signatureRequired: true,
        },
        {
          id: id(),
          name: "Client Name",
          role: "Receiving Party",
          organization: "Client organisation",
          email: "[REVIEW] client primary contact email",
          signatureRequired: true,
        },
      ],
    },
  },
  {
    key: "prose",
    title: "Background",
    description: "Why the parties are entering into this Agreement.",
    data: {
      content:
        "The Parties wish to discuss a potential or ongoing engagement (the “Purpose”) and, in connection with that, may need to share information that is confidential or proprietary to one Party. This Agreement governs how that information is handled. It does not, on its own, create any obligation to enter into a wider commercial relationship.",
    },
  },
  {
    key: "prose",
    title: "Definition of confidential information",
    description: "What counts as confidential information under this Agreement.",
    data: {
      content:
        "“Confidential Information” means any information disclosed by one Party (the “Discloser”) to the other (the “Recipient”) — whether in writing, orally, visually, by demonstration, or in any other form — that is marked as confidential, identified as confidential at the time of disclosure, or that a reasonable person would understand to be confidential given its nature and the circumstances of disclosure.\n\nIt includes, without limitation, the categories listed in the checklist below.",
    },
  },
  {
    key: "checklist",
    title: "Categories of confidential information",
    description: "Common categories included by reference.",
    data: {
      polarity: "INCLUDE",
      intro: "Confidential Information includes, but is not limited to:",
      items: [
        "Business plans, strategies, and pricing",
        "Client lists, prospect lists, and supplier relationships",
        "Source code, designs, architecture, and technical roadmaps",
        "Financial information, forecasts, and unpublished operating results",
        "Employee, contractor, and candidate personal data",
        "Any information that would reasonably be expected to harm the Discloser if leaked",
      ],
    },
  },
  {
    key: "checklist",
    title: "Exclusions",
    description: "Information that does not count as Confidential Information.",
    data: {
      polarity: "EXCLUDE",
      intro: "Confidential Information does NOT include information that the Recipient can show:",
      items: [
        "Was already lawfully in the Recipient’s possession before disclosure, free of any confidentiality obligation",
        "Becomes publicly available through no breach of this Agreement by the Recipient",
        "Is rightfully received from a third party who has no confidentiality obligation to the Discloser",
        "Is independently developed by the Recipient without reference to the Discloser’s Confidential Information",
      ],
    },
  },
  {
    key: "prose",
    title: "Permitted use",
    description: "How the Recipient may use Confidential Information.",
    data: {
      content:
        "The Recipient may use Confidential Information solely for the Purpose. The Recipient will not use Confidential Information for any other purpose, including to compete with the Discloser, to develop a similar or competing product or service, or for any personal benefit.\n\nThe Recipient will share Confidential Information only with employees, contractors, or professional advisers who (a) need it for the Purpose, and (b) are bound by confidentiality obligations at least as protective as those in this Agreement. The Recipient is responsible for any breach by those people as if it had breached this Agreement itself.",
    },
  },
  {
    key: "prose",
    title: "Standard of care",
    description: "How the Recipient must protect Confidential Information.",
    data: {
      content:
        "The Recipient will protect the Discloser’s Confidential Information using at least the same degree of care it uses to protect its own confidential information of a similar nature, and no less than a reasonable standard of care. The Recipient will take prompt action to prevent unauthorised disclosure and will notify the Discloser without undue delay if it becomes aware of any actual or suspected breach.",
    },
  },
  {
    key: "prose",
    title: "Required disclosure",
    description: "Disclosure compelled by law.",
    data: {
      content:
        "If the Recipient is required by law, court order, or regulator to disclose Confidential Information, it will (where legally permitted) give the Discloser prompt written notice so the Discloser can seek a protective order or other remedy. The Recipient will disclose only the minimum information legally required and will use reasonable efforts to maintain confidential treatment of the disclosed material.",
    },
  },
  {
    key: "term",
    title: "Term and survival",
    description: "How long this Agreement and the confidentiality obligation last.",
    data: {
      effectiveDate: new Date().toISOString().slice(0, 10),
      initialTermMonths: 24,
      autoRenew: false,
      renewalTerm: "Not auto-renewing",
      noticePeriodDays: 30,
      governingLaw: "England and Wales",
      terminationForCause:
        "Either Party may terminate this Agreement on 30 days’ written notice. The confidentiality obligations in this Agreement survive termination for a further three (3) years from the date of disclosure for ordinary Confidential Information, and indefinitely for personal data and trade secrets.",
    },
  },
  {
    key: "prose",
    title: "Return or destruction",
    description: "What happens to Confidential Information at the end of the engagement.",
    data: {
      content:
        "On written request from the Discloser, or on termination of this Agreement, the Recipient will promptly return or destroy all Confidential Information in its possession, including any copies, summaries, or derived materials. The Recipient may retain (a) one copy in secure archive purely for legal and regulatory compliance, and (b) routine backups created as part of standard IT operations — both of which remain subject to this Agreement until deleted in the ordinary course.",
    },
  },
  {
    key: "prose",
    title: "No other rights",
    description: "What this Agreement does not grant.",
    data: {
      content:
        "Nothing in this Agreement transfers ownership of any intellectual property, grants a licence (express or implied) to any patent, copyright, trademark, or other right, or creates any agency, partnership, or employment relationship between the Parties. Each Party remains free to engage in business with any third party, subject only to the confidentiality obligations in this Agreement.",
    },
  },
  {
    key: "prose",
    title: "Remedies",
    description: "What happens if the Agreement is breached.",
    data: {
      content:
        "The Parties agree that monetary damages alone may not be adequate compensation for a breach of this Agreement. The Discloser is therefore entitled to seek injunctive or other equitable relief in addition to any other remedies available at law, without the need to post bond or prove actual damages.",
    },
  },
  {
    key: "signatures",
    title: "Signatures",
    description: "Authorised signatories for each party.",
    data: {
      intro: "Signed for and on behalf of:",
      blocks: [
        {
          id: id(),
          partyName: "Gitwork Ltd",
          signatoryName: "[REVIEW] Authorised Gitwork signatory",
          signatoryRole: "Director",
          signatoryEmail: "hello@gitwork.io",
          signatureDate: "",
        },
        {
          id: id(),
          partyName: "Client organisation",
          signatoryName: "[REVIEW] Authorised client signatory",
          signatoryRole: "Authorised representative",
          signatoryEmail: "[REVIEW] signatory email",
          signatureDate: "",
        },
      ],
    },
  },
];
