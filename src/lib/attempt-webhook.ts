import "server-only";

import { buildAttemptWebhookPayload, type AttemptWebhookInput } from "./attempt-webhook-payload";

export { buildAttemptWebhookPayload, type AttemptWebhookInput, type AttemptWebhookPayload } from "./attempt-webhook-payload";

interface SendAttemptWebhookOptions {
  fetch?: typeof globalThis.fetch;
}

export async function sendAttemptWebhook(
  input: AttemptWebhookInput,
  options: SendAttemptWebhookOptions = {},
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const response = await (options.fetch ?? globalThis.fetch)(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildAttemptWebhookPayload(input)),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn("Discord attempt webhook delivery failed", response.status);
    }
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    console.warn("Discord attempt webhook delivery failed", errorClass);
  }
}
