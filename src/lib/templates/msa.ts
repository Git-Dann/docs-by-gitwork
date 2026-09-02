/**
 * MSA (Master Service Agreement) template blueprint.
 *
 * The umbrella commercial agreement under which Gitwork delivers engagements. Individual pieces
 * of work hang off an MSA as SOWs (or Change Orders against existing SOWs).
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

export const msaSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page and confidentiality metadata.",
    data: {
      proposalTitle: "Master Service Agreement",
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
        "This Master Service Agreement (the “Agreement”) is entered into between the following parties (each a “Party”, together the “Parties”):",
      parties: [
        {
          id: id(),
          name: GITWORK.legalName,
          role: "Service Provider",
          organization: GITWORK.legalName,
          email: GITWORK.email,
          signatureRequired: true,
        },
        {
          id: id(),
          name: "Client Name",
          role: "Customer",
          organization: "Client organisation",
          email: "[REVIEW] client primary contact email",
          signatureRequired: true,
        },
      ],
    },
  },
  {
    key: "prose",
    title: "Services framework",
    description: "What this Agreement covers, and how individual pieces of work get authorised.",
    data: {
      content:
        "Gitwork (the “Service Provider”) will provide professional design, engineering, and advisory services (the “Services”) to the Customer under this Agreement.\n\nThis Agreement sets the legal, commercial, and operational baseline that applies to every piece of work between the Parties. Each specific engagement — including its scope, deliverables, fees, and timeline — will be authorised by a separate Statement of Work (each, a “SOW”) signed by both Parties. Each SOW is governed by and incorporates this Agreement; if there is a conflict between this Agreement and a SOW, the SOW prevails for that engagement only.",
    },
  },
  {
    key: "prose",
    title: "Engagement orders",
    description: "How Statements of Work and Change Orders are issued and amended.",
    data: {
      content:
        "A SOW becomes binding when signed by an authorised representative of each Party. Either Party may propose a SOW; no SOW is binding until both signatures are received.\n\nAny material change to an active SOW — scope, deliverables, fees, or timeline — must be documented in a Change Order signed by both Parties. Verbal agreements are not binding. Both Parties commit to processing Change Orders without unreasonable delay so engagements aren’t stalled by paperwork.",
    },
  },
  {
    key: "prose",
    title: "Fees and invoicing",
    description: "How Gitwork bills, and how the Customer pays.",
    data: {
      content:
        "Fees for each engagement are set in the relevant SOW. Unless a SOW says otherwise, Gitwork invoices on the first business day of each calendar month for work performed in that month, payable within 30 days of invoice date by bank transfer to the account on the invoice.\n\nLate payments accrue interest at 4% above the Bank of England base rate, compounded monthly, from the due date until paid in full. Gitwork may suspend Services on any engagement that is more than 14 days overdue, on five business days’ written notice. All fees are exclusive of VAT, which is added at the prevailing rate where applicable.",
    },
  },
  {
    key: "prose",
    title: "Intellectual property",
    description: "Who owns what at the end of an engagement.",
    data: {
      content:
        "Subject to payment in full of the fees for the relevant SOW, Gitwork assigns to the Customer all right, title, and interest in the bespoke deliverables created specifically for that engagement (the “Foreground IP”).\n\nGitwork retains all rights in (a) its pre-existing tools, frameworks, libraries, and methodologies (the “Background IP”), and (b) any general know-how or skills its team develops in the course of delivery. Where Background IP is embedded in a deliverable, Gitwork grants the Customer a perpetual, non-exclusive, royalty-free, worldwide licence to use the Background IP solely as embedded in that deliverable.\n\nNothing in this Agreement transfers Customer pre-existing IP to Gitwork.",
    },
  },
  {
    key: "prose",
    title: "Confidentiality",
    description: "How each Party handles the other’s confidential information.",
    data: {
      content:
        "Each Party will treat the other’s Confidential Information — anything marked confidential, identified as confidential at the time of disclosure, or that a reasonable person would understand to be confidential — with at least the same care it uses for its own confidential information of similar sensitivity, and never less than a reasonable standard of care.\n\nNeither Party will use the other’s Confidential Information for any purpose outside this Agreement, nor disclose it to anyone other than employees, contractors, or professional advisers who need it for that purpose and are bound by equivalent confidentiality obligations. Confidentiality obligations survive termination for three (3) years; obligations relating to personal data and trade secrets survive indefinitely.",
    },
  },
  {
    key: "prose",
    title: "Warranties and limitation of liability",
    description: "What Gitwork warrants, and the cap on liability.",
    data: {
      content:
        "Gitwork warrants that the Services will be performed with reasonable skill and care by suitably qualified personnel, and that the Foreground IP will, to its knowledge, not infringe the intellectual property rights of any third party.\n\nExcept for (a) liability for death or personal injury caused by negligence, (b) liability for fraud or fraudulent misrepresentation, and (c) indemnification obligations expressly set out in this Agreement or a SOW, each Party’s total aggregate liability under or in connection with this Agreement is capped at the total fees paid by the Customer to Gitwork under the relevant SOW in the twelve (12) months preceding the event giving rise to the claim.\n\nNeither Party is liable for indirect, consequential, or purely economic losses, loss of profit, loss of goodwill, or loss of anticipated savings.",
    },
  },
  {
    key: "prose",
    title: "Data protection",
    description: "How personal data is handled across engagements.",
    data: {
      content:
        "Where Gitwork processes personal data on behalf of the Customer in connection with the Services, a separate Data Sharing Agreement (or Data Processing Agreement) will apply. The Parties will execute that DSA before any personal data is shared. In its absence, Gitwork will process personal data only as strictly necessary to deliver the Services and in accordance with applicable UK and EU data protection law.",
    },
  },
  {
    key: "term",
    title: "Term and termination",
    description: "How long this Agreement runs, and how it ends.",
    data: {
      effectiveDate: new Date().toISOString().slice(0, 10),
      initialTermMonths: 36,
      autoRenew: true,
      renewalTerm: "Successive 12-month periods unless either Party gives notice",
      noticePeriodDays: 90,
      governingLaw: "England and Wales",
      terminationForCause:
        "Either Party may terminate this Agreement for convenience on 90 days’ written notice. Either Party may terminate immediately for material breach not cured within 30 days of written notice, or for the other Party’s insolvency or analogous event. Termination of this Agreement automatically terminates all active SOWs unless the Parties agree in writing to continue specific engagements to completion.",
    },
  },
  {
    key: "prose",
    title: "Consequences of termination",
    description: "What both Parties owe each other on termination.",
    data: {
      content:
        "On termination, the Customer will pay Gitwork for all Services performed up to the effective date of termination, including any work in progress that cannot be unwound. Gitwork will return or destroy the Customer’s Confidential Information in accordance with the Confidentiality section, deliver work in progress in the form it then exists, and assign any Foreground IP for which fees have been paid in full. Sections concerning intellectual property, confidentiality, limitation of liability, governing law, and any other clause whose nature is intended to survive termination, will survive.",
    },
  },
  {
    key: "prose",
    title: "General",
    description: "Boilerplate provisions.",
    data: {
      content:
        "This Agreement, together with any signed SOWs and Change Orders, constitutes the entire agreement between the Parties on its subject matter and supersedes all prior discussions and agreements. Amendments must be in writing and signed by both Parties.\n\nNeither Party may assign or novate this Agreement without the other’s prior written consent (not to be unreasonably withheld), except that either Party may assign to a successor in connection with a merger, acquisition, or sale of substantially all of its assets.\n\nThis Agreement is governed by the laws of England and Wales, and the Parties submit to the exclusive jurisdiction of the courts of England and Wales for any dispute arising out of or in connection with it.\n\nA person who is not a Party to this Agreement has no rights under the Contracts (Rights of Third Parties) Act 1999 to enforce any term of it.",
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
          signatoryRole: "Director",
          signatoryEmail: GITWORK.email,
          signatureDate: "",
        },
        {
          id: id(),
          type: "client",
          variableName: "Client Signature",
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
