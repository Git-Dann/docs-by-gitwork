/**
 * DSA (Data Sharing Agreement / Data Processing Agreement) template blueprint.
 *
 * Aligned with UK GDPR + EU GDPR Article 28 — Gitwork as Processor, Client as Controller. Where
 * the engagement runs the other way (e.g. Gitwork shares its own data with a sub-processor),
 * the operator flips the roles in the parties block.
 *
 * **Important:** This is a starting scaffold. Legal counsel must review before sending. Gitwork
 * takes no responsibility for unreviewed contracts generated from this template.
 */

import type { SectionBlueprint } from "@/lib/default-template";
import { GITWORK } from "@/lib/gitwork";

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}

export const dsaSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page and confidentiality metadata.",
    data: {
      proposalTitle: "Data Sharing Agreement",
      productName: "",
      clientName: "Client name",
      subtitle: "GDPR Article 28 · v1.0",
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
        "This Data Sharing Agreement (the “DSA”) is entered into between the following parties (each a “Party”, together the “Parties”) and governs the processing of personal data described in this document:",
      parties: [
        {
          id: id(),
          name: "Client Name",
          role: "Data Controller",
          organization: "Client organisation",
          email: "[REVIEW] client DPO or primary data contact",
          signatureRequired: true,
        },
        {
          id: id(),
          name: GITWORK.legalName,
          role: "Data Processor",
          organization: GITWORK.legalName,
          email: "privacy@gitwork.co.uk",
          signatureRequired: true,
        },
      ],
    },
  },
  {
    key: "prose",
    title: "Purpose and lawful basis",
    description: "Why personal data is being processed and on what legal grounds.",
    data: {
      content:
        "This DSA documents the terms under which Gitwork (the “Processor”) processes personal data on behalf of the Customer (the “Controller”) in connection with the Services provided under the parties’ underlying Master Service Agreement (or relevant SOW).\n\nThe Controller confirms that it has identified a lawful basis under Article 6 UK/EU GDPR (and, where Special Category Data is in scope, an Article 9 condition) for each category of processing instructed under this DSA. The Processor processes personal data only on documented instructions from the Controller, including with regard to international transfers, unless required to do otherwise by law (in which case it will notify the Controller before processing, unless that law prohibits notification on important grounds of public interest).",
    },
  },
  {
    key: "data_table",
    title: "Categories of personal data and data subjects",
    description: "What's being processed, and whose data it is.",
    data: {
      caption:
        "Specify every category of personal data shared with Gitwork under this DSA, the categories of data subjects, and the retention period.",
      columns: ["Category of data", "Data subjects", "Retention"],
      rows: [
        [
          "[REVIEW] e.g. Names, emails, role titles",
          "[REVIEW] e.g. Customer’s employees",
          "[REVIEW] e.g. Duration of engagement + 12 months",
        ],
        [
          "[REVIEW] e.g. Customer support tickets and messages",
          "[REVIEW] e.g. Customer’s end users",
          "[REVIEW] e.g. 24 months from ticket close",
        ],
        [
          "[REVIEW] e.g. Usage analytics (IP, device, page views)",
          "[REVIEW] e.g. Visitors to Customer’s product",
          "[REVIEW] e.g. 6 months in aggregate form",
        ],
      ],
    },
  },
  {
    key: "prose",
    title: "Processor obligations (Article 28)",
    description: "Gitwork's specific GDPR Article 28 obligations.",
    data: {
      content:
        "The Processor will:\n\n(a) process personal data only on documented written instructions from the Controller, including this DSA, the relevant SOW, and any subsequent instructions given in writing during the term;\n\n(b) ensure that personnel authorised to process personal data are committed to confidentiality or are under an appropriate statutory obligation of confidentiality;\n\n(c) take all measures required by Article 32 UK/EU GDPR (security of processing), set out in the “Security measures” section below;\n\n(d) assist the Controller, taking into account the nature of the processing, in fulfilling its obligations to respond to data subject rights requests (Articles 12–22), and in complying with Articles 32–36 (security, breach notification, DPIAs, prior consultation);\n\n(e) at the choice of the Controller, delete or return all personal data after the end of the provision of services, and delete existing copies unless storage is required by law;\n\n(f) make available to the Controller all information necessary to demonstrate compliance with Article 28, and allow for and contribute to audits, including inspections, conducted by the Controller or another auditor mandated by the Controller, on reasonable notice and during business hours.",
    },
  },
  {
    key: "prose",
    title: "Sub-processors",
    description: "Authorised sub-processors and notification of changes.",
    data: {
      content:
        "The Controller gives the Processor general written authorisation to engage sub-processors, subject to the terms of this DSA. A current list of sub-processors is maintained at https://gitwork.io/legal/sub-processors and is incorporated into this DSA by reference.\n\nThe Processor will inform the Controller in writing of any intended addition or replacement of a sub-processor at least thirty (30) days in advance, giving the Controller the opportunity to object on reasonable data protection grounds. If the Controller objects and the Parties cannot agree a resolution, the Controller may terminate the relevant SOW on written notice without further liability beyond fees due for Services already delivered.\n\nThe Processor will impose on each sub-processor the same data protection obligations as are set out in this DSA (in particular, providing sufficient guarantees to implement appropriate technical and organisational measures). The Processor remains fully liable to the Controller for any failure by a sub-processor to fulfil those obligations.",
    },
  },
  {
    key: "prose",
    title: "International data transfers",
    description: "How personal data is transferred outside the UK/EEA, if at all.",
    data: {
      content:
        "Where the Processor transfers personal data to a country outside the UK or the EEA that is not covered by an adequacy decision, the Processor will rely on the UK International Data Transfer Addendum (or the equivalent Standard Contractual Clauses for EEA transfers) as the lawful transfer mechanism, signed and dated between the Parties as appropriate.\n\nThe Processor will conduct and document a transfer risk assessment for each onward transfer and implement supplementary measures where required. The current list of transfer mechanisms and recipient countries is reflected in the sub-processor list referenced above.",
    },
  },
  {
    key: "prose",
    title: "Security measures (Annex II baseline)",
    description: "The technical and organisational measures Gitwork applies.",
    data: {
      content:
        "Taking into account the state of the art, the costs of implementation, and the nature, scope, context and purposes of processing, the Processor implements appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including:\n\n• Encryption of personal data in transit (TLS 1.2+) and at rest (AES-256 or equivalent);\n• Role-based access controls with least-privilege defaults; periodic access reviews; mandatory MFA for all production access;\n• Network segmentation, application-layer firewall, and intrusion detection on production systems;\n• Centralised, immutable audit logging of access to personal data;\n• Vulnerability scanning on dependencies and infrastructure; documented patching cadence;\n• Incident response plan with defined roles, escalation paths, and post-incident review;\n• Personnel screening on hire, mandatory annual data protection training, and confidentiality undertakings;\n• Sub-contractor due diligence and contractual flow-down of equivalent security obligations;\n• Documented secure development lifecycle: peer code review, automated security testing in CI, secret scanning.\n\nThe Processor regularly tests, assesses, and evaluates the effectiveness of these measures and reports material changes to the Controller on reasonable request.",
    },
  },
  {
    key: "prose",
    title: "Personal data breach notification",
    description: "What happens if there's a breach.",
    data: {
      content:
        "The Processor will notify the Controller without undue delay, and in any case within seventy-two (72) hours, of becoming aware of a Personal Data Breach affecting the Controller’s personal data. The notification will include, to the extent available at the time:\n\n• A description of the nature of the breach, including categories and approximate number of data subjects and data records concerned;\n• The likely consequences of the breach;\n• Measures taken or proposed to address the breach and mitigate its possible adverse effects;\n• Contact details of the Processor’s DPO or other relevant contact.\n\nWhere it is not possible to provide all of the above information at the same time, the Processor will provide it in phases without further undue delay. The Processor will reasonably assist the Controller with any required regulator notification (e.g. to the ICO under Article 33) or data subject notification (Article 34).",
    },
  },
  {
    key: "prose",
    title: "Data subject rights",
    description: "How Gitwork helps the Controller respond to access, deletion, and other rights requests.",
    data: {
      content:
        "The Processor will, taking into account the nature of the processing, assist the Controller by appropriate technical and organisational measures, insofar as possible, in fulfilling its obligation to respond to requests from data subjects exercising their rights under Chapter III of UK/EU GDPR (access, rectification, erasure, restriction, portability, objection, automated decision-making).\n\nIf the Processor receives a data subject rights request directed at the Controller’s data, it will not respond directly but will forward the request to the Controller without undue delay. The Processor may charge a reasonable fee where assistance is materially burdensome and falls outside the routine cooperation contemplated by this DSA.",
    },
  },
  {
    key: "prose",
    title: "Return or destruction of personal data",
    description: "What happens at the end of the engagement.",
    data: {
      content:
        "On termination of the underlying Services, or on the Controller’s written instruction at any time, the Processor will (at the Controller’s choice) either:\n\n• Return all personal data to the Controller in a commonly used machine-readable format, and delete existing copies; or\n• Delete all personal data and certify deletion in writing.\n\nThis includes copies held by sub-processors. The Processor may retain personal data to the extent required by applicable law, provided it continues to apply the security obligations of this DSA and processes the retained data only for the legal purpose that requires retention.",
    },
  },
  {
    key: "term",
    title: "Term and governing law",
    description: "How long this DSA runs, and the law that applies.",
    data: {
      effectiveDate: new Date().toISOString().slice(0, 10),
      initialTermMonths: 36,
      autoRenew: true,
      renewalTerm: "Co-terminus with the underlying Master Service Agreement",
      noticePeriodDays: 30,
      governingLaw: "England and Wales",
      terminationForCause:
        "This DSA terminates automatically on termination of the underlying Master Service Agreement or the final SOW between the Parties, whichever is later. Either Party may also terminate this DSA on 30 days’ written notice if the other commits a material breach of its data protection obligations and fails to cure within that period.",
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
          type: "gitwork",
          variableName: "Gitwork Signature",
          partyName: GITWORK.legalName,
          signatoryName: "[REVIEW] Authorised Gitwork signatory",
          signatoryRole: "Director / DPO",
          signatoryEmail: "privacy@gitwork.co.uk",
          signatureDate: "",
        },
        {
          id: id(),
          type: "client",
          variableName: "Client Signature",
          partyName: "Client organisation",
          signatoryName: "[REVIEW] Authorised client signatory",
          signatoryRole: "DPO / Authorised representative",
          signatoryEmail: "[REVIEW] signatory email",
          signatureDate: "",
        },
      ],
    },
  },
];
