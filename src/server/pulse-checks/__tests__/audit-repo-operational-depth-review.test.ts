import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import { evaluateOperationalDepthChecks } from "../operational-depth";

// Adversarial-review cases for the operational-depth fixes: each guards a narrowing that
// would otherwise have let a real repository go quiet.

function snap(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const status = (files: Record<string, string>, key: string) => {
  const check = evaluateOperationalDepthChecks(snap(files)).find(
    (candidate: PulseScanCheckInput) => candidate.checkKey === key,
  );
  if (!check) throw new Error(`No check emitted for ${key}`);
  return check.status;
};

describe("infra_depth_dead_letter_queue keeps SQS in scope", () => {
  it("warns for a Terraform SQS queue with no redrive policy", () => {
    expect(status({ "infra/queue.tf": 'resource "aws_sqs_queue" "jobs" {\n  name = "jobs"\n}' }, "infra_depth_dead_letter_queue")).toBe("WARN");
  });
  it("warns for the SQS SDK client with no dead-letter path", () => {
    expect(status({ "src/queue.ts": "const client = new SQSClient({}); await client.send(cmd);" }, "infra_depth_dead_letter_queue")).toBe("WARN");
  });
  it("passes an SQS queue that declares a redrive policy", () => {
    expect(
      status(
        { "infra/queue.tf": 'resource "aws_sqs_queue" "jobs" {\n  redrive_policy = jsonencode({ deadLetterTargetArn = aws_sqs_queue.dlq.arn, maxReceiveCount = 5 })\n}' },
        "infra_depth_dead_letter_queue",
      ),
    ).toBe("PASS");
  });
  it("does not read an unrelated CDK flag as SQS", () => {
    expect(status({ "cdk.json": '{"@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption": true}' }, "infra_depth_dead_letter_queue")).toBe("SKIPPED");
  });
});

describe("email_depth_retry_backoff credits an email queue configured apart from the sender", () => {
  it("passes a named email queue whose default job options use exponential backoff", () => {
    expect(
      status(
        {
          "src/queues/emailQueue.ts":
            'export const emailQueue = new Queue("email", { defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 1000 } } });',
          "src/lib/mail.ts": 'import { Resend } from "resend"; export const send = (m) => resend.emails.send(m);',
        },
        "email_depth_retry_backoff",
      ),
    ).toBe("PASS");
  });
  it("still warns when the only backoff belongs to an unrelated HTTP client", () => {
    expect(
      status(
        {
          // Filler keeps the backoff more than 600 characters from the mailer, as in a real file.
          "src/lib/http.ts": `export const client = axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay }); // github api\n${"// request helper\n".repeat(50)}`,
          "src/lib/mail.ts": 'import { Resend } from "resend"; export const send = (m) => resend.emails.send(m);',
        },
        "email_depth_retry_backoff",
      ),
    ).toBe("WARN");
  });
});
