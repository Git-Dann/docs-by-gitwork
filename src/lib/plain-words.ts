/**
 * What a finding means for the product or the team, in words a client can act on. Pure:
 * each phrase is chosen from what was measured (an advisory's own text, a function's path
 * and kind, whether it changes often), never written by AI, so a report always reads the
 * same way. The rule: say what could happen, not what the code looks like.
 */

import type { DebtItem, PackageAdvisory, VulnerablePackage } from "@/types/code-health";

/** Advisory wording → consequence. Checked in order; the first match wins. */
const LIBRARY_IMPACT: { test: RegExp; text: string }[] = [
  { test: /remote code execution|\bRCE\b|arbitrary code|code injection|command injection|os command|deserializ/i, text: "could let an attacker run their own code on your server" },
  { test: /sql injection|\bsqli\b|nosql injection/i, text: "could let an attacker read or change your database" },
  { test: /authenticat|authoriz|signature|jwt|token|forg|bypass|impersonat|privilege|key type|legacy key/i, text: "could let someone get past sign-in or pretend to be another user" },
  { test: /cross[- ]site scripting|\bxss\b|script injection|html injection/i, text: "could let an attacker run their own script in your users' browsers" },
  { test: /server[- ]side request forgery|\bssrf\b/i, text: "could let an attacker use your server to reach systems that should be private" },
  { test: /path traversal|directory traversal|arbitrary file|file read|file write|zip slip/i, text: "could expose or overwrite files on your server" },
  { test: /prototype pollution/i, text: "could let an attacker change how parts of the app behave" },
  { test: /regular expression|regex|redos/i, text: "could let someone slow the app to a crawl with one crafted request" },
  { test: /denial of service|\bdos\b|resource exhaustion|memory|infinite loop|uncontrolled resource|crash|hang/i, text: "could let someone crash or overload the app" },
  { test: /information (exposure|disclosure|leak)|sensitive|expos|leak|cookie/i, text: "could leak private information" },
  { test: /open redirect|redirect/i, text: "could send your users to a site that only looks like yours" },
  { test: /csrf|cross[- ]site request/i, text: "could let another site trigger actions as a signed-in user" },
];

export function libraryImpact(pkg: Pick<VulnerablePackage, "advisories" | "severity">): string {
  const text = pkg.advisories.map((a: PackageAdvisory) => a.summary).join(" ");
  const hit = LIBRARY_IMPACT.find((r) => r.test.test(text));
  if (hit) return hit.text;
  return pkg.severity === "critical" || pkg.severity === "high"
    ? "has a published security flaw serious enough to fix straight away"
    : "has a published security flaw; low risk, but worth fixing at the next update";
}

/**
 * Path words → the part of the product a non-developer would recognise. Matched against
 * whole words of the path (split on folders, `_`, `-`, `.` and camelCase), never substrings:
 * substring matching read `state.dart` as reporting ("stat") and `border` as orders, and on a
 * real app called the content feed "data syncing".
 */
const AREA: { words: string[]; area: string }[] = [
  { words: ["pay", "payment", "payments", "billing", "invoice", "invoices", "checkout", "stripe", "subscription", "subscriptions", "pricing", "price", "refund", "charge", "charges", "order", "orders", "purchase", "purchases", "wallet"], area: "payments" },
  { words: ["auth", "login", "signin", "signup", "session", "sessions", "password", "token", "tokens", "oauth", "permission", "permissions", "role", "roles", "account", "accounts"], area: "sign-in and accounts" },
  { words: ["booking", "bookings", "reservation", "reservations", "schedule", "scheduler", "calendar", "slot", "slots"], area: "bookings" },
  { words: ["sync", "import", "export", "migration", "migrations", "etl"], area: "data syncing" },
  { words: ["notification", "notifications", "email", "emails", "mail", "mailer", "sms", "push"], area: "notifications" },
  { words: ["report", "reports", "analytics", "dashboard", "stats", "metrics"], area: "reporting" },
  { words: ["search"], area: "search" },
  { words: ["cart", "basket", "product", "products", "catalog", "catalogue", "inventory", "shop", "store"], area: "the shop" },
  { words: ["feed", "post", "posts", "comment", "comments", "episode", "episodes", "video", "videos", "player", "media"], area: "content" },
  { words: ["admin"], area: "admin tools" },
];

function pathWords(path: string): Set<string> {
  return new Set(
    path
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/** The part of the product a path belongs to, or null when the path does not say. */
export function productArea(path: string): string | null {
  const words = pathWords(path);
  return AREA.find((a) => a.words.some((w) => words.has(w)))?.area ?? null;
}

/**
 * What a piece of tech debt costs, in plain words. A hotspot (code that changes often) is
 * called out, because that is where the cost is paid every week rather than one day.
 */
export function debtImpact(item: Pick<DebtItem, "kind" | "path" | "severity">, changesOften: boolean): string {
  const area = productArea(item.path);
  const where = area ? `This is ${area} code` : "This code";
  const base: Record<DebtItem["kind"], string> = {
    complex_function: "it has so many paths through it that it is rarely fully tested, so changes here are where bugs slip through",
    long_function: "it does several jobs at once, so changing one can break another",
    long_parameter_list: "it is easy to call it the wrong way, which causes quiet mistakes",
    deep_nesting: "its logic is hard to follow, so changes take longer and go wrong more often",
    large_class: "it holds several unrelated jobs, so unrelated changes collide in it",
    large_file: "it is large enough that people avoid touching it and work around it instead",
  };
  return `${where}: ${base[item.kind]}${changesOften ? ", and the team changes it often, so the cost is paid every week" : ""}.`;
}
