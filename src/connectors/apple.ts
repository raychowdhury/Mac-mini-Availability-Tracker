import type { AvailabilityResult, RetailerConnector } from "@/lib/types";

// Apple does not expose a stable public API or reliably server-render exact
// config availability for third-party consumption. Until a stable source is
// identified, this connector always returns UNKNOWN.
//
// To enable Playwright-based scraping set FEATURE_APPLE_PLAYWRIGHT=true.
// That path is intentionally not implemented here; add it behind the flag
// when a reliable DOM target is confirmed.

const PRODUCT_URL =
  "https://www.apple.com/shop/buy-mac/mac-mini/apple-m4-pro-chip-with-14-core-cpu-and-20-core-gpu-64gb-memory-1tb";

export class AppleConnector implements RetailerConnector {
  name = "Apple";

  async checkAvailability(): Promise<AvailabilityResult> {
    const featureFlag = process.env.FEATURE_APPLE_PLAYWRIGHT === "true";

    if (featureFlag) {
      // Playwright path reserved — implement once a reliable selector is found.
      console.warn("[Apple] FEATURE_APPLE_PLAYWRIGHT=true but not yet implemented");
    }

    return {
      retailer: this.name,
      stockStatus: "UNKNOWN",
      price: null,
      productTitle: "Apple Mac mini M4 Pro / 14-core CPU / 64GB / 1TB",
      productUrl: PRODUCT_URL,
      checkedAt: new Date().toISOString(),
      sourceType: "placeholder",
      rawStockText: null,
    };
  }
}
