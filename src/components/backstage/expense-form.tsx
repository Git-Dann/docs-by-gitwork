"use client";

import { useState } from "react";
import imageCompression from "browser-image-compression";
import { useCreateExpense, useUploadReceipt } from "@/hooks/use-backstage";
import type { ExpenseCategory } from "@/types/backstage";

const CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "TRAVEL", label: "Travel" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "SOFTWARE", label: "Software" },
  { value: "MEALS", label: "Meals" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "OTHER", label: "Other" },
];

const CURRENCIES = ["GBP", "USD", "EUR", "PKR"];

const COMPRESSION_OPTS: Parameters<typeof imageCompression>[1] = {
  maxSizeMB: 0.4,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: "image/jpeg",
  initialQuality: 0.85,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseForm({
  onSubmitted,
  onCancel,
}: {
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const create = useCreateExpense();
  const upload = useUploadReceipt();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [category, setCategory] = useState<ExpenseCategory>("TRAVEL");
  const [vendor, setVendor] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCompressing(true);
    try {
      const compressed = await imageCompression(file, COMPRESSION_OPTS);
      setReceipt(compressed);
      setCompressedSize(compressed.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compress image");
    } finally {
      setCompressing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    try {
      const expense = await create.mutateAsync({
        amount: amountNum,
        currency,
        category,
        vendor: vendor.trim() || undefined,
        occurredOn,
        notes: notes.trim() || undefined,
      });
      if (receipt) {
        await upload.mutateAsync({ expenseId: expense.id, file: receipt });
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[10px] border border-[var(--border-2)] bg-white p-5 shadow-[var(--shadow-xs)]"
    >
      <h3 className="text-base font-semibold text-[var(--text-1)]">New expense</h3>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-[var(--text-2)]">Amount</span>
          <div className="mt-1 flex gap-1.5">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              required
              className="block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
              placeholder="0.00"
            />
            <select
              value={currency}
              onChange={(ev) => setCurrency(ev.target.value)}
              className="rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-2 text-sm text-[var(--text-1)]"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[var(--text-2)]">Category</span>
          <select
            value={category}
            onChange={(ev) => setCategory(ev.target.value as ExpenseCategory)}
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[var(--text-2)]">
            Vendor <span className="text-[var(--text-4)]">(optional)</span>
          </span>
          <input
            type="text"
            value={vendor}
            onChange={(ev) => setVendor(ev.target.value)}
            maxLength={120}
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
            placeholder="Trainline, Apple, Pret…"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[var(--text-2)]">Date</span>
          <input
            type="date"
            value={occurredOn}
            onChange={(ev) => setOccurredOn(ev.target.value)}
            required
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-[var(--text-2)]">
            Notes <span className="text-[var(--text-4)]">(optional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(ev) => setNotes(ev.target.value)}
            rows={2}
            maxLength={1000}
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-[var(--text-2)]">Receipt</span>
          <input
            type="file"
            accept="image/*"
            // capture=environment hints to mobile browsers to use the rear camera by default;
            // desktop browsers fall back to a normal file picker.
            capture="environment"
            onChange={handleFileChange}
            className="mt-1 block w-full text-sm text-[var(--text-2)] file:mr-2 file:rounded-[6px] file:border-0 file:bg-[var(--surface-1)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--text-1)]"
          />
          <p className="mt-1 text-xs text-[var(--text-4)]">
            {compressing ? "Compressing…" : null}
            {compressedSize
              ? `Compressed to ${(compressedSize / 1024).toFixed(0)} KB`
              : null}
            {!compressing && !compressedSize ? "Optional — image is compressed in the browser before upload." : null}
          </p>
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="submit"
          disabled={create.isPending || upload.isPending || compressing}
          className="rounded-[6px] bg-[var(--brand-600)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-xs)] transition hover:bg-[var(--brand-700)] disabled:opacity-60"
        >
          {create.isPending || upload.isPending ? "Submitting…" : "Submit expense"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[6px] border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
