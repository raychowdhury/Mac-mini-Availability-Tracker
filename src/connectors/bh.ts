import { parse } from "node-html-parser";
import type { AvailabilityResult, RetailerConnector, StockStatus } from "@/lib/types";

// B&H Schema.org availability URIs → our StockStatus
const SCHEMA_AVAILABILITY_MAP: Record<string, StockStatus> = {
  "https://schema.org/InStock": "IN_STOCK",
  "http://schema.org/InStock": "IN_STOCK",
  "https://schema.org/OutOfStock": "OUT_OF_STOCK",
  "http://schema.org/OutOfStock": "OUT_OF_STOCK",
  "https://schema.org/PreOrder": "OUT_OF_STOCK",
  "http://schema.org/PreOrder": "OUT_OF_STOCK",
  "https://schema.org/SoldOut": "OUT_OF_STOCK",
  "http://schema.org/SoldOut": "OUT_OF_STOCK",
  "https://schema.org/Discontinued": "OUT_OF_STOCK",
  "http://schema.org/Discontinued": "OUT_OF_STOCK",
};

// Loose text patterns for fallback parsing
function parseStockTextFallback(text: string): StockStatus {
  const lower = text.toLowerCase();
  if (lower.includes("in stock") || lower.includes("add to cart")) return "IN_STOCK";
  if (
    lower.includes("out of stock") ||
    lower.includes("temporarily") ||
    lower.includes("unavailable") ||
    lower.includes("back-order") ||
    lower.includes("backorder")
  )
    return "OUT_OF_STOCK";
  return "UNKNOWN";
}

function extractFromJsonLd(html: string): {
  stockStatus: StockStatus;
  price: number | null;
  productTitle: string | null;
  rawStockText: string | null;
} | null {
  const root = parse(html);
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const product = data["@type"] === "Product" ? data : (data["@graph"] as unknown[])?.find((x: unknown) => (x as Record<string, string>)["@type"] === "Product");
      if (!product) continue;

      const p = product as Record<string, unknown>;
      const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      if (!offers) continue;

      const availabilityUri = (offers as Record<string, string>).availability ?? "";
      const stockStatus: StockStatus = SCHEMA_AVAILABILITY_MAP[availabilityUri] ?? "UNKNOWN";
      const rawPrice = (offers as Record<string, unknown>).price;
      const price =
        rawPrice !== undefined && rawPrice !== null
          ? parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""))
          : null;

      return {
        stockStatus,
        price: isNaN(price as number) ? null : (price as number),
        productTitle: typeof p.name === "string" ? p.name : null,
        rawStockText: availabilityUri || null,
      };
    } catch {
      // malformed JSON-LD — try next script tag
    }
  }
  return null;
}

function extractFallback(html: string): {
  stockStatus: StockStatus;
  price: number | null;
  rawStockText: string | null;
} {
  const root = parse(html);

  // B&H uses data-selenium attributes for stock status
  const stockEl =
    root.querySelector('[data-selenium="stockStatus"]') ??
    root.querySelector('[class*="status"]') ??
    null;
  const rawStockText = stockEl?.text?.trim() ?? null;
  const stockStatus = rawStockText ? parseStockTextFallback(rawStockText) : "UNKNOWN";

  // Try to find price in data-selenium="price" or common price class patterns
  const priceEl =
    root.querySelector('[data-selenium="pricingPrice"]') ??
    root.querySelector('[data-selenium="price"]') ??
    root.querySelector('[class*="price"]') ??
    null;
  const priceText = priceEl?.text?.replace(/[^0-9.]/g, "") ?? "";
  const price = priceText ? parseFloat(priceText) : null;

  return { stockStatus, price: isNaN(price as number) ? null : (price as number), rawStockText };
}

export class BHConnector implements RetailerConnector {
  name = "B&H Photo";

  private get productUrl(): string {
    const url = process.env.BH_PRODUCT_URL;
    if (!url) throw new Error("BH_PRODUCT_URL is not set");
    return url;
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    const productUrl = this.productUrl;
    const checkedAt = new Date().toISOString();

    try {
      const res = await fetch(productUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        console.error(`[B&H] HTTP ${res.status} fetching product page`);
        return {
          retailer: this.name,
          stockStatus: "UNKNOWN",
          price: null,
          productTitle: null,
          productUrl,
          checkedAt,
          sourceType: "scrape",
          rawStockText: `HTTP ${res.status}`,
        };
      }

      const html = await res.text();

      // Try JSON-LD first (most reliable)
      const jsonLdResult = extractFromJsonLd(html);
      if (jsonLdResult) {
        return {
          retailer: this.name,
          stockStatus: jsonLdResult.stockStatus,
          price: jsonLdResult.price,
          productTitle: jsonLdResult.productTitle,
          productUrl,
          checkedAt,
          sourceType: "scrape",
          rawStockText: jsonLdResult.rawStockText,
        };
      }

      // Fallback to HTML element parsing
      const fallback = extractFallback(html);
      return {
        retailer: this.name,
        stockStatus: fallback.stockStatus,
        price: fallback.price,
        productTitle: null,
        productUrl,
        checkedAt,
        sourceType: "fallback",
        rawStockText: fallback.rawStockText,
      };
    } catch (err) {
      console.error("[B&H] Error:", err);
      return {
        retailer: this.name,
        stockStatus: "UNKNOWN",
        price: null,
        productTitle: null,
        productUrl,
        checkedAt,
        sourceType: "scrape",
        rawStockText: String(err),
      };
    }
  }
}
