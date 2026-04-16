import type { AvailabilityResult, RetailerConnector, StockStatus } from "@/lib/types";

const PRODUCT_URL =
  process.env.ADORAMA_PRODUCT_URL ??
  "https://www.adorama.com/apple-mac-mini-m4-pro-desktop-computer-2024/p/acmnm4p24";

// Target config to match inside the ProductGroup's hasVariant list
const TARGET = { cpuGpu: "14-Core / 20-Core", memory: "64GB", storage: "1TB SSD" };

const SCHEMA_AVAILABILITY: Record<string, StockStatus> = {
  "https://schema.org/InStock": "IN_STOCK",
  "http://schema.org/InStock": "IN_STOCK",
  "https://schema.org/OutOfStock": "OUT_OF_STOCK",
  "http://schema.org/OutOfStock": "OUT_OF_STOCK",
  "https://schema.org/BackOrder": "OUT_OF_STOCK",
  "http://schema.org/BackOrder": "OUT_OF_STOCK",
  "https://schema.org/SoldOut": "OUT_OF_STOCK",
  "http://schema.org/SoldOut": "OUT_OF_STOCK",
  "https://schema.org/Discontinued": "OUT_OF_STOCK",
  "http://schema.org/Discontinued": "OUT_OF_STOCK",
};

type AdoramaOffer = {
  "@type"?: string;
  price?: string | number;
  availability?: string;
  url?: string;
};

type AdoramaVariant = {
  "@type"?: string;
  sku?: string;
  name?: string;
  offers?: AdoramaOffer;
  additionalProperty?: { "@type"?: string; name?: string; value?: string }[];
};

type AdoramaProductGroup = {
  "@type"?: string;
  name?: string;
  hasVariant?: AdoramaVariant[];
};

function matchesTarget(variant: AdoramaVariant): boolean {
  const props: Record<string, string> = {};
  for (const p of variant.additionalProperty ?? []) {
    if (p.name && p.value) props[p.name] = p.value;
  }
  return (
    props["cpu/gpu"] === TARGET.cpuGpu &&
    props["memory"] === TARGET.memory &&
    props["storage"] === TARGET.storage
  );
}

// Adorama's product pages are protected by PerimeterX and require a real
// browser with specific launch flags to get past the bot check.
// This is gated behind FEATURE_ADORAMA_PLAYWRIGHT=true.
async function scrapeWithPlaywright(): Promise<AvailabilityResult> {
  const checkedAt = new Date().toISOString();

  // Dynamic import keeps Playwright out of the module graph when the flag is off
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });

    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await ctx.newPage();

    await page.goto(PRODUCT_URL, { waitUntil: "domcontentloaded", timeout: 25000 });
    // Let dynamic content settle
    await page.waitForTimeout(4000);

    const jsonldBlocks: unknown[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => {
        try {
          return JSON.parse(s.textContent ?? "");
        } catch {
          return null;
        }
      }).filter(Boolean)
    );

    const group = jsonldBlocks.find(
      (x) => (x as AdoramaProductGroup)["@type"] === "ProductGroup"
    ) as AdoramaProductGroup | undefined;

    if (!group) {
      return {
        retailer: "Adorama",
        stockStatus: "UNKNOWN",
        price: null,
        productTitle: null,
        productUrl: PRODUCT_URL,
        checkedAt,
        sourceType: "scrape",
        rawStockText: "ProductGroup JSON-LD not found",
      };
    }

    // Collect all variants that match our exact config
    const matches = (group.hasVariant ?? []).filter(matchesTarget);

    if (matches.length === 0) {
      return {
        retailer: "Adorama",
        stockStatus: "UNKNOWN",
        price: null,
        productTitle: group.name ?? null,
        productUrl: PRODUCT_URL,
        checkedAt,
        sourceType: "scrape",
        rawStockText: "No matching variant found for target config",
      };
    }

    // Prefer an IN_STOCK variant; otherwise use the first match
    const best =
      matches.find((v) => SCHEMA_AVAILABILITY[v.offers?.availability ?? ""] === "IN_STOCK") ??
      matches[0];

    const availabilityUri = best.offers?.availability ?? "";
    const stockStatus: StockStatus = SCHEMA_AVAILABILITY[availabilityUri] ?? "UNKNOWN";
    const rawPrice = best.offers?.price;
    const price =
      rawPrice != null ? parseFloat(String(rawPrice).replace(/[^0-9.]/g, "")) : null;

    return {
      retailer: "Adorama",
      stockStatus,
      price: price != null && !isNaN(price) ? price : null,
      productTitle: best.name ?? group.name ?? null,
      productUrl: best.offers?.url ?? PRODUCT_URL,
      checkedAt,
      sourceType: "scrape",
      rawStockText: availabilityUri || null,
    };
  } finally {
    await browser.close();
  }
}

export class AdoramaConnector implements RetailerConnector {
  name = "Adorama";

  async checkAvailability(): Promise<AvailabilityResult> {
    const checkedAt = new Date().toISOString();

    if (process.env.FEATURE_ADORAMA_PLAYWRIGHT !== "true") {
      return {
        retailer: this.name,
        stockStatus: "UNKNOWN",
        price: null,
        productTitle: null,
        productUrl: PRODUCT_URL,
        checkedAt,
        sourceType: "placeholder",
        rawStockText: "Set FEATURE_ADORAMA_PLAYWRIGHT=true to enable scraping",
      };
    }

    try {
      return await scrapeWithPlaywright();
    } catch (err) {
      console.error("[Adorama] Playwright error:", err);
      return {
        retailer: this.name,
        stockStatus: "UNKNOWN",
        price: null,
        productTitle: null,
        productUrl: PRODUCT_URL,
        checkedAt,
        sourceType: "scrape",
        rawStockText: String(err),
      };
    }
  }
}
