"use client";

import { useEffect, useState } from "react";

type StockStatus = "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

type Row = {
  retailer: string;
  stockStatus: StockStatus;
  price: number | null;
  sourceType: string;
  productUrl: string;
  checkedAt: string;
  rawStockText?: string | null;
};

function StatusBadge({ status }: { status: StockStatus }) {
  if (status === "IN_STOCK") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
        In Stock
      </span>
    );
  }
  if (status === "OUT_OF_STOCK") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
        Out of Stock
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
      Unknown
    </span>
  );
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results: Row[] };
      setRows(data.results);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/check", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results: Row[] };
      setRows(data.results);
    } catch (err) {
      setError(String(err));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      {/* Product heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Mac mini Availability Tracker
        </h1>
        <div className="mt-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          <p className="font-medium text-gray-800">Apple Mac mini — M4 Pro chip</p>
          <p>14-core CPU &middot; 20-core GPU &middot; 64 GB RAM &middot; 1 TB SSD</p>
          <p className="mt-1 text-xs text-gray-400">B&H SKU: APZ1VMM77AC</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {rows.length > 0
            ? `Last refreshed: ${formatDate(rows.map((r) => r.checkedAt).sort().at(-1) ?? "")}`
            : "No data yet — click Refresh to fetch availability"}
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {refreshing ? "Checking…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Retailer</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Price</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Source</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Last Checked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No availability data yet. Click <strong>Refresh</strong> to run the first check.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.retailer} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <a
                      href={row.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      {row.retailer}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.stockStatus} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatPrice(row.price)}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{row.sourceType}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(row.checkedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Notification note */}
      <p className="mt-4 text-xs text-gray-400">
        Notifications fire automatically when a retailer transitions from Out of Stock to In Stock.
        Configure SMTP settings in your environment to receive email alerts.
      </p>
    </main>
  );
}
