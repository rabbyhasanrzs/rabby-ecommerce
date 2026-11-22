"use client";

import { useState } from "react";

/**
 * Category manager (S-4, T-43) — client component for Add / Edit /
 * Remove. Remove asks for confirmation first; a category that still
 * has products cannot be removed — the server answers 409 and the
 * plain error is shown here. (A category only appears in the
 * storefront once it has ≥1 product — see listCategories.)
 */

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  productCount: number;
}

export default function CategoryManager({
  categories,
}: {
  categories: CategoryRow[];
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function callApi(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: { ok?: boolean; error?: string } = await res.json().catch(
      () => ({}),
    );
    return { ok: res.ok && json.ok === true, error: json.error };
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (name.trim().length < 2) {
      setError("Enter a category name.");
      return;
    }
    setBusy(true);
    const result = await callApi("/api/admin/categories", "POST", {
      name: name.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "The category could not be added.");
      return;
    }
    setMessage(`“${name.trim()}” added.`);
    setName("");
    window.location.reload();
  }

  async function handleEditSave(id: string) {
    setError(null);
    setMessage(null);
    if (editingName.trim().length < 2) {
      setError("Enter a category name.");
      return;
    }
    setBusy(true);
    const result = await callApi(`/api/admin/categories/${id}`, "PATCH", {
      name: editingName.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "The category could not be saved.");
      return;
    }
    setEditingId(null);
    setMessage("Category saved.");
    window.location.reload();
  }

  async function handleRemove(id: string, categoryName: string) {
    setError(null);
    setMessage(null);
    setBusy(true);
    const result = await callApi(`/api/admin/categories/${id}`, "DELETE");
    setBusy(false);
    setConfirmingRemoveId(null);
    if (!result.ok) {
      setError(result.error ?? "The category could not be removed.");
      return;
    }
    setMessage(`“${categoryName}” removed.`);
    window.location.reload();
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 rounded-md border border-error bg-surface px-4 py-3 text-text">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-text">
          {message}
        </p>
      ) : null}

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <label className="block flex-1">
          <span className="mb-1 block text-sm font-semibold text-text">
            New category name
          </span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Aviator"
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-text placeholder:text-text-secondary"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add category
        </button>
      </form>

      {categories.length === 0 ? (
        <p className="mt-6 text-text-secondary">No categories yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {categories.map((category) => (
            <li
              key={category.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              {editingId === category.id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    aria-label="Category name"
                    className="min-h-11 flex-1 rounded-md border border-border bg-background px-3 py-2 text-base text-text"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleEditSave(category.id)}
                    className="min-h-11 rounded-md bg-action px-4 py-2 font-semibold text-text-inverse hover:bg-action-hover disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 font-semibold text-text hover:bg-background-subtle"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-display text-lg font-bold text-text">
                      {category.name}
                    </span>
                    <span className="ml-3 text-sm text-text-secondary">
                      {category.productCount} product
                      {category.productCount === 1 ? "" : "s"}
                      {category.productCount === 0
                        ? " — not shown on the storefront yet"
                        : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(category.id);
                        setEditingName(category.name);
                        setError(null);
                      }}
                      className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 font-semibold text-text hover:bg-background-subtle"
                    >
                      Edit
                    </button>
                    {confirmingRemoveId === category.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            handleRemove(category.id, category.name)
                          }
                          className="min-h-11 rounded-md bg-error px-4 py-2 font-semibold text-text-inverse hover:opacity-90 disabled:opacity-50"
                        >
                          Yes, remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRemoveId(null)}
                          className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 font-semibold text-text hover:bg-background-subtle"
                        >
                          Keep it
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingRemoveId(category.id)}
                        className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 font-semibold text-error hover:bg-background-subtle"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
