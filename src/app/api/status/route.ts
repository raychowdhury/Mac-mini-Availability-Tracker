import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const rows = await prisma.currentAvailability.findMany({
      orderBy: { retailer: "asc" },
    });

    return NextResponse.json({ results: rows });
  } catch (err) {
    console.error("[/api/status] DB error:", err);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
