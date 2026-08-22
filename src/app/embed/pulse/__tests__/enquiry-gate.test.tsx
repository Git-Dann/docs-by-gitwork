// @vitest-environment jsdom
/**
 * The conversion path. The free report needs no email; the in-depth review does.
 *
 * These pin the split that the whole free-tier design rests on:
 *   · a scan starts from a URL alone — no email input on the form at all
 *   · the score and the triaged findings render without any email
 *   · the enquiry form appears only once the scan is COMPLETE
 *   · submitting it POSTs to the enquiry endpoint and never starts a scan
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import EmbedPulsePage from "@/app/embed/pulse/page";

let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("prefers-reduced-motion"), media: q,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/embed/pulse");
});

const CONFIG = { turnstileSiteKey: null, bookingUrl: "https://example.com/book" };
const COMPLETED = {
  id: "scan_1", status: "COMPLETED", targetUrl: "https://acme.test/", healthScore: 64,
  techStack: ["Next.js"], totalChecks: 900, pass: 300, warn: 500, fail: 2, inconclusive: 0,
  categories: [{ category: "Security", pass: 5, warn: 3, fail: 1, inconclusive: 0 }],
  emailCaptured: false, checks: null, errorMessage: null,
  triage: {
    actionable: [
      { checkKey: "privacy_policy", category: "Legal & Compliance", label: "Privacy Policy", status: "FAIL", detail: "No privacy policy link found.", tier: "P1" },
      { checkKey: "csp_header", category: "Security", label: "Content-Security-Policy", status: "WARN", detail: "No CSP header is sent.", tier: "P2" },
    ],
    advisoryCount: 588,
    advisoryByCategory: [{ category: "SEO", count: 300 }, { category: "Accessibility", count: 288 }],
    notEstablished: [{ checkKey: "mfa", category: "Authentication", label: "MFA", reason: "No auth system detected." }],
  },
};

function render() {
  const root = createRoot(host);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EmbedPulsePage />
      </QueryClientProvider>,
    );
  });
}

async function settle(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

function stubFetch(onEnquiry?: (body: unknown) => Response) {
  const calls: { url: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.includes("/config")) return { ok: true, json: async () => CONFIG } as Response;
    if (url.includes("/enquiry")) {
      return onEnquiry ? onEnquiry(body) : ({ ok: true, status: 201, json: async () => ({ leadId: "lead_1", requested: true }) } as Response);
    }
    if (url.includes("/scan/scan_1")) return { ok: true, json: async () => COMPLETED } as Response;
    return { ok: true, status: 201, json: async () => ({ id: "scan_1" }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function startScan() {
  const url = host.querySelector('input[type="url"]') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(url, "acme.test");
    url.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => (host.querySelector("button") as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("the free report needs no email", () => {
  it("has no email input on the scan form", async () => {
    stubFetch();
    render();
    await settle();
    expect(host.querySelector('input[type="url"]')).not.toBeNull();
    expect(host.querySelector('input[type="email"]')).toBeNull();
  });

  it("starts a scan from a URL alone, sending no email", async () => {
    const { calls } = stubFetch();
    render();
    await settle();
    startScan();
    await settle();
    const post = calls.find((c) => c.url.endsWith("/api/public/pulse/scan"));
    expect(post).toBeDefined();
    expect((post!.body as { email?: string }).email).toBeUndefined();
  });

  it("shows the score, the triaged findings with evidence, and the advisory count", async () => {
    stubFetch();
    render();
    await settle();
    startScan();
    await settle(6);

    expect(host.textContent).toContain("64");
    expect(host.textContent).toContain("Privacy Policy");
    expect(host.textContent).toContain("No privacy policy link found.");  // evidence, free
    expect(host.textContent).toContain("Content-Security-Policy");
    // Assert the findings-block advisory line specifically. A bare /588/ also matched
    // the CTA copy below, so it did not prove this line rendered at all.
    expect(host.textContent).toMatch(/588\s*lower-priority\s*advisory checks/i);
    expect(host.textContent).toMatch(/What to fix \(2\)/);
  });
});

describe("the in-depth review is the gate", () => {
  it("only offers the enquiry form once the scan has completed", async () => {
    stubFetch();
    render();
    await settle();
    // Before any scan there is no enquiry affordance.
    expect(host.textContent).not.toMatch(/in-depth review/i);
    startScan();
    await settle(6);
    expect(host.textContent).toMatch(/in-depth review/i);
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
  });

  it("posts the email to the enquiry endpoint and confirms, without starting a scan", async () => {
    const { calls } = stubFetch();
    render();
    await settle();
    startScan();
    await settle(6);

    const emailInput = host.querySelector('input[type="email"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(emailInput, "buyer@acme.test");
      emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = [...host.querySelectorAll("button")].find((b) => /in-depth review/i.test(b.textContent ?? ""))!;
    await act(async () => { submit.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(4);

    const enquiry = calls.find((c) => c.url.includes("/enquiry"));
    expect(enquiry).toBeDefined();
    expect((enquiry!.body as { email: string }).email).toBe("buyer@acme.test");
    // Exactly one scan was ever started — the enquiry must not trigger another.
    expect(calls.filter((c) => c.url.endsWith("/api/public/pulse/scan"))).toHaveLength(1);
    expect(host.textContent).toMatch(/that.s with us/i);
  });

  it("surfaces a friendly message when the address has already been used", async () => {
    stubFetch(() => ({ ok: false, status: 409, json: async () => ({ error: "This email has already used its free scan." }) }) as Response);
    render();
    await settle();
    startScan();
    await settle(6);

    const emailInput = host.querySelector('input[type="email"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(emailInput, "dup@acme.test");
      emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = [...host.querySelectorAll("button")].find((b) => /in-depth review/i.test(b.textContent ?? ""))!;
    await act(async () => { submit.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(4);

    expect(host.textContent).toMatch(/we already have a request against this email/i);
  });
});

describe("Turnstile tokens are single-use", () => {
  // ⚠️ The bug this pins: Cloudflare rejects a re-redeemed token as
  // `timeout-or-duplicate`. The enquiry endpoint requires a valid token, and the
  // widget originally re-sent the one its SCAN had already spent — so with Turnstile
  // configured (which it is in production, site key 0x4AAA…) every "Get the in-depth
  // review" failed "Verification failed". The whole conversion path, silently dead.
  //
  // Asserted at source level ON PURPOSE. Driving the real widget needs
  // `next/script`'s onLoad to fire, which jsdom does not do, so a behavioural test
  // here would only ever exercise the no-Turnstile path — i.e. it would pass while
  // the bug was live, which is worse than no test. These greps cannot regress
  // silently.
  // The scanner moved out of the route into a shared component (both /embed/pulse and
  // /production-ready render it), so these greps follow the code. The route file is now
  // a five-line server wrapper with none of this logic in it — pointing them at the old
  // path would leave three tests passing against a file that cannot contain the bug.
  const source = readFileSync("src/components/pulse/public-scanner.tsx", "utf8");
  const enquirySource = readFileSync("src/app/scan/[id]/enquiry.tsx", "utf8");

  it("the widget discards the scan token and asks for a fresh one", () => {
    expect(source).toMatch(/setScanToken\(null\)/);
    expect(source).toMatch(/window\.turnstile\?\.reset\?\.\(\)/);
  });

  it("both enquiry paths send a turnstileToken", () => {
    expect(source).toMatch(/turnstileToken: scanToken/);
    expect(enquirySource).toMatch(/turnstileToken: token/);
  });

  it("both enquiry buttons refuse to submit before a token exists", () => {
    // Submitting without one always fails server-side, which reads as a broken form.
    expect(source).toMatch(/enquirySending \|\| !email\.trim\(\) \|\| awaitingVerification/);
    expect(enquirySource).toMatch(/sending \|\| !email\.trim\(\) \|\| awaitingVerification/);
    expect(enquirySource).toMatch(/const awaitingVerification = Boolean\(turnstileSiteKey\) && !token/);
  });

  it("the shared widget treats an expired token as no token", () => {
    const box = readFileSync("src/components/pulse/turnstile-box.tsx", "utf8");
    // An expired token is worse than none: it fails verification while the UI
    // still believes it is ready to submit.
    expect(box).toMatch(/"expired-callback": \(\) => onToken\(null\)/);
  });
});
