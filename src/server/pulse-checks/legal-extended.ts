import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";
import { documentLanguage, stripNonMarketContext } from "./jurisdictions";

export async function runLegalExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult, htmlLower } = ctx;
  const html = pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  // ─── GDPR Articles ─────────────────────────────────────────────────────────

  const hasDataNotice = /what (data|information) we collect|information we (collect|process)|data we (collect|process)/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "gdpr_article13_notice", label: "Data collection notice (GDPR Art. 13/14)", status: hasDataNotice ? "PASS" : "WARN", detail: hasDataNotice ? "Data collection notice detected — GDPR Art. 13/14 transparency requirement addressed." : "No clear data collection notice detected — GDPR requires informing users what data you collect and why at point of collection." });

  const hasAccessRight = /access (your|my) (data|information)|download (your|my) data|data (access|subject access request)/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "gdpr_right_to_access", label: "Right to access data (GDPR Art. 15)", status: hasAccessRight ? "PASS" : "WARN", detail: hasAccessRight ? "Data access mechanism detected — GDPR Art. 15 right to access addressed." : "No data access mechanism detected — GDPR Art. 15 requires providing users a way to access the personal data you hold on them." });

  const hasErasureUi = /delete (my|your|account|data)|right to (erasure|deletion)|remove (my|your) (account|data)|close (my|your) account/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "gdpr_right_to_erasure_ui", label: "Right to erasure UI (GDPR Art. 17)", status: hasErasureUi ? "PASS" : "WARN", detail: hasErasureUi ? "Account/data deletion mechanism detected — GDPR Art. 17 right to erasure addressed." : "No data deletion mechanism detected — GDPR Art. 17 requires a clear way for users to request deletion of their personal data." });

  const hasPortability = /export (your|my|our) data|download (your|my|our) data|data portability/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "gdpr_right_to_portability", label: "Data portability (GDPR Art. 20)", status: hasPortability ? "PASS" : "WARN", detail: hasPortability ? "Data export/portability option detected — GDPR Art. 20 addressed." : "No data portability option detected — GDPR Art. 20 requires allowing users to export their data in a machine-readable format." });

  const hasObjectRight = /opt.out|unsubscribe|object to (processing|use|profiling)|withdraw consent/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "gdpr_right_to_object", label: "Right to object to processing (GDPR Art. 21)", status: hasObjectRight ? "PASS" : "WARN", detail: hasObjectRight ? "Opt-out / consent withdrawal mechanism detected." : "No opt-out or processing objection mechanism detected — GDPR Art. 21 requires a way for users to object to certain data processing activities." });

  const hasLawfulBasis = /legal basis|lawful basis|legitimate interest|consent|contract|legal obligation/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "gdpr_lawful_basis_stated", label: "Lawful basis stated in privacy policy", status: hasLawfulBasis ? "PASS" : "WARN", detail: hasLawfulBasis ? "Lawful basis for processing referenced — GDPR Art. 6 transparency addressed." : "No lawful basis stated — GDPR Art. 6 requires stating the legal basis for each type of data processing (consent, contract, legitimate interest, etc.)." });

  const hasBreachNotification = /security breach|data breach|incident notification|notify you|we will inform/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "gdpr_breach_notification", label: "Breach notification procedure (GDPR Art. 33)", status: hasBreachNotification ? "PASS" : "WARN", detail: hasBreachNotification ? "Breach notification procedure referenced." : "No breach notification procedure mentioned — GDPR Art. 33/34 requires notifying authorities within 72 hours and affected users without undue delay." });

  const hasRopa = /records of processing|processing activities|ropa|article 30/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "gdpr_records_processing", label: "Records of Processing Activities (GDPR Art. 30)", status: hasRopa ? "PASS" : "WARN", detail: hasRopa ? "Records of Processing Activities referenced." : "No ROPA reference — GDPR Art. 30 requires organisations to maintain records of all data processing activities." });

  // ─── UK & EU ────────────────────────────────────────────────────────────────

  const hasIcoReg = /ico registration|ico number|ico reg|information commissioner/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "uk_gdpr_ico_registration", label: "ICO registration number shown (UK GDPR)", status: hasIcoReg ? "PASS" : "WARN", detail: hasIcoReg ? "ICO registration reference detected." : "No ICO registration reference — UK organisations processing personal data must register with the ICO and displaying the registration number builds trust." });

  const hasEuRep = /eu representative|european representative|article 27|art\. 27/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "eu_representative_contact", label: "EU Art. 27 representative for non-EU companies", status: hasEuRep ? "PASS" : "WARN", detail: hasEuRep ? "EU Art. 27 representative referenced." : "No EU representative reference — non-EU organisations offering goods/services to EU residents must appoint an EU representative under GDPR Art. 27." });

  const hasPecr = /pecr|eprivacy|e-privacy|cookie law|uk pecr/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "eprivacy_pecr_compliance", label: "UK PECR / ePrivacy cookie compliance", status: hasPecr ? "PASS" : "WARN", detail: hasPecr ? "PECR / ePrivacy reference detected." : "No PECR/ePrivacy reference — UK PECR (implementing the ePrivacy Directive) requires specific consent for marketing emails and tracking cookies." });

  const hasDma = /digital markets act|dma compliance|gatekeeper/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "digital_markets_act", label: "EU Digital Markets Act compliance signals", status: hasDma ? "PASS" : "WARN", detail: hasDma ? "EU Digital Markets Act compliance signals detected." : "No EU Digital Markets Act reference — large platforms operating in the EU should document DMA compliance obligations." });

  // ─── Market signals and visible text ───────────────────────────────────────

  // Only things a site chooses market-by-market count as market signals: its ccTLD,
  // the region of its own <html lang>, a local-currency PRICE, a local phone prefix,
  // or a local company form / registration number in VISIBLE text. A country name in
  // a news headline ("Singapore says…"), a URL parameter (`sid=…,cny`), a script string
  // (`encodeURIComponent` contains "eur", `sentry-sample_rand` contains "rand") or an
  // hreflang alternate (`hreflang="en-CA"`) says nothing about the markets served.
  // Entities decoded first so "Rs.&nbsp;499", "&#8377;499" or "$49&nbsp;CAD" still read as prices.
  const proseHtml = stripNonMarketContext(html);
  const visibleText = proseHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&#36;|&#x24;|&dollar;/gi, "$")
    .replace(/&#163;|&pound;/gi, "£")
    .replace(/&yen;|&#165;/gi, "¥")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
  const marketText = visibleText.toLowerCase();
  const docLang = documentLanguage(html) ?? "";
  const docPrimary = docLang.split("-")[0] ?? "";
  const docRegion = docLang.split("-")[1] ?? "";

  // ─── EU AI Act ──────────────────────────────────────────────────────────────

  // An AI product is established from what the page RUNS or SAYS ABOUT ITSELF, never
  // from the letters "ai" (which are inside "email", "contain", "maintain", "detail").
  //   • a model API called from the page, or an AI chat widget it loads;
  //   • a word-bounded, upper-case "AI" (or LLM/GPT/generative AI) beside a product noun
  //     in visible text: "AI assistant", "AI-powered search", "powered by GPT-4".
  const aiRuntime = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.(?:ai|com)|\/api\/(?:chat|completions?|ai|assistant)(?=[/?"'])|(?:www\.)?chatbase\.co\/embed|cdn\.voiceflow\.com|cdn\.botpress\.cloud|widget\.kapa\.ai|docsbot\.ai\/chat|sitegpt\.ai|inkeep\.com|mendable\.ai/i.exec(html)?.[0];
  const aiClaim = /\b(?:AI|A\.I\.)(?:[- ](?:powered|driven|generated|assistants?|agents?|chat(?:bot)?s?|copilots?|models?|features?|search|writer|writing|tools?|platform|answers?))\b|\b(?:[Pp]owered by|[Bb]uilt (?:on|with)|[Uu]ses?|[Uu]sing)\s+(?:AI|GPT-?\d[\w.]*|ChatGPT|Claude|Gemini|LLMs?|large language models?)\b|\bgenerative AI\b|\blarge language models?\b|\bLLM-powered\b/.exec(visibleText)?.[0];
  const isAiProduct = Boolean(aiRuntime || aiClaim);
  const aiDisclosure = /\b(?:powered by (?:AI|artificial intelligence)|AI[- ]generated|generated (?:by|with|using) (?:AI|artificial intelligence)|(?:you are|you're) (?:chatting|talking|speaking) (?:with|to) an? (?:AI|bot|virtual assistant)|AI assistant|AI disclosure|use of AI|how we use AI)\b/i.exec(visibleText)?.[0];
  const aiEvidence = aiRuntime ? `the page loads ${aiRuntime}` : `the page says "${aiClaim}"`;
  checks.push({
    category: CATEGORIES.LEGAL,
    checkKey: "eu_ai_act_disclosure",
    label: "AI use stated to users",
    ...(!isAiProduct
      ? { status: "SKIPPED" as const, detail: "No AI feature found on the scanned page (no model API or AI chat widget loaded, and the page does not describe an AI feature)." }
      : aiDisclosure
        ? { status: "PASS" as const, detail: `AI feature found (${aiEvidence}) and the scanned page tells users AI is involved ("${aiDisclosure}"). Pulse checked this page only; it did not assess whether each AI interaction or generated output is labelled as the EU AI Act (Art. 50) requires.` }
        : { status: "INCONCLUSIVE" as const, confidence: "LOW" as const, confidenceReason: "AI disclosure is shown where the AI is used — inside the chat window or next to generated content — which a homepage scan does not see.", detail: `AI feature found (${aiEvidence}), but the scanned page does not say AI is in use. The EU AI Act (Art. 50) requires telling people when they interact with an AI system or see AI-generated content; that notice normally sits inside the chat window or beside the output, which this scan cannot see, so neither a pass nor a gap can be claimed. Check the AI surface itself.` }),
  });

  // ─── Regional Laws ──────────────────────────────────────────────────────────

  // One approach for every region: the check runs only when the page carries a real
  // market signal, and it reports only what it can see — whether the scanned page names
  // the law. A page that does not name it is INCONCLUSIVE, never WARN: privacy-law
  // references live on the privacy policy, which this check does not read.
  const phone = (cc: string) => new RegExp(String.raw`\+${cc}[\s.-]?\(?0?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b`).test(visibleText);
  type Region = { checkKey: string; country: string; law: string; label: string; signals: Array<[boolean, string]>; mentions: RegExp };
  const regions: Region[] = [
    {
      // A CNPJ (Brazilian company registration, required on Brazilian e-commerce sites by
      // Decreto 7.962/2013) identifies a Brazilian business even on an English .com.
      checkKey: "lgpd_brazil", country: "Brazilian", law: "LGPD", label: "Brazil: page mentions LGPD",
      signals: [
        [/\.br$/.test(ctx.hostname), ".br domain"],
        [docRegion === "br" || docLang === "pt", `page language "${docLang}"`],
        [/\br\$\s?\d/.test(marketText), "R$ price"],
        [/\bcnpj\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(marketText), "CNPJ registration"],
      ],
      mentions: /\blgpd\b|lei geral de prote[çc][ãa]o de dados|\bautoridade nacional de prote[çc][ãa]o de dados\b|\banpd\b/i,
    },
    {
      // "CAD" only beside a price ("$49 CAD", "CAD $49", "CAD 49.99") — CAD is also software
      // vocabulary, and "CAD 3D" / "CAD 2024" are not prices.
      checkKey: "pipeda_canada", country: "Canadian", law: "PIPEDA / Quebec Law 25", label: "Canada: page mentions PIPEDA / Law 25",
      signals: [
        [/\.ca$/.test(ctx.hostname), ".ca domain"],
        [docRegion === "ca", `page language "${docLang}"`],
        [/\b(?:ca|c)\$\s?\d/.test(marketText) || /\$\s?\d[\d,.]*\s?cad\b|\bcad\s?\$\s?\d|\bcad\s?\d[\d,]*\.\d{2}\b/.test(marketText), "CAD price"],
      ],
      mentions: /\bpipeda\b|personal information protection and electronic documents act|\b(?:quebec|québec) law 25\b|\bloi 25\b|\bcasl\b/i,
    },
    {
      // "Pte. Ltd." is a Singapore company form — the business stating its own identity,
      // which a headline about Singapore cannot fake.
      checkKey: "pdpa_singapore", country: "Singapore", law: "Singapore's PDPA", label: "Singapore: page mentions the PDPA",
      signals: [
        [/\.sg$/.test(ctx.hostname), ".sg domain"],
        [docRegion === "sg", `page language "${docLang}"`],
        [/\bsgd\s?\$?\s?\d|\d\s?sgd\b|\bs\$\s?\d/.test(marketText), "SGD price"],
        [/\bpte\.?\s+ltd\b/.test(marketText), "Pte. Ltd. company"],
        [phone("65"), "+65 phone number"],
      ],
      mentions: /\bpdpa\b|personal data protection act[^.<]{0,40}singapore|\bpdpc\b/i,
    },
    {
      checkKey: "pdpa_thailand", country: "Thai", law: "Thailand's PDPA", label: "Thailand: page mentions the PDPA",
      signals: [
        [/\.th$/.test(ctx.hostname), ".th domain"],
        [docPrimary === "th" || docRegion === "th", `page language "${docLang}"`],
        [/฿\s?\d|\d\s?฿|\bthb\s?\d|\d\s?thb\b|\d\s?บาท/.test(marketText), "Thai baht price"],
        [phone("66"), "+66 phone number"],
      ],
      mentions: /\bpdpa\b[^.<]{0,40}thailand|thailand[^.<]{0,40}\bpdpa\b|personal data protection act[^.<]{0,40}(?:thailand|b\.e\. 2562)|พ\.ร\.บ\.\s*คุ้มครองข้อมูลส่วนบุคคล/i,
    },
    {
      // "rand"/"zar" are not market signals: they are inside "brand", "random",
      // "bizarre", "bazaar" and `sentry-sample_rand`. A rand PRICE is ("R 1 299,00",
      // "ZAR 499"), as is the South African "(Pty) Ltd" form or a +27 number.
      checkKey: "popia_south_africa", country: "South African", law: "POPIA", label: "South Africa: page mentions POPIA",
      signals: [
        [/\.za$/.test(ctx.hostname), ".za domain"],
        [docRegion === "za", `page language "${docLang}"`],
        [/\bzar\s?\d|\d\s?zar\b/.test(marketText) || /(?:^|[\s(])R\s?\d{1,3}(?:[ ,]\d{3})*[.,]\d{2}\b/.test(visibleText), "rand price"],
        [/\(pty\)\s*ltd\b/.test(marketText), "(Pty) Ltd company"],
        [phone("27"), "+27 phone number"],
      ],
      mentions: /\bpopia\b|protection of personal information act|information regulator[^.<]{0,40}south africa/i,
    },
    {
      // "yen" is inside "Bayern"/"yen" prose, and "¥" is also the yuan sign. A price in
      // 円, a JPY price, the 株式会社 company form or a +81 number is Japanese.
      checkKey: "appi_japan", country: "Japanese", law: "Japan's APPI", label: "Japan: page mentions the APPI",
      signals: [
        [/\.jp$/.test(ctx.hostname), ".jp domain"],
        [docPrimary === "ja" || docRegion === "jp", `page language "${docLang}"`],
        [/\d\s?円|\bjpy\s?¥?\s?\d|\d\s?jpy\b|税込/.test(marketText), "yen price"],
        [/株式会社|\bkabushiki kaisha\b|\bk\.k\.(?=\s|$)/.test(marketText), "Japanese company form"],
        [phone("81"), "+81 phone number"],
      ],
      mentions: /\bAPPI\b|act on (?:the )?protection of personal information|個人情報(?:の)?保護/i,
    },
    {
      // zh-TW / zh-HK are not mainland China. An ICP filing number ("京ICP备…") must be
      // displayed by every site hosted in mainland China; an RMB price is local pricing.
      checkKey: "pipl_china", country: "Chinese", law: "China's PIPL", label: "China: page mentions the PIPL",
      signals: [
        [/\.cn$/.test(ctx.hostname), ".cn domain"],
        [/^zh(?:-hans)?(?:-cn)?$/.test(docLang), `page language "${docLang}"`],
        [marketText.includes("人民币") || /\bcny\b/.test(marketText) || /\brmb\s?¥?\s?\d|\d\s?rmb\b/.test(marketText), "RMB price"],
        [/icp[备證证]/.test(marketText), "ICP filing number"],
      ],
      mentions: /\bpipl\b|personal information protection law[^.<]{0,40}china|个人信息保护法/i,
    },
    {
      // "korea" in a headline is not a market. A won price, the 주식회사 company form or a
      // +82 number is.
      checkKey: "pipa_korea", country: "Korean", law: "South Korea's PIPA", label: "South Korea: page mentions PIPA",
      signals: [
        [/\.kr$/.test(ctx.hostname), ".kr domain"],
        [docPrimary === "ko" || docRegion === "kr", `page language "${docLang}"`],
        [/₩\s?\d|\d\s?₩|\bkrw\s?\d|\d\s?krw\b|\d\s?원(?![가-힣])/.test(marketText), "won price"],
        [/주식회사/.test(marketText), "Korean company form"],
        [phone("82"), "+82 phone number"],
      ],
      mentions: /\bpipa\b[^.<]{0,40}korea|korea[^.<]{0,40}\bpipa\b|personal information protection act[^.<]{0,40}korea|개인정보\s?보호법/i,
    },
    {
      // "Rs. 499" / "INR 499" only beside an amount.
      checkKey: "dpdp_india", country: "Indian", law: "India's DPDP Act", label: "India: page mentions the DPDP Act",
      signals: [
        [/\.in$/.test(ctx.hostname), ".in domain"],
        [docPrimary === "hi" || docRegion === "in", `page language "${docLang}"`],
        [marketText.includes("₹") || /\brs\.?\s?\d|\binr\s?\d|\d\s?inr\b/.test(marketText), "rupee price"],
      ],
      mentions: /\bdpdp\b|digital personal data protection|data protection board[^.<]{0,40}india/i,
    },
    {
      // "aud" is inside "audio", "audit", "audience", "fraud" and "claude"; "a$" is a
      // minified-JS identifier. An AUD price, an ABN or a +61 number is Australian.
      checkKey: "australian_privacy_act", country: "Australian", law: "the Australian Privacy Act", label: "Australia: page mentions the Privacy Act",
      signals: [
        [/\.au$/.test(ctx.hostname), ".au domain"],
        [docRegion === "au", `page language "${docLang}"`],
        [/\b(?:a|au)\$\s?\d/.test(marketText) || /\$\s?\d[\d,.]*\s?aud\b|\baud\s?\$?\s?\d/.test(marketText), "AUD price"],
        [/\babn\b:?\s*\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/.test(marketText), "ABN"],
        [phone("61"), "+61 phone number"],
      ],
      mentions: /\b(?:australian )?privacy act 1988\b|australian privacy act|australian privacy principles|\boaic\b|office of the australian information commissioner/i,
    },
  ];
  for (const region of regions) {
    const reasons = region.signals.filter(([hit]) => hit).map(([, why]) => why);
    if (reasons.length === 0) {
      checks.push({ category: CATEGORIES.LEGAL, checkKey: region.checkKey, label: region.label, status: "SKIPPED", detail: `No ${region.country} market signals on the scanned page (domain, page language, local-currency price, local phone number or company registration) — skipping the ${region.law} check.` });
      continue;
    }
    const mention = region.mentions.exec(proseHtml)?.[0];
    const why = reasons.join(", ");
    checks.push(mention
      ? { category: CATEGORIES.LEGAL, checkKey: region.checkKey, label: region.label, status: "PASS", detail: `${region.country} market signals found (${why}) and the scanned page mentions ${region.law} ("${mention}"). This shows the law is referenced; Pulse did not assess compliance with it.` }
      : { category: CATEGORIES.LEGAL, checkKey: region.checkKey, label: region.label, status: "INCONCLUSIVE", confidence: "LOW", confidenceReason: "Privacy-law references normally sit on the privacy policy, which this check does not read.", detail: `${region.country} market signals found (${why}), but the scanned page does not mention ${region.law}. That is normally covered on the privacy policy rather than the homepage, so its absence here is not evidence of a gap — check the privacy policy names ${region.law} and the rights it gives.` });
  }

  // ─── Industry-Specific ──────────────────────────────────────────────────────

  const hasHipaa = /hipaa|business associate agreement|baa|protected health information|phi\b|healthcare compliance/i.test(html);
  const isHealthcare = htmlLower.includes("health") || htmlLower.includes("medical") || htmlLower.includes("patient") || htmlLower.includes("clinical");
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "hipaa_signals", label: "HIPAA compliance signals (healthcare)", status: isHealthcare ? (hasHipaa ? "PASS" : "WARN") : "PASS", detail: isHealthcare ? (hasHipaa ? "HIPAA compliance signals detected (BAA, PHI handling referenced)." : "Healthcare content detected but no HIPAA reference — if handling US patient data, HIPAA requires a BAA with all vendors and strict PHI controls.") : "Not applicable — no healthcare product signals detected." });

  const hasPci = /pci.dss|pci compliance|saq|scope reduction|cardholder data environment/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "pci_dss_scope_reduction", label: "PCI DSS scope reduction evidence", status: ctx.ctx.isPaymentEnabled ? (hasPci ? "PASS" : "WARN") : "PASS", detail: ctx.ctx.isPaymentEnabled ? (hasPci ? "PCI DSS compliance reference detected." : "Payment processing detected but no PCI DSS reference — document scope reduction strategies (SAQ, tokenisation) to reduce liability.") : "Not applicable — no payment processing detected." });

  const hasFerpa = /ferpa|family educational rights|student records|educational records/i.test(html);
  const isEducation = htmlLower.includes("student") || htmlLower.includes("school") || htmlLower.includes("university") || htmlLower.includes("education");
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "ferpa_signals", label: "FERPA compliance signals (education)", status: isEducation ? (hasFerpa ? "PASS" : "WARN") : "PASS", detail: isEducation ? (hasFerpa ? "FERPA compliance signals detected." : "Educational content detected but no FERPA reference — US education platforms handling student records must comply with FERPA.") : "Not applicable — no education product signals detected." });

  // ─── Consumer & E-commerce ──────────────────────────────────────────────────

  const hasCoolingOff = /14.day|14 day.*cancel|cooling.off|right to cancel.*14/i.test(html);
  const isEcommerce = ctx.ctx.isPaymentEnabled;
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "cooling_off_period_eu", label: "EU 14-day cancellation right stated", status: isEcommerce ? (hasCoolingOff ? "PASS" : "WARN") : "PASS", detail: isEcommerce ? (hasCoolingOff ? "14-day cancellation right referenced — EU Consumer Rights Directive addressed." : "Payment processing detected but no EU 14-day cancellation right — EU Consumer Rights Directive 2011/83/EU requires clear information about the 14-day withdrawal right.") : "Not applicable — no e-commerce signals detected." });

  const hasAutoRenewal = /auto.renew|automatically renew|subscription.*renew|renewal.*subscription/i.test(html);
  const hasSubSignals = htmlLower.includes("subscription") || htmlLower.includes("recurring");
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "auto_renewal_disclosure", label: "Auto-renewal terms prominently disclosed", status: hasSubSignals ? (hasAutoRenewal ? "PASS" : "WARN") : "PASS", detail: hasSubSignals ? (hasAutoRenewal ? "Auto-renewal disclosure detected." : "Subscription detected but no auto-renewal disclosure — many jurisdictions (US states, EU, UK) require prominent disclosure of auto-renewal terms.") : "No subscription signals detected." });

  const hasEasyCancellation = /cancel.*(anytime|subscription|plan|account)|unsubscribe|no.*lock.in/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "subscription_cancellation_easy", label: "Easy cancellation (FTC click-to-cancel)", status: hasSubSignals ? (hasEasyCancellation ? "PASS" : "WARN") : "PASS", detail: hasSubSignals ? (hasEasyCancellation ? "Easy cancellation messaging detected." : "Subscription detected but no easy cancellation signal — FTC's click-to-cancel rule requires cancellation to be as easy as sign-up.") : "No subscription signals detected." });

  const hasVat = /incl.*vat|including.*vat|inc\. vat|tax included|\+ vat/i.test(html);
  const hasEuSignals = /\.eu\b/.test(ctx.hostname) || /\.de\b/.test(ctx.hostname) || /\.fr\b/.test(ctx.hostname) || /\.nl\b/.test(ctx.hostname) || marketText.includes("european union") || marketText.includes("€") || marketText.includes("&euro;") || /\beur\b/.test(marketText);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "price_vat_inclusive", label: "Prices shown inc. VAT (EU requirement)", status: hasEuSignals && isEcommerce ? (hasVat ? "PASS" : "WARN") : "PASS", detail: hasEuSignals && isEcommerce ? (hasVat ? "VAT-inclusive pricing detected." : "EU market signals with pricing detected — EU Consumer Rights Directive requires prices shown to consumers to include VAT and all taxes.") : "Not applicable — no EU e-commerce signals detected." });

  const hasDistanceSelling = /distance (selling|contract)|right of withdrawal|eu.*consumer|consumer.*directive/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "distance_selling_notice", label: "EU Distance Selling regulations disclosure", status: hasEuSignals && isEcommerce ? (hasDistanceSelling ? "PASS" : "WARN") : "PASS", detail: hasEuSignals && isEcommerce ? (hasDistanceSelling ? "Distance selling disclosure detected." : "EU e-commerce signals detected but no distance selling notice — EU Distance Selling Regulations require pre-contract information on your identity, goods, and cancellation rights.") : "Not applicable." });

  const hasCopyright = /copyright|©|\(c\)\s*20[0-9]{2}/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "intellectual_property_notice", label: "Copyright notice present", status: hasCopyright ? "PASS" : "WARN", detail: hasCopyright ? "Copyright notice detected." : "No copyright notice found — add a © copyright notice to assert intellectual property ownership." });

  const hasDmca = /dmca|digital millennium copyright|takedown (procedure|request|notice)|copyright claim/i.test(html);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "dmca_policy", label: "DMCA takedown procedure", status: hasDmca ? "PASS" : "WARN", detail: hasDmca ? "DMCA takedown procedure referenced." : "No DMCA procedure referenced — US platforms hosting user content should document a DMCA takedown procedure for safe harbour protection." });

  const hasAgeGate = /age (verification|gate|check)|you must be (18|13|16|21)|are you (18|13|16|21)|confirm.*age/i.test(html);
  // Gate on what the SITE is (its <title> and meta description), not on any word in
  // its body: theguardian.com/uk carries a "...promote gambling site..." headline and
  // is not an age-restricted business. Retail vocabulary (wine, spirits, casino,
  // betting, vape) is included so real age-restricted sellers are still caught.
  const siteSummary = `${/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""} ${/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i.exec(html)?.[0] ?? ""}`.toLowerCase();
  // A seller whose title says nothing ("JUUL Login | JUUL") still prints the statutory
  // or responsibility markers only age-restricted sellers carry.
  const hasRegulatoryMarker = /contains nicotine|nicotine is (?:an? )?(?:highly )?addictive|age[- ]restricted (?:product|item|goods)|begambleaware\.org|gamble responsibly|please drink responsibly|drinkaware\.co\.uk/.test(marketText);
  const hasAgeRestricted = hasRegulatoryMarker || /alcohol|gambling|cannabis|tobacco|adult content|casino|betting|sportsbook|\bvap(?:e|es|ing)\b|e-?cigarette|liquor|\bwines?\b|\bbeers?\b|\bspirits\b|whiske?y|\bcbd\b/.test(siteSummary);
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "age_gate", label: "Age verification / age gate", status: hasAgeRestricted ? (hasAgeGate ? "PASS" : "WARN") : "PASS", detail: hasAgeRestricted ? (hasAgeGate ? "Age verification detected." : "Age-restricted content detected but no age gate — many jurisdictions legally require age verification for alcohol, gambling, adult content, and tobacco.") : "Not applicable — no age-restricted content signals detected." });

  const hasB2bTerms = /service level agreement|sla|enterprise (agreement|terms)|master (service|subscription) agreement|msa\b/i.test(html);
  const isB2b = htmlLower.includes("enterprise") || htmlLower.includes("team plan") || htmlLower.includes("b2b") || htmlLower.includes("business plan");
  checks.push({ category: CATEGORIES.LEGAL, checkKey: "contract_terms_b2b", label: "B2B contract terms / SLA documented", status: isB2b ? (hasB2bTerms ? "PASS" : "WARN") : "PASS", detail: isB2b ? (hasB2bTerms ? "B2B contract terms or SLA referenced." : "B2B product signals detected but no SLA/MSA — enterprise buyers expect documented service levels and master service agreements before signing.") : "Not applicable — no B2B signals detected." });

  return checks;
}
