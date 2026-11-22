"use client";

import { useState } from "react";

/**
 * One inventory row (S-4, T-44) — per-row save, not bulk. Each row
 * saves on its own: the new stock is written to products.stock_total
 * at once, so shoppers see the change immediately (the storefront
 * reads stock_total on every catalogue read).
 */
export default function InventoryRow({
  productId,
  productName,
  colour,
  stockTotal,
}: {
  productId: string;
  productName: string;
  colour: string | null;
  stockTotal: number;
}) {
  const [stock, setStock] = useState(String(stockTotal));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const low = Number(stock) <= 2;

  async function handleSave() {
    setMessage(null);
    setError(null);
    if (stock.trim() === "" || Number.isNaN(Number(stock))) {
      setError("Enter a stock quantity.");
      return;
    }
    const value = Math.floor(Number(stock));
    if (value < 0) {
      setError("Stock cannot be negative.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, stockTotal: value }),
      });
      const json: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Stock could not be saved.");
        return;
      }
      setMessage("Saved");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 font-semibold text-text">{productName}</td>
      <td className="px-4 py-3 text-text-secondary">{colour ?? "—"}</td>
      <td className="px-4 py-3">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={stock}
          onChange={(event) => {
            setStock(event.target.value);
            setMessage(null);
            setError(null);
          }}
          aria-label={`Stock for ${productName}`}
          className="h-11 w-24 rounded-md border border-border bg-background px-3 text-base text-text"
        />
        {low ? (
          <span className="ml-2 font-semibold text-stock-low">Low stock</span>
        ) : null}
        {error ? (
          <span className="mt-1 block text-sm text-error">{error}</span>
        ) : null}
        {message ? (
          <span role="status" className="mt-1 block text-sm text-stock-in">
            {message}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-11 rounded-md bg-action px-4 py-2 font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}
