import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Canonical retailer list — every connector that exists, in display order.
// Add a new entry here whenever a new connector is added.
const KNOWN_RETAILERS = ["B&H Photo", "Apple", "Best Buy", "Adorama"];

export async function GET() {
  try {
    const rows = await prisma.currentAvailability.findMany({
      orderBy: { retailer: "asc" },
    });

    const byRetailer = new Map(rows.map((r) => [r.retailer, r]));

    // Merge: return a row for every known retailer, placeholder if not yet checked
    const results = KNOWN_RETAILERS.map((name) => {
      const existing = byRetailer.get(name);
      if (existing) return existing;
      return {
        retailer: name,
        stockStatus: "UNKNOWN",
        price: null,
        rawStockText: "Not yet checked",
        sourceType: "placeholder",
        productUrl: "",
        checkedAt: null,
      };
    });

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[/api/status] DB error:", err);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
