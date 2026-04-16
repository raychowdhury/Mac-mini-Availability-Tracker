import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const HTML = (msg: string, color: string) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mac mini Tracker</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:2rem 2.5rem;max-width:380px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)}
h2{margin:0 0 .5rem;color:${color}}p{color:#6b7280;margin:0}</style></head>
<body><div class="card"><h2>${msg}</h2>
<p>Mac mini M4 Pro Availability Tracker</p></div></body></html>`;

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");

  if (!token) {
    return new NextResponse(HTML("Invalid unsubscribe link.", "#dc2626"), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    await prisma.subscriber.delete({ where: { unsubToken: token } });
    return new NextResponse(HTML("You've been unsubscribed.", "#16a34a"), {
      headers: { "Content-Type": "text/html" },
    });
  } catch {
    // Record not found — already unsubscribed or invalid token
    return new NextResponse(HTML("Already unsubscribed.", "#4b5563"), {
      headers: { "Content-Type": "text/html" },
    });
  }
}
