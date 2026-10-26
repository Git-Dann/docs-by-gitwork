import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import { evaluateOperationalDepthChecks } from "../operational-depth";

function snap(files: Record<string, string>, unreadPaths: string[] = []): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...unreadPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const at = (checks: PulseScanCheckInput[], key: string) => {
  const check = checks.find((candidate) => candidate.checkKey === key);
  if (!check) throw new Error(`No check emitted for ${key}`);
  return check;
};

const run = (files: Record<string, string>, key: string, unreadPaths: string[] = []) =>
  at(evaluateOperationalDepthChecks(snap(files, unreadPaths)), key);

const thinSample = Array.from({ length: 40 }, (_, index) => `apps/web/components/unread-${index}.tsx`);

// Taken from shadcn-ui/taxonomy.
const TAXONOMY_AUTH = [
  "        const result = await postmarkClient.sendEmailWithTemplate({",
  "          TemplateId: parseInt(templateId),",
  "          To: identifier,",
  "          From: provider.from as string,",
  "        })",
].join("\n");

describe("email_depth_retry_backoff", () => {
  it("does not credit email with backoff that belongs to an unrelated script (calcom/cal.com)", () => {
    // NOTE: this pins the 600-character proximity window, not real cal.com adjacency. The
    // synthetic filler pushes the backoff code more than 600 chars away from 'nodemailer', and
    // the Map insertion order puts the script before the mailer file in the joined text.
    const filler = Array.from(
      { length: 30 },
      (_, i) => '      console.log("Deleted recording batch ' + i + ' of the scheduled cleanup run");',
    ).join("\n");
    const check = run(
      {
        "packages/app-store/dailyvideo/lib/scripts/deleteRecordings.ts": [
          "        if (response.status === 429 && retries < maxRetries) {",
          "          const backoffDelay = Math.pow(2, retries) * 1000;",
          "          await new Promise((resolve) => setTimeout(resolve, backoffDelay));",
          "        }",
          filler,
        ].join("\n"),
        "packages/emails/templates/_base-email.ts": [
          '    const { createTransport } = await import("nodemailer");',
          "    await new Promise((resolve, reject) =>",
          "      createTransport(this.getMailerOptions().transport).sendMail(payload, (_err, info) => {",
          "        if (_err) reject(_err);",
          "        else resolve(info);",
          "      })",
          '    ).catch((e) => console.error("sendEmail", e));',
        ].join("\n"),
      },
      "email_depth_retry_backoff",
    );
    expect(check.status).toBe("WARN");
  });

  it("still passes a mail job configured with exponential backoff", () => {
    const check = run(
      {
        "src/jobs/email.ts": [
          'import { sendEmail } from "../lib/mailer";',
          'await emailQueue.add("welcome", payload, { attempts: 5, backoff: { type: "exponential", delay: 1000 } });',
        ].join("\n"),
      },
      "email_depth_retry_backoff",
    );
    expect(check.status).toBe("PASS");
  });
});

describe("email_depth_address_validation", () => {
  it("recognises a zod .email() schema (shadcn-ui/taxonomy)", () => {
    const check = run(
      {
        "lib/auth.ts": TAXONOMY_AUTH,
        "lib/validations/auth.ts": [
          'import * as z from "zod"',
          "",
          "export const userAuthSchema = z.object({",
          "  email: z.string().email(),",
          "})",
        ].join("\n"),
      },
      "email_depth_address_validation",
    );
    expect(check.status).toBe("PASS");
  });

  it("still warns when a raw request field is handed to the mailer", () => {
    const check = run(
      { "src/routes/invite.ts": 'await sendEmail({ to: req.body.email, subject: "You are invited" });' },
      "email_depth_address_validation",
    );
    expect(check.status).toBe("WARN");
  });
});

describe("email_depth_stream_separation", () => {
  it("does not apply to a site with marketing pages but no marketing mail (shadcn-ui/taxonomy)", () => {
    const check = run(
      {
        "README.md": "- [x] ~Build marketing pages~",
        "app/(marketing)/layout.tsx": [
          'import { marketingConfig } from "@/config/marketing"',
          "",
          "interface MarketingLayoutProps {",
          "  children: React.ReactNode",
          "}",
        ].join("\n"),
        "lib/auth.ts": TAXONOMY_AUTH,
      },
      "email_depth_stream_separation",
    );
    expect(check.status).toBe("SKIPPED");
  });

  it("does not treat organisation subdomains as a separate mail stream", () => {
    const check = run(
      {
        ".env.example": "#  Reserved orgs subdomains for our own usage\nRESERVED_SUBDOMAINS='\"app\",\"auth\",\"docs\"'",
        "packages/emails/newsletter.ts": 'export const sendNewsletter = (to: string) => sendEmail({ to, from: "hello@example.test" });',
      },
      "email_depth_stream_separation",
    );
    expect(check.status).toBe("WARN");
  });

  it("still passes provider message streams", () => {
    const check = run(
      { "src/mail.ts": 'sendNewsletter({ messageStream: "broadcast" }); sendReceipt({ messageStream: "outbound" });' },
      "email_depth_stream_separation",
    );
    expect(check.status).toBe("PASS");
  });
});

describe("global_depth_currency_precision", () => {
  it("does not pass on a Tailwind list-decimal class and Stripe price ids (shadcn-ui/taxonomy)", () => {
    const check = run(
      {
        "components/mdx-components.tsx": '<ol className={cn("my-6 ml-6 list-decimal", className)} {...props} />',
        "app/api/users/stripe/route.ts": "      line_items: [{ price: proPlan.stripePriceId, quantity: 1 }],",
      },
      "global_depth_currency_precision",
    );
    expect(check.status).not.toBe("PASS");
  });

  it("recognises integer minor units with a currency column (calcom/cal.com Payment)", () => {
    const check = run(
      {
        "packages/prisma/schema.prisma": [
          "model Payment {",
          "  id            Int            @id @default(autoincrement())",
          "  amount        Int",
          "  fee           Int",
          "  currency      String",
          "  success       Boolean",
          "}",
        ].join("\n"),
        "packages/lib/payment.ts": "export const toMajor = (amount: number) => amount / 100;",
      },
      "global_depth_currency_precision",
    );
    expect(check.status).toBe("PASS");
  });

  it("still warns on a float price", () => {
    const check = run({ "src/pricing.ts": 'const price = 10.99; const currency = "GBP";' }, "global_depth_currency_precision");
    expect(check.status).toBe("WARN");
  });
});

describe("global_depth_residency_routing", () => {
  it("does not fire on an AWS ARN region placeholder (tmoreton/tutorials)", () => {
    const check = run(
      { "agentcore/.llm-context/agentcore.ts": "   * Format: arn:aws:elasticfilesystem:{region}:{account}:access-point/{id}" },
      "global_depth_residency_routing",
    );
    expect(check.status).toBe("SKIPPED");
  });

  it("still warns when a tenant region comes from the request", () => {
    const check = run(
      { "src/tenants/route.ts": "const tenantRegion = req.query.region ?? deploymentRegion; // data residency" },
      "global_depth_residency_routing",
    );
    expect(check.status).toBe("WARN");
  });
});

describe("global_depth_translation_parity", () => {
  it("recognises Lingo.dev locale sync in CI (calcom/cal.com)", () => {
    const check = run(
      {
        ".github/workflows/i18n.yml": [
          "name: Run i18n AI automation",
          "jobs:",
          "  i18n:",
          "    steps:",
          "      - uses: lingodotdev/lingo.dev@cee3eb86550ca4905fc99fe90786fb7523288a61 # main",
          "        with:",
          "          pull-request: true",
        ].join("\n"),
        "packages/i18n/server.ts": 'export const loadLocale = (locale: string) => import(`./locales/${locale}/common.json`);',
      },
      "global_depth_translation_parity",
    );
    expect(check.status).toBe("PASS");
  });

  it("still warns for catalogues with no parity tooling", () => {
    const check = run(
      {
        "translations/en.json": '{"hello":"Hello"}',
        "translations/fr.json": '{"hello":"Bonjour"}',
        "src/i18n.ts": 'i18n.init({ fallbackLng: "en" });',
      },
      "global_depth_translation_parity",
    );
    expect(check.status).toBe("WARN");
  });
});

describe("global_depth_unicode_normalization", () => {
  it("does not fire on a lockfile package name (tmoreton/tutorials)", () => {
    const check = run(
      {
        "agentcore/cdk/package-lock.json": '    "node_modules/@babel/helper-validator-identifier": { "version": "7.25.9" }',
        "proxy/index.mjs": "export default { fetch: (request) => fetch(request) };",
      },
      "global_depth_unicode_normalization",
    );
    expect(check.status).toBe("SKIPPED");
  });

  it("accepts NFC normalisation", () => {
    const check = run({ "src/users.ts": 'const username = input.normalize("NFC").toLowerCase();' }, "global_depth_unicode_normalization");
    expect(check.status).toBe("PASS");
  });

  it("still warns on unique usernames with no normalisation (gothinkster realworld)", () => {
    const check = run(
      {
        "src/prisma/schema.prisma": "model User {\n  email      String    @unique\n  username   String    @unique\n}",
        "src/app/routes/auth/auth.service.ts": "const user = await prisma.user.findUnique({ where: { email: input.email } });",
      },
      "global_depth_unicode_normalization",
    );
    expect(check.status).toBe("WARN");
  });
});

describe("infra_depth_dead_letter_queue", () => {
  it("does not treat the jQuery animation queue as async work (django/djangoproject.com)", () => {
    const check = run(
      {
        "djangoproject/static/js/lib/jquery.min.js":
          'm.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=m._data(a,b),c&&d.push(c),d||[]):void 0}})',
        "djangoproject/settings/common.py": 'DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql"}}',
      },
      "infra_depth_dead_letter_queue",
    );
    expect(check.status).toBe("SKIPPED");
  });

  it("credits the built-in Sidekiq dead set (discourse/discourse)", () => {
    const check = run(
      {
        Gemfile: 'gem "sidekiq", ">= 7.3.10"\n# Used by discourse-prometheus to collect socket queue stats.\ngem "raindrops", require: false',
        "app/jobs/regular/update_username.rb": "module Jobs\n  class UpdateUsername < ::Jobs::Base\n  end\nend",
      },
      "infra_depth_dead_letter_queue",
    );
    expect(check.status).toBe("PASS");
  });

  it("still warns for BullMQ without a DLQ and for Sidekiq jobs that opt out of the dead set", () => {
    expect(
      run({ "src/queue.ts": 'const queue = new Queue("email"); // bullmq\nqueue.process(async job => handle(job));' }, "infra_depth_dead_letter_queue").status,
    ).toBe("WARN");
    expect(
      run({ "app/jobs/hard_job.rb": "class HardJob\n  include Sidekiq::Job\n  sidekiq_options retry: 5, dead: false\nend" }, "infra_depth_dead_letter_queue").status,
    ).toBe("WARN");
  });
});

describe("IaC rules ignore 'tofu' inside other words", () => {
  const discourseDanish = {
    "config/locales/server.da.yml":
      '    emoji_autocomplete_min_chars: "Mindste antal tegn krævet for at aktivere autofuldførelses humørikoner-popup"',
    ".changeset/brave-owls.md": '---\n"discourse": patch\n---\nchangeset entry',
    "lib/plugin.rb": "module Discourse; end",
  };

  it("skips both rules on a repo with no infrastructure code (discourse/discourse)", () => {
    const checks = evaluateOperationalDepthChecks(snap(discourseDanish));
    expect(at(checks, "infra_depth_remote_state_protection").status).toBe("SKIPPED");
    expect(at(checks, "infra_depth_iac_plan_gate").status).toBe("SKIPPED");
  });

  it("still fails local Terraform state and passes a PR plan", () => {
    expect(
      run({ "infra/main.tf": 'terraform {\n  backend "local" {\n    path = "terraform.tfstate"\n  }\n}' }, "infra_depth_remote_state_protection").status,
    ).toBe("FAIL");
    expect(
      run({ ".github/workflows/infra.yml": "on: pull_request\njobs:\n  plan:\n    steps:\n      - run: terraform plan -out=tfplan" }, "infra_depth_iac_plan_gate").status,
    ).toBe("PASS");
  });
});

describe("thin-sample absence is not reported as missing", () => {
  it("marks an unobserved formatter as inconclusive when most source was unread (calcom/cal.com)", () => {
    const check = run(
      { "apps/web/lib/date.ts": "export const formatDate = (date: Date) => date.toISOString();" },
      "global_depth_locale_formatters",
      thinSample,
    );
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.confidence).toBe("LOW");
  });

  it("still warns when the same absence comes from a fully-read repository", () => {
    const check = run(
      { "apps/web/lib/date.ts": "export const formatDate = (date: Date) => date.toISOString();" },
      "global_depth_locale_formatters",
    );
    expect(check.status).toBe("WARN");
  });

  it("keeps an observed forbidden pattern as FAIL even on a thin sample", () => {
    const check = run(
      { "src/session.ts": "app.use(session({ cookie: { secure: false } }));" },
      "auth_depth_session_cookie_flags",
      thinSample,
    );
    expect(check.status).toBe("FAIL");
  });

  // A gap read from a keyword sample is a WARN at MEDIUM confidence at most: the control may
  // live outside the repository (a bucket policy, the console), so absence is not a FAIL.
  it("keeps a fully-read Terraform-only repo's gap as a finding, not an unobserved one", () => {
    const check = run(
      { "infra/backend.tf": 'terraform {\n  backend "s3" {\n    bucket = "acme-tf-state"\n    key    = "prod/terraform.tfstate"\n  }\n}' },
      "infra_depth_remote_state_protection",
    );
    expect(check.status).toBe("WARN");
    expect(check.confidence).toBe("MEDIUM");
  });
});
