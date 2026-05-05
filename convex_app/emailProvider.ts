/**
 * Shared transactional email delivery — Resend (default) or AWS SES.
 * Used by auth OTP, welcome, appeal confirmations, etc.
 */

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

function getSesClient(): SESv2Client {
  const region =
    process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? "us-east-1";
  return new SESv2Client({ region });
}

export type EmailProvider = "resend" | "aws_ses";

export function getEmailProvider(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (raw === "aws" || raw === "ses" || raw === "aws_ses") {
    return "aws_ses";
  }
  return "resend";
}

function getFromEmail(provider: EmailProvider): string {
  const providerSpecific =
    provider === "resend"
      ? process.env.RESEND_FROM_EMAIL
      : process.env.AWS_SES_FROM_EMAIL;
  const fallback = process.env.MAIL_FROM_ADDRESS;
  return (providerSpecific ?? fallback ?? "").trim().toLowerCase();
}

/**
 * Validates transactional email env on the **Convex** runtime (actions/crons).
 * Next.js `.env.local` is not visible here unless synced via Convex dashboard / `convex env`.
 */
export function assertConvexTransactionalEmailReady(): void {
  const provider = getEmailProvider();
  if (provider === "resend") {
    getResendApiKey();
    const from = getFromEmail(provider);
    if (!from) {
      throw new Error(
        "Missing RESEND_FROM_EMAIL (or MAIL_FROM_ADDRESS). " +
          "Set on this Convex deployment (Dashboard → Settings → Environment Variables). " +
          "Next.js .env.local alone does not supply Convex actions.",
      );
    }
    return;
  }
  const from = getFromEmail(provider);
  if (!from) {
    throw new Error(
      "Missing AWS_SES_FROM_EMAIL (or MAIL_FROM_ADDRESS) on this Convex deployment.",
    );
  }
}

function getResendApiKey(): string {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "Missing RESEND_API_KEY — OTP runs in Convex actions: set RESEND_API_KEY (and RESEND_FROM_EMAIL) " +
        "in the Convex dashboard for this deployment, not only in Next.js .env.local.",
    );
  }
  return apiKey;
}

export async function sendEmailWithProvider(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const provider = getEmailProvider();
  const fromEmail = getFromEmail(provider);
  if (!fromEmail) {
    throw new Error(
      provider === "resend"
        ? "Missing RESEND_FROM_EMAIL (or MAIL_FROM_ADDRESS). Set on Convex deployment (actions run server-side on Convex, not in Next.js)."
        : "Missing AWS_SES_FROM_EMAIL (or MAIL_FROM_ADDRESS). Set on Convex deployment.",
    );
  }

  if (provider === "resend") {
    const apiKey = getResendApiKey();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });

    if (!response.ok) {
      let providerMessage = `Resend HTTP ${response.status}`;
      try {
        const data = (await response.json()) as {
          message?: string;
          error?: { message?: string };
        };
        providerMessage =
          data.error?.message ||
          data.message ||
          `${providerMessage}: ${response.statusText}`;
      } catch {
        const txt = await response.text();
        if (txt) providerMessage = txt;
      }
      throw new Error(providerMessage);
    }
    return;
  }

  const command = new SendEmailCommand({
    FromEmailAddress: fromEmail,
    Destination: { ToAddresses: [args.to] },
    Content: {
      Simple: {
        Subject: { Data: args.subject },
        Body: {
          Text: { Data: args.text },
          Html: { Data: args.html },
        },
      },
    },
  });

  const client = getSesClient();
  await client.send(command);
}
