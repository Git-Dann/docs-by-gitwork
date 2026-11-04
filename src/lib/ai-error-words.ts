/**
 * What went wrong with an AI call, in one plain sentence. Providers answer with raw JSON
 * (`400 {"type":"error","error":{…"credit balance is too low…"}}`), which was being printed
 * straight onto the scan page. Pure, so the page and its tests share one rule.
 */
export function describeAiError(raw: string | null | undefined): string {
  const e = (raw ?? "").toLowerCase();
  if (!e.trim()) return "The AI write-up did not run.";
  if (/credit balance|insufficient_quota|exceeded your current quota|billing|payment required|\b402\b/.test(e)) {
    return "The AI provider account is out of credit, so the AI write-up didn't run. Top it up, then regenerate.";
  }
  if (/invalid[ _-]?api[ _-]?key|incorrect api key|authentication|unauthori[sz]ed|\b401\b|permission_error|\b403\b/.test(e)) {
    return "The AI provider rejected the API key, so the AI write-up didn't run. Check the key in Settings → Integrations.";
  }
  if (/no ai provider|not configured|missing api key|no api key/.test(e)) {
    return "No AI provider is set up, so the AI write-up didn't run. Add one in Settings → Integrations.";
  }
  if (/rate.?limit|too many requests|\b429\b/.test(e)) {
    return "The AI provider was busy (rate limited), so the AI write-up didn't run. Try regenerating in a few minutes.";
  }
  if (/overloaded|\b529\b|\b5\d\d\b|timed? ?out|timeout|econnreset|fetch failed/.test(e)) {
    return "The AI provider didn't answer in time, so the AI write-up didn't run. Try regenerating.";
  }
  return "The AI provider returned an error, so the AI write-up didn't run. Try regenerating.";
}
