import { NextResponse } from "next/server";
import { checkAllRetailers } from "@/lib/checkAllRetailers";

export async function POST() {
  try {
    const results = await checkAllRetailers();
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[/api/check] Error:", err);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
