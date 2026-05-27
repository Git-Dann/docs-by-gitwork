import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs } from "./_types";

export async function runLegalExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult, htmlLower } = ctx;
  const html = pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  // ─── GDPR Articles ─────────────────────────────────────────────────────────

  const hasDataNotice = /what (data|information) we collect|information we (collect|process)|data we (collect|process)/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "gdpr_article13_notice", label: "Data collection notice (GDPR Art. 13/14)", status: hasDataNotice ? "PASS" : "WARN", detail: hasDataNotice ? "Data collection notice detected — GDPR Art. 13/14 transparency requirement addressed." : "No clear data collection notice detected — GDPR requires informing users what data you collect and why at point of collection." });

  const hasAccessRight = /access (your|my) (data|information)|download (your|my) data|data (access|subject access request)/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "gdpr_right_to_access", label: "Right to access data (GDPR Art. 15)", status: hasAccessRight ? "PASS" : "WARN", detail: hasAccessRight ? "Data access mechanism detected — GDPR Art. 15 right to access addressed." : "No data access mechanism detected — GDPR Art. 15 requires providing users a way to access the personal data you hold on them." });

  const hasErasureUi = /delete (my|your|account|data)|right to (erasure|deletion)|remove (my|your) (account|data)|close (my|your) account/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "gdpr_right_to_erasure_ui", label: "Right to erasure UI (GDPR Art. 17)", status: hasErasureUi ? "PASS" : "WARN", detail: hasErasureUi ? "Account/data deletion mechanism detected — GDPR Art. 17 right to erasure addressed." : "No data deletion mechanism detected — GDPR Art. 17 requires a clear way for users to request deletion of their personal data." });

  const hasPortability = /export (your|my|our) data|download (your|my|our) data|data portability/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "gdpr_right_to_portability", label: "Data portability (GDPR Art. 20)", status: hasPortability ? "PASS" : "WARN", detail: hasPortability ? "Data export/portability option detected — GDPR Art. 20 addressed." : "No data portability option detected — GDPR Art. 20 requires allowing users to export their data in a machine-readable format." });

  const hasObjectRight = /opt.out|unsubscribe|object to (processing|use|profiling)|withdraw consent/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "gdpr_right_to_object", label: "Right to object to processing (GDPR Art. 21)", status: hasObjectRight ? "PASS" : "WARN", detail: hasObjectRight ? "Opt-out / consent withdrawal mechanism detected." : "No opt-out or processing objection mechanism detected — GDPR Art. 21 requires a way for users to object to certain data processing activities." });

  const hasLawfulBasis = /legal basis|lawful basis|legitimate interest|consent|contract|legal obligation/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "gdpr_lawful_basis_stated", label: "Lawful basis stated in privacy policy", status: hasLawfulBasis ? "PASS" : "WARN", detail: hasLawfulBasis ? "Lawful basis for processing referenced — GDPR Art. 6 transparency addressed." : "No lawful basis stated — GDPR Art. 6 requires stating the legal basis for each type of data processing (consent, contract, legitimate interest, etc.)." });

  const hasBreachNotification = /security breach|data breach|incident notification|notify you|we will inform/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "gdpr_breach_notification", label: "Breach notification procedure (GDPR Art. 33)", status: hasBreachNotification ? "PASS" : "WARN", detail: hasBreachNotification ? "Breach notification procedure referenced." : "No breach notification procedure mentioned — GDPR Art. 33/34 requires notifying authorities within 72 hours and affected users without undue delay." });

  const hasRopa = /records of processing|processing activities|ropa|article 30/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "gdpr_records_processing", label: "Records of Processing Activities (GDPR Art. 30)", status: hasRopa ? "PASS" : "WARN", detail: hasRopa ? "Records of Processing Activities referenced." : "No ROPA reference — GDPR Art. 30 requires organisations to maintain records of all data processing activities." });

  // ─── UK & EU ────────────────────────────────────────────────────────────────

  const hasIcoReg = /ico registration|ico number|ico reg|information commissioner/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "uk_gdpr_ico_registration", label: "ICO registration number shown (UK GDPR)", status: hasIcoReg ? "PASS" : "WARN", detail: hasIcoReg ? "ICO registration reference detected." : "No ICO registration reference — UK organisations processing personal data must register with the ICO and displaying the registration number builds trust." });

  const hasEuRep = /eu representative|european representative|article 27|art\. 27/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "eu_representative_contact", label: "EU Art. 27 representative for non-EU companies", status: hasEuRep ? "PASS" : "WARN", detail: hasEuRep ? "EU Art. 27 representative referenced." : "No EU representative reference — non-EU organisations offering goods/services to EU residents must appoint an EU representative under GDPR Art. 27." });

  const hasPecr = /pecr|eprivacy|e-privacy|cookie law|uk pecr/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "eprivacy_pecr_compliance", label: "UK PECR / ePrivacy cookie compliance", status: hasPecr ? "PASS" : "WARN", detail: hasPecr ? "PECR / ePrivacy reference detected." : "No PECR/ePrivacy reference — UK PECR (implementing the ePrivacy Directive) requires specific consent for marketing emails and tracking cookies." });

  const hasDma = /digital markets act|dma compliance|gatekeeper/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "digital_markets_act", label: "EU Digital Markets Act compliance signals", status: hasDma ? "PASS" : "WARN", detail: hasDma ? "EU Digital Markets Act compliance signals detected." : "No EU Digital Markets Act reference — large platforms operating in the EU should document DMA compliance obligations." });

  const hasAiDisclosure = /powered by ai|ai-generated|ai assistant|transparency.*ai|ai disclosure/i.test(html);
  const isAiProduct = htmlLower.includes("ai") && (htmlLower.includes("generate") || htmlLower.includes("model") || htmlLower.includes("llm") || htmlLower.includes("gpt"));
  checks.push({ category: "Legal & Compliance", checkKey: "eu_ai_act_disclosure", label: "EU AI Act transparency disclosure", status: isAiProduct ? (hasAiDisclosure ? "PASS" : "WARN") : "PASS", detail: isAiProduct ? (hasAiDisclosure ? "AI transparency disclosure detected — EU AI Act requirements addressed." : "AI product detected but no explicit EU AI Act transparency disclosure found — the EU AI Act requires disclosing AI-generated content and AI system interactions.") : "Not applicable — no AI product signals detected." });

  // ─── Regional Laws ──────────────────────────────────────────────────────────

  // Brazil LGPD
  const ptBrSignals = /\.br\b/.test(ctx.hostname) || /lang=["']pt/i.test(html) || htmlLower.includes("brasil") || htmlLower.includes("brazil") || htmlLower.includes("real") && htmlLower.includes("r\$");
  if (ptBrSignals) {
    const hasLgpd = /lgpd|lei geral|proteção de dados|autoridade nacional/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "lgpd_brazil", label: "Brazil LGPD compliance", status: hasLgpd ? "PASS" : "WARN", detail: hasLgpd ? "LGPD compliance reference detected." : "Brazilian market signals detected but no LGPD reference — Brazil's LGPD requires a legal basis for processing, DPO appointment, and data subject rights similar to GDPR." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "lgpd_brazil", label: "Brazil LGPD compliance", status: "SKIPPED", detail: "No Brazilian market signals detected — skipping LGPD check." });
  }

  // Canada PIPEDA
  const caSignals = /\.ca\b/.test(ctx.hostname) || /lang=["']en-ca|lang=["']fr-ca/i.test(html) || htmlLower.includes("canada") || htmlLower.includes("canadian");
  if (caSignals) {
    const hasPipeda = /pipeda|quebec law 25|personal information protection|casl/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "pipeda_canada", label: "Canada PIPEDA / Law 25 compliance", status: hasPipeda ? "PASS" : "WARN", detail: hasPipeda ? "PIPEDA / Canadian privacy law reference detected." : "Canadian market signals detected but no PIPEDA reference — Canada's PIPEDA and Quebec Law 25 require consent for data collection and breach notification." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "pipeda_canada", label: "Canada PIPEDA / Law 25 compliance", status: "SKIPPED", detail: "No Canadian market signals detected — skipping PIPEDA check." });
  }

  // Singapore PDPA
  const sgSignals = /\.sg\b/.test(ctx.hostname) || htmlLower.includes("singapore") || htmlLower.includes("sgd");
  if (sgSignals) {
    const hasPdpaSg = /pdpa|personal data protection act.*singapore|pdpc/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "pdpa_singapore", label: "Singapore PDPA compliance", status: hasPdpaSg ? "PASS" : "WARN", detail: hasPdpaSg ? "Singapore PDPA reference detected." : "Singapore market signals detected but no PDPA reference — Singapore's Personal Data Protection Act requires consent and a data protection officer." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "pdpa_singapore", label: "Singapore PDPA compliance", status: "SKIPPED", detail: "No Singapore market signals detected." });
  }

  // Thailand PDPA
  const thSignals = /\.th\b/.test(ctx.hostname) || /lang=["']th/i.test(html) || htmlLower.includes("thailand") || htmlLower.includes("thai baht");
  if (thSignals) {
    const hasPdpaTh = /pdpa.*thailand|personal data protection.*thailand|พ\.ร\.บ/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "pdpa_thailand", label: "Thailand PDPA compliance", status: hasPdpaTh ? "PASS" : "WARN", detail: hasPdpaTh ? "Thailand PDPA reference detected." : "Thai market signals detected but no PDPA reference — Thailand's PDPA requires explicit consent and data subject rights comparable to GDPR." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "pdpa_thailand", label: "Thailand PDPA compliance", status: "SKIPPED", detail: "No Thai market signals detected." });
  }

  // South Africa POPIA
  const zaSignals = /\.za\b/.test(ctx.hostname) || htmlLower.includes("south africa") || htmlLower.includes("rand") || htmlLower.includes("zar");
  if (zaSignals) {
    const hasPopia = /popia|protection of personal information|information regulator.*south africa/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "popia_south_africa", label: "South Africa POPIA compliance", status: hasPopia ? "PASS" : "WARN", detail: hasPopia ? "POPIA reference detected." : "South African market signals detected but no POPIA reference — South Africa's POPIA requires lawful processing, consent, and a designated information officer." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "popia_south_africa", label: "South Africa POPIA compliance", status: "SKIPPED", detail: "No South African market signals detected." });
  }

  // Japan APPI
  const jpSignals = /\.jp\b/.test(ctx.hostname) || /lang=["']ja/i.test(html) || htmlLower.includes("japan") || htmlLower.includes("yen") || htmlLower.includes("¥");
  if (jpSignals) {
    const hasAppi = /appi|act on.*protection of personal information|個人情報保護/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "appi_japan", label: "Japan APPI compliance", status: hasAppi ? "PASS" : "WARN", detail: hasAppi ? "Japan APPI reference detected." : "Japanese market signals detected but no APPI reference — Japan's Act on Protection of Personal Information requires purpose limitation and breach notification." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "appi_japan", label: "Japan APPI compliance", status: "SKIPPED", detail: "No Japanese market signals detected." });
  }

  // China PIPL
  const cnSignals = /\.cn\b/.test(ctx.hostname) || /lang=["']zh/i.test(html) || htmlLower.includes("china") || htmlLower.includes("chinese") || htmlLower.includes("人民币") || htmlLower.includes("cny");
  if (cnSignals) {
    const hasPipl = /pipl|personal information protection law.*china|个人信息保护法/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "pipl_china", label: "China PIPL compliance", status: hasPipl ? "PASS" : "WARN", detail: hasPipl ? "China PIPL reference detected." : "Chinese market signals detected but no PIPL reference — China's PIPL requires separate consent for each processing purpose and a local representative for overseas processors." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "pipl_china", label: "China PIPL compliance", status: "SKIPPED", detail: "No Chinese market signals detected." });
  }

  // South Korea PIPA
  const krSignals = /\.kr\b/.test(ctx.hostname) || /lang=["']ko/i.test(html) || htmlLower.includes("korea") || htmlLower.includes("korean won") || htmlLower.includes("₩");
  if (krSignals) {
    const hasPipa = /pipa.*korea|personal information protection act.*korea|개인정보 보호법/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "pipa_korea", label: "South Korea PIPA compliance", status: hasPipa ? "PASS" : "WARN", detail: hasPipa ? "South Korea PIPA reference detected." : "Korean market signals detected but no PIPA reference — South Korea's PIPA is one of the world's strictest privacy laws, requiring explicit consent and mandatory breach notification within 24 hours." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "pipa_korea", label: "South Korea PIPA compliance", status: "SKIPPED", detail: "No Korean market signals detected." });
  }

  // India DPDP
  const inSignals = /\.in\b/.test(ctx.hostname) || /lang=["']hi/i.test(html) || htmlLower.includes("india") || htmlLower.includes("indian") || htmlLower.includes("rupee") || htmlLower.includes("₹");
  if (inSignals) {
    const hasDpdp = /dpdp|digital personal data protection|data protection board.*india/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "dpdp_india", label: "India DPDP Act compliance", status: hasDpdp ? "PASS" : "WARN", detail: hasDpdp ? "India DPDP Act reference detected." : "Indian market signals detected but no DPDP reference — India's Digital Personal Data Protection Act 2023 requires consent notices in multiple languages and data subject rights." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "dpdp_india", label: "India DPDP Act compliance", status: "SKIPPED", detail: "No Indian market signals detected." });
  }

  // Australia Privacy Act
  const auSignals = /\.au\b/.test(ctx.hostname) || htmlLower.includes("australia") || htmlLower.includes("australian") || htmlLower.includes("aud") || htmlLower.includes("a\$");
  if (auSignals) {
    const hasAuPrivacy = /australian privacy act|privacy act.*1988|oaic|office of the australian information commissioner/i.test(html);
    checks.push({ category: "Legal & Compliance", checkKey: "australian_privacy_act", label: "Australian Privacy Act compliance", status: hasAuPrivacy ? "PASS" : "WARN", detail: hasAuPrivacy ? "Australian Privacy Act reference detected." : "Australian market signals detected but no Privacy Act reference — the Australian Privacy Act (13 APPs) applies to organisations with >$3M revenue and requires specific privacy policy content." });
  } else {
    checks.push({ category: "Legal & Compliance", checkKey: "australian_privacy_act", label: "Australian Privacy Act compliance", status: "SKIPPED", detail: "No Australian market signals detected." });
  }

  // ─── Industry-Specific ──────────────────────────────────────────────────────

  const hasHipaa = /hipaa|business associate agreement|baa|protected health information|phi\b|healthcare compliance/i.test(html);
  const isHealthcare = htmlLower.includes("health") || htmlLower.includes("medical") || htmlLower.includes("patient") || htmlLower.includes("clinical");
  checks.push({ category: "Legal & Compliance", checkKey: "hipaa_signals", label: "HIPAA compliance signals (healthcare)", status: isHealthcare ? (hasHipaa ? "PASS" : "WARN") : "PASS", detail: isHealthcare ? (hasHipaa ? "HIPAA compliance signals detected (BAA, PHI handling referenced)." : "Healthcare content detected but no HIPAA reference — if handling US patient data, HIPAA requires a BAA with all vendors and strict PHI controls.") : "Not applicable — no healthcare product signals detected." });

  const hasPci = /pci.dss|pci compliance|saq|scope reduction|cardholder data environment/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "pci_dss_scope_reduction", label: "PCI DSS scope reduction evidence", status: ctx.ctx.isPaymentEnabled ? (hasPci ? "PASS" : "WARN") : "PASS", detail: ctx.ctx.isPaymentEnabled ? (hasPci ? "PCI DSS compliance reference detected." : "Payment processing detected but no PCI DSS reference — document scope reduction strategies (SAQ, tokenisation) to reduce liability.") : "Not applicable — no payment processing detected." });

  const hasFerpa = /ferpa|family educational rights|student records|educational records/i.test(html);
  const isEducation = htmlLower.includes("student") || htmlLower.includes("school") || htmlLower.includes("university") || htmlLower.includes("education");
  checks.push({ category: "Legal & Compliance", checkKey: "ferpa_signals", label: "FERPA compliance signals (education)", status: isEducation ? (hasFerpa ? "PASS" : "WARN") : "PASS", detail: isEducation ? (hasFerpa ? "FERPA compliance signals detected." : "Educational content detected but no FERPA reference — US education platforms handling student records must comply with FERPA.") : "Not applicable — no education product signals detected." });

  // ─── Consumer & E-commerce ──────────────────────────────────────────────────

  const hasCoolingOff = /14.day|14 day.*cancel|cooling.off|right to cancel.*14/i.test(html);
  const isEcommerce = ctx.ctx.isPaymentEnabled;
  checks.push({ category: "Legal & Compliance", checkKey: "cooling_off_period_eu", label: "EU 14-day cancellation right stated", status: isEcommerce ? (hasCoolingOff ? "PASS" : "WARN") : "PASS", detail: isEcommerce ? (hasCoolingOff ? "14-day cancellation right referenced — EU Consumer Rights Directive addressed." : "Payment processing detected but no EU 14-day cancellation right — EU Consumer Rights Directive 2011/83/EU requires clear information about the 14-day withdrawal right.") : "Not applicable — no e-commerce signals detected." });

  const hasAutoRenewal = /auto.renew|automatically renew|subscription.*renew|renewal.*subscription/i.test(html);
  const hasSubSignals = htmlLower.includes("subscription") || htmlLower.includes("recurring");
  checks.push({ category: "Legal & Compliance", checkKey: "auto_renewal_disclosure", label: "Auto-renewal terms prominently disclosed", status: hasSubSignals ? (hasAutoRenewal ? "PASS" : "WARN") : "PASS", detail: hasSubSignals ? (hasAutoRenewal ? "Auto-renewal disclosure detected." : "Subscription detected but no auto-renewal disclosure — many jurisdictions (US states, EU, UK) require prominent disclosure of auto-renewal terms.") : "No subscription signals detected." });

  const hasEasyCancellation = /cancel.*(anytime|subscription|plan|account)|unsubscribe|no.*lock.in/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "subscription_cancellation_easy", label: "Easy cancellation (FTC click-to-cancel)", status: hasSubSignals ? (hasEasyCancellation ? "PASS" : "WARN") : "PASS", detail: hasSubSignals ? (hasEasyCancellation ? "Easy cancellation messaging detected." : "Subscription detected but no easy cancellation signal — FTC's click-to-cancel rule requires cancellation to be as easy as sign-up.") : "No subscription signals detected." });

  const hasVat = /incl.*vat|including.*vat|inc\. vat|tax included|\+ vat/i.test(html);
  const hasEuSignals = /\.eu\b/.test(ctx.hostname) || /\.de\b/.test(ctx.hostname) || /\.fr\b/.test(ctx.hostname) || /\.nl\b/.test(ctx.hostname) || htmlLower.includes("european union") || htmlLower.includes("€") || htmlLower.includes("eur");
  checks.push({ category: "Legal & Compliance", checkKey: "price_vat_inclusive", label: "Prices shown inc. VAT (EU requirement)", status: hasEuSignals && isEcommerce ? (hasVat ? "PASS" : "WARN") : "PASS", detail: hasEuSignals && isEcommerce ? (hasVat ? "VAT-inclusive pricing detected." : "EU market signals with pricing detected — EU Consumer Rights Directive requires prices shown to consumers to include VAT and all taxes.") : "Not applicable — no EU e-commerce signals detected." });

  const hasDistanceSelling = /distance (selling|contract)|right of withdrawal|eu.*consumer|consumer.*directive/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "distance_selling_notice", label: "EU Distance Selling regulations disclosure", status: hasEuSignals && isEcommerce ? (hasDistanceSelling ? "PASS" : "WARN") : "PASS", detail: hasEuSignals && isEcommerce ? (hasDistanceSelling ? "Distance selling disclosure detected." : "EU e-commerce signals detected but no distance selling notice — EU Distance Selling Regulations require pre-contract information on your identity, goods, and cancellation rights.") : "Not applicable." });

  const hasCopyright = /copyright|©|\(c\)\s*20[0-9]{2}/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "intellectual_property_notice", label: "Copyright notice present", status: hasCopyright ? "PASS" : "WARN", detail: hasCopyright ? "Copyright notice detected." : "No copyright notice found — add a © copyright notice to assert intellectual property ownership." });

  const hasDmca = /dmca|digital millennium copyright|takedown (procedure|request|notice)|copyright claim/i.test(html);
  checks.push({ category: "Legal & Compliance", checkKey: "dmca_policy", label: "DMCA takedown procedure", status: hasDmca ? "PASS" : "WARN", detail: hasDmca ? "DMCA takedown procedure referenced." : "No DMCA procedure referenced — US platforms hosting user content should document a DMCA takedown procedure for safe harbour protection." });

  const hasAgeGate = /age (verification|gate|check)|you must be (18|13|16|21)|are you (18|13|16|21)|confirm.*age/i.test(html);
  const hasAgeRestricted = htmlLower.includes("alcohol") || htmlLower.includes("gambling") || htmlLower.includes("cannabis") || htmlLower.includes("tobacco") || htmlLower.includes("adult content");
  checks.push({ category: "Legal & Compliance", checkKey: "age_gate", label: "Age verification / age gate", status: hasAgeRestricted ? (hasAgeGate ? "PASS" : "WARN") : "PASS", detail: hasAgeRestricted ? (hasAgeGate ? "Age verification detected." : "Age-restricted content detected but no age gate — many jurisdictions legally require age verification for alcohol, gambling, adult content, and tobacco.") : "Not applicable — no age-restricted content signals detected." });

  const hasB2bTerms = /service level agreement|sla|enterprise (agreement|terms)|master (service|subscription) agreement|msa\b/i.test(html);
  const isB2b = htmlLower.includes("enterprise") || htmlLower.includes("team plan") || htmlLower.includes("b2b") || htmlLower.includes("business plan");
  checks.push({ category: "Legal & Compliance", checkKey: "contract_terms_b2b", label: "B2B contract terms / SLA documented", status: isB2b ? (hasB2bTerms ? "PASS" : "WARN") : "PASS", detail: isB2b ? (hasB2bTerms ? "B2B contract terms or SLA referenced." : "B2B product signals detected but no SLA/MSA — enterprise buyers expect documented service levels and master service agreements before signing.") : "Not applicable — no B2B signals detected." });

  return checks;
}
