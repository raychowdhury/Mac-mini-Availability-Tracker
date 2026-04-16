import { NextResponse } from "next/server";
import { sendSmtpConfirmation } from "@/lib/notifications";

export async function POST() {
  await sendSmtpConfirmation();
  return NextResponse.json({ ok: true });
}
