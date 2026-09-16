/**
 * Alias Route for DocuSeal Webhook Endpoint with /app prefix.
 *
 * Supports Webhook URLs formatted as:
 *   https://staging.foundry.gitwork.tech/app/api/webhooks/docuseal
 */

export { POST } from "@/app/api/webhooks/docuseal/route";
