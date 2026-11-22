"use client";

import { productSaveSchema } from "@/app/admin/(protected)/admin-schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Add / Edit Product form (S-4, T-42) — client component.
 *
 * A product cannot be saved without a price, a photo and stock:
 * the form blocks the save (and shows a plain error) when the price
 * is empty or 0, when no photo is uploaded (and none exists yet),
 * or when the stock field is empty. The same rules are enforced
 * again by the server (Zod in the API route) — the client check is
 * only for a fast, friendly error.
 *
 * Photo flow: pick a file -> POST /api/admin/products/upload ->
 * the public URL is stored and sent with the save. Editing keeps
 * the existing photo unless a new file is picked.
 *
 * The preview shows only the already-saved photo (a URL from our own
 * Storage, passed in as `initial`). A newly picked file is shown by
 * file name, never as a blob-URL preview: rendering an object URL
 * built from a user-picked file trips the CodeQL xss-through-dom
 * check, and the upload route already validates type + size
 * server-side before the file is stored.
 */

export interface ProductFormInitial {
  id: string;
  name: string;
  categoryId: string | null;
  priceBdt: number;
  stockTotal: number;
  status: "active" | "inactive";
  description: string;
  colour: string;
  imageUrl: string | null;
}

const inputClass =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-text placeholder:text-text-secondary";

export default function ProductForm({
  categories,
  initial,
  mode,
}: {
  categories: { id: string; name: string }[];
  initial: ProductFormInitial | null;
  mode: "add" | "edit";
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [price, setPrice] = useState(
    initial ? String(initial.priceBdt) : "",
  );
  const [stock, setStock] = useState(
    initial ? String(initial.stockTotal) : "",
  );
  const [status, setStatus] = useState<"active" | "inactive">(
    initial?.status ?? "active",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [colour, setColour] = useState(initial?.colour ?? "Black");
  const [imageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [selectedPhotoName, setSelectedPhotoName] = useState<string | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handlePhotoChange(file: File | null) {
    setPhotoFile(file);
    setSelectedPhotoName(file ? file.name : null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const fieldErrors: Record<string, string> = {};

    // Client-side gate: no save without price, photo and stock.
    if (price.trim() === "" || Number(price) <= 0) {
      fieldErrors.priceBdt = "Enter a price greater than ৳0.";
    }
    if (stock.trim() === "") {
      fieldErrors.stockTotal = "Enter the stock quantity.";
    }
    if (!photoFile && !imageUrl) {
      fieldErrors.imageUrl = "Upload a product photo.";
    }
    if (name.trim().length < 2) {
      fieldErrors.name = "Enter a product name.";
    }
    if (colour.trim() === "") {
      fieldErrors.colour = "Enter a colour.";
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      let finalImageUrl = imageUrl;
      if (photoFile) {
        const uploadData = new FormData();
        uploadData.append("file", photoFile);
        const uploadRes = await fetch("/api/admin/products/upload", {
          method: "POST",
          body: uploadData,
        });
        const uploadJson: { ok?: boolean; url?: string; error?: string } =
          await uploadRes.json();
        if (!uploadRes.ok || !uploadJson.ok || !uploadJson.url) {
          setFormError(
            uploadJson.error ?? "The photo could not be uploaded.",
          );
          setSaving(false);
          return;
        }
        finalImageUrl = uploadJson.url;
      }

      const parsed = productSaveSchema.safeParse({
        name: name.trim(),
        categoryId: categoryId === "" ? null : categoryId,
        priceBdt: Number(price),
        stockTotal: Number(stock),
        status,
        description: description.trim(),
        colour: colour.trim(),
        imageUrl: finalImageUrl,
      });
      if (!parsed.success) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "form");
          if (!next[key]) {
            next[key] = issue.message;
          }
        }
        setErrors(next);
        setSaving(false);
        return;
      }

      const url =
        mode === "add"
          ? "/api/admin/products"
          : `/api/admin/products/${initial?.id}`;
      const res = await fetch(url, {
        method: mode === "add" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !json.ok) {
        setFormError(json.error ?? "The product could not be saved.");
        setSaving(false);
        return;
      }
      router.push("/admin/products");
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-md border border-error bg-surface px-4 py-3 text-text">
          {formError}
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-text">
          Product name
        </span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name ? (
          <span className="mt-1 block text-sm text-error">{errors.name}</span>
        ) : null}
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-text">
          Category
        </span>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={inputClass}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">
            Price (৳)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="e.g. 950"
            className={inputClass}
            aria-invalid={Boolean(errors.priceBdt)}
          />
          {errors.priceBdt ? (
            <span className="mt-1 block text-sm text-error">
              {errors.priceBdt}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">
            Stock
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={stock}
            onChange={(event) => setStock(event.target.value)}
            placeholder="e.g. 12"
            className={inputClass}
            aria-invalid={Boolean(errors.stockTotal)}
          />
          {errors.stockTotal ? (
            <span className="mt-1 block text-sm text-error">
              {errors.stockTotal}
            </span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">
            Status
          </span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "active" | "inactive")
            }
            className={inputClass}
          >
            <option value="active">Active (on the storefront)</option>
            <option value="inactive">Inactive (hidden)</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">
            Colour
          </span>
          <input
            type="text"
            value={colour}
            onChange={(event) => setColour(event.target.value)}
            className={inputClass}
            aria-invalid={Boolean(errors.colour)}
          />
          {errors.colour ? (
            <span className="mt-1 block text-sm text-error">
              {errors.colour}
            </span>
          ) : null}
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-text">
          Description
        </span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          className={`${inputClass} min-h-24`}
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-semibold text-text">
          Product photo
        </span>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Current product photo"
            className="mb-2 h-32 w-32 rounded-md border border-border object-cover"
          />
        ) : null}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) =>
            handlePhotoChange(event.target.files?.[0] ?? null)
          }
          aria-label="Product photo"
          className="block w-full text-sm text-text"
        />
        {selectedPhotoName ? (
          <span className="mt-1 block text-sm text-text">
            Selected: {selectedPhotoName} — it will replace the current
            photo when you save.
          </span>
        ) : null}
        <span className="mt-1 block text-sm text-text-secondary">
          {mode === "edit"
            ? "Leave empty to keep the current photo."
            : "JPEG, PNG or WebP, up to 5 MB."}
        </span>
        {errors.imageUrl ? (
          <span className="mt-1 block text-sm text-error">
            {errors.imageUrl}
          </span>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : mode === "add"
              ? "Add product"
              : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          className="min-h-11 rounded-md border border-border bg-surface px-6 py-3 font-semibold text-text hover:bg-background-subtle"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
