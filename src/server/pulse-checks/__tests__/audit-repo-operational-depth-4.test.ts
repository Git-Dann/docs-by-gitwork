import { describe, expect, it } from "vitest";
import { OPERATIONAL_DEPTH_RULES, evaluateOperationalRuleText } from "../operational-depth";

function statusOf(key: string, text: string) {
  const rule = OPERATIONAL_DEPTH_RULES.find((candidate) => candidate.key === key);
  if (!rule) throw new Error(`No rule ${key}`);
  return evaluateOperationalRuleText(rule, text).status;
}

const lines = (...parts: string[]) => parts.join("\n");

describe("audit repo-operational-depth-4", () => {
  describe("payments_depth_price_allowlist", () => {
    it("passes a checkout that only uses a server-owned plan price (shadcn-ui/taxonomy)", () => {
      const text = lines(
        "app/api/users/stripe/route.ts",
        'import { proPlan } from "@/config/subscriptions"',
        "const stripeSession = await stripe.checkout.sessions.create({",
        '  mode: "subscription",',
        "  line_items: [",
        "    {",
        "      price: proPlan.stripePriceId,",
        "      quantity: 1,",
        "    },",
        "  ],",
        "})",
        "config/subscriptions.ts",
        'export const proPlan = { name: "PRO", stripePriceId: env.STRIPE_PRO_MONTHLY_PLAN_ID || "" }',
      );
      expect(statusOf("payments_depth_price_allowlist", text)).toBe("PASS");
    });

    it("still fails when the price id comes from the client", () => {
      expect(
        statusOf(
          "payments_depth_price_allowlist",
          lines(
            "const priceId = req.body.priceId;",
            "await stripe.checkout.sessions.create({ line_items: [{ price: priceId, quantity: 1 }] });",
          ),
        ),
      ).toBe("FAIL");
      expect(
        statusOf(
          "payments_depth_price_allowlist",
          lines(
            "const { priceId } = await req.json();",
            "await stripe.checkout.sessions.create({ line_items: [{ price: priceId, quantity: 1 }] });",
          ),
        ),
      ).toBe("FAIL");
    });
  });

  describe("payments_depth_event_deduplication", () => {
    it("warns rather than fails on an idempotent webhook with no event-id store (taxonomy)", () => {
      const text = lines(
        "app/api/webhooks/stripe/route.ts",
        "event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET)",
        'if (event.type === "invoice.payment_succeeded") {',
        "  const subscription = await stripe.subscriptions.retrieve(session.subscription as string)",
        "  await db.user.update({ where: { stripeSubscriptionId: subscription.id }, data: { stripePriceId: subscription.items.data[0].price.id } })",
        "}",
      );
      expect(statusOf("payments_depth_event_deduplication", text)).toBe("WARN");
    });

    it("still passes when provider event ids are persisted", () => {
      const text = lines(
        "event = stripe.webhooks.constructEvent(body, signature, secret)",
        "const seen = await processedEvent.upsert({ where: { id: event.id }, create: { id: event.id }, update: {} })",
      );
      expect(statusOf("payments_depth_event_deduplication", text)).toBe("PASS");
    });
  });

  describe("perf_depth_web_vitals_telemetry", () => {
    it("does not treat ...Input identifiers or the eslint preset as web-vitals telemetry (cal.com, taxonomy)", () => {
      const calLike = lines(
        "apps/api/v2/src/modules/verified-resources/inputs/request-email-verification.input.ts",
        'import { NextResponse } from "next/server";',
        "export class RequestEmailVerificationInput {",
        "  email!: string;",
        "}",
        'import { UpdateBookingLocationInput_2024_08_13 } from "@calcom/platform-types";',
      );
      expect(statusOf("perf_depth_web_vitals_telemetry", calLike)).toBe("WARN");

      const eslint = lines(".eslintrc.json", '{ "extends": ["next/core-web-vitals", "prettier"] }');
      expect(statusOf("perf_depth_web_vitals_telemetry", eslint)).toBe("WARN");
    });

    it("still passes real web-vitals collection", () => {
      expect(
        statusOf(
          "perf_depth_web_vitals_telemetry",
          'import { onCLS, onINP, onLCP } from "web-vitals";\nonCLS(send); onINP(send); onLCP(send);',
        ),
      ).toBe("PASS");
      expect(
        statusOf(
          "perf_depth_web_vitals_telemetry",
          'import { useReportWebVitals } from "next/web-vitals";\nuseReportWebVitals((metric) => send(metric));',
        ),
      ).toBe("PASS");
    });
  });

  describe("perf_depth_responsive_images", () => {
    it("does not apply srcset requirements to SVG-only images (tmoreton/tutorials)", () => {
      const text = lines(
        "index.html",
        '<img src="assets/strands.svg" alt="Strands Agents" title="Strands Agents">',
        '<img src="assets/aws.svg" alt="Amazon Web Services" title="Amazon Bedrock">',
      );
      expect(statusOf("perf_depth_responsive_images", text)).toBe("SKIPPED");
    });

    it("still warns on raster images without srcset, even alongside SVG logos", () => {
      expect(statusOf("perf_depth_responsive_images", '<img src="hero-2400.jpg" alt="Hero">')).toBe("WARN");
      expect(
        statusOf(
          "perf_depth_responsive_images",
          '<img src="assets/aws.svg" alt="AWS">\n<img src="assets/hero.png" alt="Hero">',
        ),
      ).toBe("WARN");
    });
  });

  describe("perf_depth_route_code_splitting", () => {
    it("skips a static site whose only matches are tooling words (tmoreton/tutorials)", () => {
      const text = lines(
        "README.md",
        "Locally, the frontend skips the proxy and talks straight to the agent.",
        "agentcore/cdk/lib/cdk-stack.ts",
        "// eslint-disable-next-line @typescript-eslint/no-explicit-any",
        "app/MyAgent/tsconfig.json",
        '{ "compilerOptions": { "module": "NodeNext", "moduleResolution": "NodeNext" } }',
      );
      expect(statusOf("perf_depth_route_code_splitting", text)).toBe("SKIPPED");
    });

    it("still evaluates real framework apps", () => {
      expect(
        statusOf("perf_depth_route_code_splitting", 'import React from "react";\nimport Reports from "./Reports";'),
      ).toBe("WARN");
      expect(
        statusOf(
          "perf_depth_route_code_splitting",
          '{ "dependencies": { "next": "13.3.2-canary.13" } }\nconst Chart = dynamic(() => import("./chart"))',
        ),
      ).toBe("PASS");
    });
  });

});
