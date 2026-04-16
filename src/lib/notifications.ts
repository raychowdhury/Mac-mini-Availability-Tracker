import nodemailer from "nodemailer";
import type { AvailabilityResult } from "@/lib/types";

function buildEmailBody(result: AvailabilityResult): string {
  const priceStr = result.price != null ? `$${result.price.toFixed(2)}` : "Price not available";
  return `
Good news! The Mac mini M4 Pro (64GB / 1TB) is now IN STOCK.

Retailer : ${result.retailer}
Price    : ${priceStr}
Link     : ${result.productUrl}
Checked  : ${result.checkedAt}

Go get it before it sells out again!
`.trim();
}

async function sendEmail(result: AvailabilityResult): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO } = process.env;

  if (!SMTP_HOST || !ALERT_EMAIL_TO) {
    console.log("[Notify] SMTP not configured — skipping email notification");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
    secure: SMTP_PORT === "465",
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: SMTP_USER ?? `tracker@${SMTP_HOST}`,
    to: ALERT_EMAIL_TO,
    subject: `[IN STOCK] Mac mini M4 Pro at ${result.retailer}`,
    text: buildEmailBody(result),
  });

  console.log(`[Notify] Email sent to ${ALERT_EMAIL_TO} for ${result.retailer}`);
}

async function sendWebhook(result: AvailabilityResult): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `IN STOCK at ${result.retailer}! ${result.productUrl}`,
        result,
      }),
    });
    console.log(`[Notify] Webhook fired for ${result.retailer}`);
  } catch (err) {
    console.error("[Notify] Webhook error:", err);
  }
}

// Fire all configured notification channels. Never throws.
export async function sendInStockNotification(result: AvailabilityResult): Promise<void> {
  try {
    await Promise.allSettled([sendEmail(result), sendWebhook(result)]);
  } catch (err) {
    console.error("[Notify] Unexpected error:", err);
  }
}

// Send a one-time confirmation that SMTP is working. Never throws.
export async function sendSmtpConfirmation(): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO } = process.env;
  if (!SMTP_HOST || !ALERT_EMAIL_TO) return;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
      secure: SMTP_PORT === "465",
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });

    await transporter.sendMail({
      from: SMTP_USER ?? `tracker@${SMTP_HOST}`,
      to: ALERT_EMAIL_TO,
      subject: "[Mac mini Tracker] Email notifications are active",
      text: `Your Mac mini Availability Tracker is configured and ready.\n\nYou will receive an alert at this address whenever any retailer transitions from Out of Stock to In Stock for:\n\n  Apple Mac mini M4 Pro\n  14-core CPU / 20-core GPU / 64GB / 1TB\n\nRetailers monitored:\n  - B&H Photo\n  - Apple\n  - Best Buy\n  - Adorama\n\nThis is a one-time confirmation that your SMTP settings are working correctly.`,
    });

    console.log(`[Notify] Confirmation email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    console.error("[Notify] Failed to send confirmation email:", err);
  }
}
