import type { AvailabilityResult, RetailerConnector, StockStatus } from "@/lib/types";

// Best Buy SKU for Apple Mac mini M4 Pro / 14c CPU / 20c GPU / 64GB / 1TB
// Confirm this SKU at bestbuy.com before trusting results.
const BESTBUY_SKU = "6602481";
const PRODUCT_URL = `https://www.bestbuy.com/site/${BESTBUY_SKU}.p`;
const BB_API_BASE = "https://api.bestbuy.com/v1";

type BestBuyApiProduct = {
  name?: string;
  salePrice?: number;
  regularPrice?: number;
  inStoreAvailability?: boolean;
  onlineAvailability?: boolean;
  availabilityMessageCode?: string;
};

type BestBuyApiResponse = {
  products?: BestBuyApiProduct[];
};

function normalizeAvailability(product: BestBuyApiProduct): StockStatus {
  if (product.onlineAvailability === true) return "IN_STOCK";
  if (product.onlineAvailability === false) return "OUT_OF_STOCK";
  // availabilityMessageCode: "AVAILABLE", "SOLDOUT", "UNAVAILABLE", etc.
  const code = product.availabilityMessageCode?.toUpperCase() ?? "";
  if (code === "AVAILABLE") return "IN_STOCK";
  if (code === "SOLDOUT" || code === "UNAVAILABLE") return "OUT_OF_STOCK";
  return "UNKNOWN";
}

export class BestBuyConnector implements RetailerConnector {
  name = "Best Buy";

  async checkAvailability(): Promise<AvailabilityResult> {
    const checkedAt = new Date().toISOString();
    const apiKey = process.env.BESTBUY_API_KEY;

    if (!apiKey) {
      // No API key — return UNKNOWN rather than an unreliable scrape
      return {
        retailer: this.name,
        stockStatus: "UNKNOWN",
        price: null,
        productTitle: null,
        productUrl: PRODUCT_URL,
        checkedAt,
        sourceType: "placeholder",
        rawStockText: "No BESTBUY_API_KEY configured",
      };
    }

    try {
      const url = `${BB_API_BASE}/products/${BESTBUY_SKU}.json?apiKey=${apiKey}&format=json&show=name,salePrice,regularPrice,inStoreAvailability,onlineAvailability,availabilityMessageCode`;
      const res = await fetch(url, { next: { revalidate: 0 } });

      if (!res.ok) {
        console.error(`[Best Buy] API HTTP ${res.status}`);
        return {
          retailer: this.name,
          stockStatus: "UNKNOWN",
          price: null,
          productTitle: null,
          productUrl: PRODUCT_URL,
          checkedAt,
          sourceType: "api",
          rawStockText: `API HTTP ${res.status}`,
        };
      }

      // Best Buy single-product endpoint returns the product directly (not wrapped in products[])
      const data = (await res.json()) as BestBuyApiProduct | BestBuyApiResponse;
      const product: BestBuyApiProduct =
        "products" in data && Array.isArray(data.products) ? data.products[0] ?? {} : (data as BestBuyApiProduct);

      const stockStatus = normalizeAvailability(product);
      const price = product.salePrice ?? product.regularPrice ?? null;

      return {
        retailer: this.name,
        stockStatus,
        price,
        productTitle: product.name ?? null,
        productUrl: PRODUCT_URL,
        checkedAt,
        sourceType: "api",
        rawStockText: product.availabilityMessageCode ?? null,
      };
    } catch (err) {
      console.error("[Best Buy] Error:", err);
      return {
        retailer: this.name,
        stockStatus: "UNKNOWN",
        price: null,
        productTitle: null,
        productUrl: PRODUCT_URL,
        checkedAt,
        sourceType: "api",
        rawStockText: String(err),
      };
    }
  }
}
