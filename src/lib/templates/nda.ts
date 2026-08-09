/**
 * NDA (Non-Disclosure Agreement) template blueprint.
 *
 * Gitwork's GENERIC mutual-NDA template. Rebuilt August 2026 from the structure, clause order and
 * numbering system of an executed reference NDA — the same document `DESIGN.md` § "Document Render"
 * names as the source of the house type + numbering system. The reference's counterparties, working
 * names and dates are NOT reproduced here: this file holds Gitwork's own details plus placeholders.
 *
 * The clause WORDING is the reusable part and is meant to stay as drafted; only identity is filled
 * in. Two conventions, and they mean different things:
 *   - `{{client_name}}` / `{{date}}` are MERGE VARIABLES — resolved at render time from the document
 *     (see `src/lib/merge-variables.ts`), never persisted resolved, so a renamed client re-resolves.
 *   - `[company number]`, `[registered office address]`, `[individual name]`,
 *     `[project working name]`, `[address for correspondence]` are square-bracket placeholders a
 *     HUMAN fills in. The app cannot resolve them, and they are deliberately conspicuous.
 *
 * The template keeps the reference's three-party SHAPE, because it is the common Gitwork case: the
 * counterparty company ("the Client"), plus an individual signing in a personal capacity ("the
 * Founder") where the venture being discussed has no legal entity yet ("the Project" / "the Project
 * Company"). Where a deal has no such individual, delete the Founder from clause 1.1, the parties
 * block and the execution page, and drop sections 3 and the first callout.
 *
 * ── HOW THIS RENDERS (read before reordering anything) ────────────────────────────────────────
 * The accent-mono `01` … `15` gutter number beside each section title is NOT stored — it is the
 * block's ordinal among the VISIBLE, shell-rendered blocks, computed by `sectionNumber()` in
 * `src/components/proposals/proposal-section-preview.tsx`. Only `cover`, `heading` and `divider`
 * are skipped (`renderShell: false`); `prose`, `callout`, `parties` and `signatures` all count.
 *
 * So the fifteen clause sections are listed FIRST and CONSECUTIVELY, which is what makes the
 * printed `01`–`15` agree with the `1.1`–`15.8` clause prefixes and with every cross-reference in
 * the text ("defined in clause 3", "under clause 7.2", "the date in clause 1.1"). The callouts,
 * the parties block and the execution page follow them. Insert a numbered block between two clause
 * sections and every heading number below it silently disagrees with its own clause numbers.
 *
 * Each numbered section is ONE `prose` block whose `title` is the section heading — the shell draws
 * the number + serif title, so a separate `heading` block would render a second, unnumbered title.
 * `description` is deliberately empty on every block: it prints as a mono-caps caption under the
 * title and the reference has none.
 *
 * **Important:** legal counsel must review before sending. Gitwork takes no responsibility for
 * unreviewed contracts generated from this template.
 */

import type { SectionBlueprint } from "@/lib/default-template";
import { GITWORK, registeredPartyDetailLines } from "@/lib/gitwork";

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Clause bodies are authored as one line per clause, joined with "\n" rather than written as a
 * template literal — the 2-space indent that turns a line into an `(a)`/`(b)` sub-item is
 * SEMANTIC (see `parseClauses` in `src/lib/sections/prose.tsx`), and a template literal would
 * silently absorb it into the file's own indentation. Never type the numbers: `1.1` and `(a)` are
 * CSS counters, so a literal marker would render twice.
 */
const lines = (...items: string[]) => items.join("\n");

/** A sub-item of the clause above it — exactly two leading spaces. */
const sub = (text: string) => `  ${text}`;

export const ndaSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page and confidentiality metadata.",
    data: {
      proposalTitle: "Mutual Non-Disclosure Agreement",
      productName: "",
      // Blank on purpose: `src/lib/sections/cover.tsx` falls back to `proposal.clientName` then
      // `metadata.client`, so a new NDA inherits whichever client it was created against.
      clientName: "",
      subtitle:
        "A two-way agreement covering confidential information shared while the parties explore and scope software delivery work.",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "Confidential. Between the parties named on the cover.",
      confidentialityMode: "EXTERNAL",
      heroImage: "",
      brandLockup: "GITWORK",
    },
  },

  // ── 01 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "The parties and this agreement",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "1",
      content: lines(
        "This agreement is dated **{{date}}** and is made between:",
        sub(
          `**${GITWORK.legalName}**, ${registeredPartyDetailLines().join(" ")} ("${GITWORK.name}");`,
        ),
        sub(
          '**{{client_name}}**, a company registered in England and Wales under number [company number] whose registered office is at [registered office address] ("the Client"); and',
        ),
        sub(
          '**[individual name]**, in a personal capacity, care of [address for correspondence] ("the Founder").',
        ),
        'Each of them is a "party" and together they are "the parties". Where a party shares information it is the "Discloser". Where a party receives information it is the "Recipient". Every party may act in both roles, so the obligations in this agreement apply equally in all directions.',
        "The Founder is a party only in relation to the Project defined in clause 3. The Founder is a party because that project has no legal entity of its own at the date of this agreement.",
        "**Information already shared.** This agreement also applies to Confidential Information disclosed between the parties before the date of this agreement, from the date of their first discussions, as though this agreement had been in force at the time.",
      ),
    },
  },

  // ── 02 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "Purpose",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "2",
      content: lines(
        'The parties intend to discuss and evaluate possible software design, development, and delivery work across two workstreams (together the "Purpose"):',
        sub("work relating to the existing platform, systems, and operations of the Client; and"),
        sub("the Project, being a new platform and business that is not yet incorporated."),
        "The Purpose includes any scoping, audit, technical review, proposal, design, or pilot work connected to either workstream.",
        "Confidential Information may only be used for the Purpose. It may not be used for any other commercial or personal advantage.",
      ),
    },
  },

  // ── 03 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "The Project",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "3",
      content: lines(
        'The "Project" means the proposed platform, product, and business currently referred to by the working name [project working name]. It includes the name itself, the concept, the product and feature design, the mechanics, the commercial model, the branding, the target market, and any prototype, wireframe, prompt, or code relating to it.',
        'The parties acknowledge that no company or other legal entity has been formed to own the Project at the date of this agreement, and that the Client and the Founder intend to form one (the "Project Company").',
        "Until the Project Company is formed and joins this agreement, the Client and the Founder hold the rights and the obligations in this agreement in relation to the Project, jointly and severally.",
        "Within 20 business days of the Project Company being incorporated, the Client and the Founder shall procure that it signs a short deed of adherence to this agreement, after which it is bound as though it had been an original party. The Founder remains bound in respect of Confidential Information they have already received.",
        "Nothing in this agreement gives Gitwork any right, title, or interest in the Project name, concept, or intellectual property. Gitwork shall not apply to register that name, or a confusingly similar name, as a company name, domain name, or trade mark, and shall not build a competing platform using the Client's or the Founder's Confidential Information.",
        "Equally, neither the Client nor the Founder acquires any right in Gitwork's own methods, tooling, templates, frameworks, or pre-existing materials by taking part in these discussions.",
      ),
    },
  },

  // ── 04 ─────────────────────────────────────────────────────────────────────────────────────
  // Arrow-bullet list, not `checklist`: the reference's markers are the doc's purple `→`
  // (`.doc-bullets`, emitted by the Markdown renderer for a `- ` list). `checklist` draws green
  // ticks / red crosses, which is a different block for a different job.
  {
    key: "prose",
    title: "What counts as Confidential Information",
    description: "",
    data: {
      // Authors the gutter number (04); no `style: "clauses"`, so it stays a bullet list.
      clauseSection: "4",
      content: lines(
        '"Confidential Information" means any information disclosed by one party to another in connection with the Purpose, in any form, whether or not it is marked confidential. It includes:',
        "",
        "- Everything within the definition of the Project in clause 3.1.",
        "- Business plans, strategy, pricing, commercial terms, financial information, and forecasts.",
        "- Client lists, member and candidate information, matching criteria, and internal processes.",
        "- Source code, repositories, prompts, prototypes, designs, wireframes, architecture, data models, APIs, credentials, and infrastructure detail.",
        "- Product roadmaps, unreleased features, research, and know how.",
        "- Personal data, as defined in UK data protection law.",
        "- The existence and content of the discussions between the parties, and the terms of this agreement.",
      ),
    },
  },

  // ── 05 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "What is not Confidential Information",
    description: "",
    data: {
      // Authors the gutter number (05); no `style: "clauses"`, so it stays a bullet list.
      clauseSection: "5",
      content: lines(
        "Information is not Confidential Information, or stops being Confidential Information, where the Recipient can show that it:",
        "",
        "- Was already public, or later becomes public, other than through a breach of this agreement.",
        "- Was already lawfully known to the Recipient with no duty of confidence attached.",
        "- Is received lawfully from a third party who is free to disclose it.",
        "- Is independently developed by the Recipient without using the Discloser's Confidential Information.",
      ),
    },
  },

  // ── 06 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "Obligations of the Recipient",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "6",
      content: lines(
        "The Recipient shall keep the Discloser's Confidential Information secret and confidential, and shall protect it with at least the same care it applies to its own confidential information, and in any event with reasonable care.",
        "The Recipient shall not copy, reproduce, publish, or distribute the Confidential Information except as reasonably needed for the Purpose.",
        "The Recipient shall not reverse engineer, decompile, or disassemble any software, prototype, or code provided by the Discloser, except where the law expressly permits it.",
        "The Recipient shall tell the Discloser without undue delay if it becomes aware of any unauthorised use, disclosure, loss, or suspected breach affecting the Confidential Information, and shall cooperate reasonably to limit the effect of it.",
      ),
    },
  },

  // ── 07 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "Who Confidential Information can be shared with",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "7",
      content: lines(
        'The Recipient may disclose the Confidential Information to its officers, employees, and members of its own delivery team who need it for the Purpose (each a "Permitted Person"), provided the Recipient makes each Permitted Person aware of the confidential nature of the information and remains fully responsible for their compliance with this agreement.',
        "The Client and the Founder acknowledge that Gitwork delivers work through its own dedicated build team, part of which is staffed and located outside the United Kingdom, and that Gitwork may share Confidential Information with those team members as Permitted Persons for the Purpose. Every release is reviewed, quality assured, and deployed by a UK based senior engineer. Gitwork remains fully responsible for its team under this agreement.",
        "Any party may disclose the Confidential Information to its professional advisers, such as legal, accounting, or insurance advisers, who are themselves under a duty of confidence.",
        "No party shall disclose the Confidential Information to any other third party without the Discloser's prior written consent. This includes any co-founder, investor, or freelancer engaged on the Project who is not already a Permitted Person.",
      ),
    },
  },

  // ── 08 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "Personal data",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "8",
      content: lines(
        "Where Confidential Information includes personal data, each party shall comply with the UK GDPR and the Data Protection Act 2018 in relation to it.",
        "The parties shall keep the sharing of personal data to the minimum needed for the Purpose. Wherever practical, data used for evaluation, audit, testing, or demonstration shall be anonymised, pseudonymised, or replaced with synthetic data.",
        "Where personal data is transferred outside the United Kingdom under clause 7.2, the transferring party shall put an appropriate transfer mechanism in place, such as the UK International Data Transfer Agreement or the UK Addendum to the EU Standard Contractual Clauses, together with appropriate technical and organisational measures.",
        "This agreement does not create a data processing agreement. If the parties proceed to an engagement involving the processing of personal data, they shall enter into a separate written data processing agreement that meets Article 28 of the UK GDPR.",
      ),
    },
  },

  // ── 09 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "Disclosure required by law",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "9",
      content:
        "A Recipient may disclose Confidential Information to the extent required by law, by a court, or by a regulator. Where it is lawful to do so, the Recipient shall notify the Discloser in advance, limit the disclosure to what is required, and give the Discloser a reasonable opportunity to object.",
    },
  },

  // ── 10 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "Term and duration of obligations",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "10",
      content: lines(
        "This agreement starts on the date in clause 1.1 and continues for two years, unless the parties agree otherwise in writing.",
        "The confidentiality obligations continue for three years from the date the relevant Confidential Information was disclosed, or for as long as the information remains a trade secret or personal data, whichever is longer.",
        "If the parties later sign a master services agreement, statement of work, or similar contract covering the same subject matter, that contract takes precedence over this agreement to the extent of any conflict.",
      ),
    },
  },

  // ── 11 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "Return and deletion",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "11",
      content: lines(
        "On the Discloser's written request, the Recipient shall promptly return or securely delete the Confidential Information in its possession, including copies, and confirm in writing that it has done so.",
        "The Recipient may keep one copy where it is required to do so by law, by a regulator, or by its insurers, or where the copy sits in routine backups or archives that cannot reasonably be deleted individually. Any retained copy stays subject to this agreement.",
      ),
    },
  },

  // ── 12 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "No licence, no transfer of rights",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "12",
      content: lines(
        "All Confidential Information remains the property of the Discloser. Nothing in this agreement transfers or grants any licence in any intellectual property, and no rights are granted other than the limited right to use the Confidential Information for the Purpose.",
        "Ownership of intellectual property created in any engagement between the parties shall be dealt with in the contract for that engagement, not in this agreement.",
      ),
    },
  },

  // ── 13 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "No obligation to proceed, no warranty",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "13",
      content: lines(
        "No party is obliged to disclose any information, to proceed with the Purpose, or to enter into any further agreement. No party is exclusively bound to another, and each may work with third parties, including competitors, provided it does not breach this agreement.",
        "Confidential Information is provided as is. No party gives any warranty as to its accuracy or completeness.",
      ),
    },
  },

  // ── 14 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "Remedies",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "14",
      content:
        "Each party accepts that damages alone may not be an adequate remedy for a breach of this agreement, and that another party may seek injunctive relief or specific performance in addition to any other remedy available to it.",
    },
  },

  // ── 15 ─────────────────────────────────────────────────────────────────────────────────────
  {
    key: "prose",
    title: "General",
    description: "",
    data: {
      style: "clauses",
      clauseSection: "15",
      content: lines(
        "**Notices.** Notices shall be in writing and sent to the registered office or stated address of the receiving party, or by email to the address that party has used for correspondence about the Purpose.",
        "**Entire agreement and variation.** This agreement is the entire agreement between the parties on confidentiality relating to the Purpose. It may only be varied in writing signed by all parties.",
        "**Assignment.** No party may assign or transfer this agreement without the written consent of the others, except that the Client and the Founder may novate their rights and obligations relating to the Project to the Project Company under clause 3.4.",
        "**No partnership.** Nothing in this agreement creates a partnership, joint venture, agency, or employment relationship.",
        "**Third parties.** No one other than the parties has any right to enforce this agreement under the Contracts (Rights of Third Parties) Act 1999, except the Project Company once it has signed the deed of adherence.",
        "**Severance and waiver.** If any provision is found to be unenforceable, the rest of the agreement remains in force. A delay in enforcing a right is not a waiver of it.",
        "**Counterparts.** This agreement may be signed in counterparts, including electronically, and each counterpart is an original.",
        "**Governing law and jurisdiction.** This agreement is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.",
      ),
    },
  },

  // ── The two shaded explainers ──────────────────────────────────────────────────────────────
  // In the reference these sit inside sections 3 and 7. They are `callout` blocks, which the
  // renderer counts for the section number (see the header note), so placing them there would
  // renumber every heading below them out of step with its own clause prefixes. They are parked
  // here instead, immediately after the clause run, so `01`–`15` stay correct.
  {
    key: "callout",
    title: "",
    description: "",
    data: {
      tone: "info",
      headline: "Why the Founder signs personally",
      body: "A company that does not exist yet cannot be bound by a contract. Until the Project Company is incorporated and signs the deed of adherence in clause 3.4, the Founder signing in a personal capacity is what makes the protection around the Project enforceable in both directions.",
    },
  },
  {
    key: "callout",
    title: "",
    description: "",
    data: {
      tone: "info",
      headline: "Plain English summary of clause 7",
      body: "Each party can share the other party's confidential information inside its own team where that is needed to do the work, and stays responsible for its own people. Gitwork's build team includes staff based outside the UK. Nothing goes to any outside third party without written consent.",
    },
  },

  // ── The parties block ──────────────────────────────────────────────────────────────────────
  // Its real job is the COVER: `src/lib/sections/cover.tsx` reads the first VISIBLE `parties`
  // section and turns each entry into a cover column — the `PARTY A` / `PARTY B` / `PARTY C`
  // label is generated from the index, and the supporting lines are, in order, `organization`
  // (when it differs from `name`), `role`, then `email`. Hiding this block drops the cover's
  // party row and the cover falls back to the meta grid, so it stays visible.
  //
  // `role` is left blank so nothing competes with the generated label, and the registered office
  // rides in `email` because `PartyItem` has no `details?: string[]` the way
  // `SignatureBlockItem` does. The e-sign signer list prefers the `signatures` blocks below, so
  // nothing treats these strings as real addresses — but see the report: a `details` array on
  // `PartyItem` is the clean fix.
  {
    key: "parties",
    title: "Parties",
    description: "",
    data: {
      intro: "",
      parties: [
        {
          id: id(),
          name: GITWORK.legalName,
          role: "",
          organization: `Company no. ${GITWORK.companyNumber}`,
          email: GITWORK.registeredOffice,
          signatureRequired: true,
        },
        {
          id: id(),
          name: "{{client_name}}",
          role: "",
          organization: "Company no. [company number]",
          email: "[registered office address]",
          signatureRequired: true,
        },
        {
          id: id(),
          name: "[individual name]",
          role: "",
          organization: "In a personal capacity, for the Project only",
          email: "[address for correspondence]",
          signatureRequired: true,
        },
      ],
    },
  },

  // ── The execution page ─────────────────────────────────────────────────────────────────────
  // The block draws its own `EXECUTION` eyebrow, the serif "Signed by the parties." title and the
  // accent-ruled `NOTE ON SIGNING` panel, so the reference's last page comes almost entirely from
  // this one section. `signatoryName` / `signatoryRole` / `signatoryEmail` are blank on purpose:
  // a value there PRINTS above its rule, and the reference leaves every rule empty to be signed.
  {
    key: "signatures",
    title: "",
    description: "",
    data: {
      intro:
        "Each person signing below confirms they are authorised to sign in the capacity shown, and agrees to the terms set out in this agreement.",
      blocks: [
        {
          id: id(),
          type: "gitwork",
          variableName: "gitwork_signature",
          partyName: "Gitwork Group Ltd",
          signatoryName: "",
          signatoryRole: "",
          signatoryEmail: "",
          signatureDate: "",
          details: [`Company no. ${GITWORK.companyNumber}`, "Salford Quays, Manchester"],
        },
        {
          id: id(),
          type: "client",
          variableName: "client_signature",
          partyName: "{{client_name}}",
          signatoryName: "",
          signatoryRole: "",
          signatoryEmail: "",
          signatureDate: "",
          details: ["Company no. [company number]", "[registered office address]"],
        },
        {
          id: id(),
          type: "client",
          variableName: "client_individual_signature",
          partyName: "[individual name]",
          signatoryName: "",
          signatoryRole: "",
          signatoryEmail: "",
          signatureDate: "",
          details: ["In a personal capacity, for the Project"],
          // Swaps "FOR AND ON BEHALF OF" for "SIGNED PERSONALLY BY" and the POSITION rule for a
          // WITNESS NAME rule, exactly as the reference's third card reads.
          personal: true,
        },
      ],
      note: "This agreement may be signed electronically. An electronic signature applied through a recognised signing platform has the same effect as a wet ink signature. Once all parties have signed, each party should keep a copy of the fully executed agreement. A separate deed of adherence will be issued for the Project Company once it is incorporated.",
    },
  },
];
