export type StockStatus = "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

export type AvailabilityResult = {
  retailer: string;
  stockStatus: StockStatus;
  price?: number | null;
  productTitle?: string | null;
  productUrl: string;
  checkedAt: string; // ISO string
  sourceType: "api" | "scrape" | "placeholder" | "fallback";
  rawStockText?: string | null;
};

export interface RetailerConnector {
  name: string;
  checkAvailability(): Promise<AvailabilityResult>;
}
