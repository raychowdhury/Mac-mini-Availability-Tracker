import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSubscriptionConfirmation } from "@/lib/notifications";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Derive base URL for the unsubscribe link
  const origin = req.headers.get("origin") ?? `https://${req.headers.get("host")}`;

  try {
    // Upsert — re-subscribing an existing email just re-sends the confirmation
    const subscriber = await prisma.subscriber.upsert({
      where: { email },
      create: { email },
      update: {}, // keep existing token
    });

    await sendSubscriptionConfirmation(subscriber.email, subscriber.unsubToken, origin);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Subscribe]", err);
    return NextResponse.json({ error: "Subscription failed" }, { status: 500 });
  }
}
