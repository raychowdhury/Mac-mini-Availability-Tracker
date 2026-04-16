import { BHConnector } from "@/connectors/bh";
import { AppleConnector } from "@/connectors/apple";
import { BestBuyConnector } from "@/connectors/bestbuy";
import { AdoramaConnector } from "@/connectors/adorama";
import { prisma } from "@/lib/db";
import { sendInStockNotification } from "@/lib/notifications";
import type { AvailabilityResult } from "@/lib/types";

const connectors = [new BHConnector(), new AppleConnector(), new BestBuyConnector(), new AdoramaConnector()];

async function persistResult(result: AvailabilityResult): Promise<void> {
  const checkedAt = new Date(result.checkedAt);

  // Write to log (append-only history)
  await prisma.availabilityLog.create({
    data: {
      retailer: result.retailer,
      stockStatus: result.stockStatus,
      price: result.price ?? null,
      rawStockText: result.rawStockText ?? null,
      sourceType: result.sourceType,
      productUrl: result.productUrl,
      checkedAt,
    },
  });

  // Upsert current availability
  await prisma.currentAvailability.upsert({
    where: { retailer: result.retailer },
    create: {
      retailer: result.retailer,
      stockStatus: result.stockStatus,
      price: result.price ?? null,
      rawStockText: result.rawStockText ?? null,
      sourceType: result.sourceType,
      productUrl: result.productUrl,
      checkedAt,
    },
    update: {
      stockStatus: result.stockStatus,
      price: result.price ?? null,
      rawStockText: result.rawStockText ?? null,
      sourceType: result.sourceType,
      productUrl: result.productUrl,
      checkedAt,
    },
  });
}

async function checkTransitionAndNotify(result: AvailabilityResult): Promise<void> {
  if (result.stockStatus !== "IN_STOCK") return;

  // Look up the most recent log entry before this check
  const previous = await prisma.availabilityLog.findFirst({
    where: {
      retailer: result.retailer,
      checkedAt: { lt: new Date(result.checkedAt) },
    },
    orderBy: { checkedAt: "desc" },
  });

  // Notify only on OUT_OF_STOCK → IN_STOCK transition
  if (previous?.stockStatus === "OUT_OF_STOCK") {
    console.log(`[Tracker] Transition detected for ${result.retailer}: OUT_OF_STOCK → IN_STOCK`);
    await sendInStockNotification(result);
  }
}

export async function checkAllRetailers(): Promise<AvailabilityResult[]> {
  // Run all connectors concurrently; isolate failures
  const settled = await Promise.allSettled(
    connectors.map((c) =>
      c.checkAvailability().catch((err) => {
        console.error(`[${c.name}] Unhandled error:`, err);
        const result: AvailabilityResult = {
          retailer: c.name,
          stockStatus: "UNKNOWN",
          price: null,
          productTitle: null,
          productUrl: "",
          checkedAt: new Date().toISOString(),
          sourceType: "placeholder",
          rawStockText: String(err),
        };
        return result;
      })
    )
  );

  const results: AvailabilityResult[] = settled.map((s) =>
    s.status === "fulfilled" ? s.value : s.reason
  );

  // Persist and check transitions concurrently per retailer, but don't let
  // persistence failures block returning results
  await Promise.allSettled(
    results.map(async (result) => {
      try {
        await checkTransitionAndNotify(result);
        await persistResult(result);
      } catch (err) {
        console.error(`[Persist] Error for ${result.retailer}:`, err);
      }
    })
  );

  return results;
}
