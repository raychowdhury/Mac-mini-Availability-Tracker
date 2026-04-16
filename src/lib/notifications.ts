import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import type { AvailabilityResult } from "@/lib/types";

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
    secure: SMTP_PORT === "465",
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

function fromAddress(): string {
  return process.env.SMTP_USER ?? `tracker@${process.env.SMTP_HOST}`;
}

// ─── In-stock alert ──────────────────────────────────────────────────────────

function buildAlertBody(result: AvailabilityResult, unsubUrl: string): string {
  const priceStr = result.price != null ? `$${result.price.toFixed(2)}` : "Price not available";
  return `Good news! The Mac mini M4 Pro (64GB / 1TB) is now IN STOCK.

Retailer : ${result.retailer}
Price    : ${priceStr}
Link     : ${result.productUrl}
Checked  : ${result.checkedAt}

Go get it before it sells out again!

─────────────────────────────
To unsubscribe: ${unsubUrl}`;
}

async function sendAlertToOne(
  transporter: nodemailer.Transporter,
  to: string,
  result: AvailabilityResult,
  unsubUrl: string
): Promise<void> {
  await transporter.sendMail({
    from: fromAddress(),
    to,
    subject: `[IN STOCK] Mac mini M4 Pro at ${result.retailer}`,
    text: buildAlertBody(result, unsubUrl),
  });
}

// ─── Subscription confirmation ───────────────────────────────────────────────

export async function sendSubscriptionConfirmation(
  email: string,
  unsubToken: string,
  origin: string
): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log("[Notify] SMTP not configured — skipping confirmation");
    return;
  }

  const unsubUrl = `${origin}/api/unsubscribe?token=${unsubToken}`;

  await transporter.sendMail({
    from: fromAddress(),
    to: email,
    subject: "[Mac mini Tracker] You're subscribed to in-stock alerts",
    text: `You're now subscribed to Mac mini M4 Pro availability alerts.

You'll receive an email as soon as any of these retailers has the following in stock:

  Apple Mac mini M4 Pro
  14-core CPU / 20-core GPU / 64GB / 1TB

Retailers monitored:
  - B&H Photo
  - Apple
  - Best Buy
  - Adorama

─────────────────────────────
To unsubscribe at any time: ${unsubUrl}`,
  });

  console.log(`[Notify] Subscription confirmation sent to ${email}`);
}

// ─── SMTP health-check confirmation ─────────────────────────────────────────

export async function sendSmtpConfirmation(): Promise<void> {
  const { SMTP_HOST, ALERT_EMAIL_TO } = process.env;
  if (!SMTP_HOST || !ALERT_EMAIL_TO) return;

  const transporter = createTransporter();
  if (!transporter) return;

  try {
    await transporter.sendMail({
      from: fromAddress(),
      to: ALERT_EMAIL_TO,
      subject: "[Mac mini Tracker] Email notifications are active",
      text: `Your Mac mini Availability Tracker is configured and ready.

You will receive an alert at this address whenever any retailer transitions
from Out of Stock to In Stock for:

  Apple Mac mini M4 Pro
  14-core CPU / 20-core GPU / 64GB / 1TB

Retailers monitored:
  - B&H Photo
  - Apple
  - Best Buy
  - Adorama

This is a one-time confirmation that your SMTP settings are working correctly.`,
    });
    console.log(`[Notify] Confirmation email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    console.error("[Notify] Failed to send confirmation email:", err);
  }
}

// ─── In-stock fan-out ────────────────────────────────────────────────────────

async function sendWebhook(result: AvailabilityResult): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `IN STOCK at ${result.retailer}! ${result.productUrl}`, result }),
    });
    console.log(`[Notify] Webhook fired for ${result.retailer}`);
  } catch (err) {
    console.error("[Notify] Webhook error:", err);
  }
}

// Sends in-stock alerts to: ALERT_EMAIL_TO env + all DB subscribers. Never throws.
export async function sendInStockNotification(result: AvailabilityResult): Promise<void> {
  try {
    const transporter = createTransporter();

    const tasks: Promise<unknown>[] = [sendWebhook(result)];

    if (transporter) {
      // Env-configured recipient
      const envTo = process.env.ALERT_EMAIL_TO;

      // All DB subscribers
      const subscribers = await prisma.subscriber.findMany({ select: { email: true, unsubToken: true } });

      const allRecipients = [
        ...(envTo ? [{ email: envTo, unsubToken: "" }] : []),
        ...subscribers,
      ];

      const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      for (const { email, unsubToken } of allRecipients) {
        const unsubUrl = unsubToken
          ? `${origin}/api/unsubscribe?token=${unsubToken}`
          : `${origin}/api/unsubscribe`;
        tasks.push(
          sendAlertToOne(transporter, email, result, unsubUrl).catch((err) =>
            console.error(`[Notify] Failed to email ${email}:`, err)
          )
        );
      }

      console.log(`[Notify] Sending in-stock alert to ${allRecipients.length} recipient(s)`);
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error("[Notify] Unexpected error:", err);
  }
}
