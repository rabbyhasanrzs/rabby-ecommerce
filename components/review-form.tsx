"use client";

import { StarsInput } from "@/components/star-rating";
import { useState } from "react";

/**
 * Review form — S-7, T-70 (reviews).
 *
 * Verified buyers only: the buyer proves the purchase with the
 * order reference + phone (the same two fields as track order).
 * The reviewer name is NOT asked for — it comes from the order.
 * On success the review is 'pending': it appears only after an
 * admin approves it, so the success message says so plainly.
 *
 * When the buyer arrives from the track-order prompt (?ref=…), the
 * form opens expanded with the reference prefilled. Otherwise it
 * sits behind a "Write a review" button.
 */

const SUBMIT_ERROR =
  "Your review couldn't be submitted. Please try again.";

export default function ReviewForm({
  productSlug,
  productName,
  prefilledReference,
  defaultOpen,
}: {
  productSlug: string;
  productName: string;
  prefilledReference: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [reference, setReference] = useState(prefilledReference ?? "");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(0);
  const [qualityRating, setQualityRating] = useState(0);
  const [valueRating, setValueRating] = useState(0);
  const [fitRating, setFitRating] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!reference.trim() || !phone.trim()) {
      setError("Enter your order reference and phone number.");
      return;
    }
    if (rating === 0) {
      setError("Choose a star rating from 1 to 5.");
      return;
    }
    if (!body.trim()) {
      setError("Write a few words about the product.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: reference.trim(),
          phone: phone.trim(),
          productSlug,
          rating,
          qualityRating: qualityRating === 0 ? null : qualityRating,
          valueRating: valueRating === 0 ? null : valueRating,
          fitRating: fitRating === 0 ? null : fitRating,
          body: body.trim(),
        }),
      });
      const data: { ok?: boolean; error?: string } = await response.json();
      if (data.ok) {
        setSubmitted(true);
      } else {
        setError(data.error ?? SUBMIT_ERROR);
      }
    } catch {
      setError(SUBMIT_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p role="status" className="rounded-md border border-border bg-surface p-4 text-base text-text">
        Thank you — your review has been received. It will appear on
        this page once it has been checked and approved.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-6 py-3 text-base font-semibold text-text hover:border-action"
      >
        Write a review
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <p className="text-base text-text-secondary">
        Only buyers can review — your order reference and phone number
        prove your purchase. Your review will appear under the name on
        your order, after it has been checked and approved.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="review-reference"
            className="mb-1 block text-sm font-semibold text-text"
          >
            Order reference
          </label>
          <input
            id="review-reference"
            name="reference"
            type="text"
            autoComplete="off"
            placeholder="RB-2026-123456"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text"
          />
        </div>
        <div>
          <label
            htmlFor="review-phone"
            className="mb-1 block text-sm font-semibold text-text"
          >
            Phone number
          </label>
          <input
            id="review-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text"
          />
        </div>
      </div>
      <StarsInput
        id="review-rating"
        label={`Your rating for ${productName}`}
        value={rating}
        onChange={setRating}
        required
      />
      <div className="grid gap-5 sm:grid-cols-3">
        <StarsInput
          id="review-quality"
          label="Quality"
          value={qualityRating}
          onChange={setQualityRating}
        />
        <StarsInput
          id="review-value"
          label="Value"
          value={valueRating}
          onChange={setValueRating}
        />
        <StarsInput
          id="review-fit"
          label="Fit"
          value={fitRating}
          onChange={setFitRating}
        />
      </div>
      <div>
        <label
          htmlFor="review-body"
          className="mb-1 block text-sm font-semibold text-text"
        >
          Your review
        </label>
        <textarea
          id="review-body"
          name="body"
          rows={5}
          maxLength={2000}
          placeholder="How was the fit, the quality, the comfort?"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text"
        />
        <p className="mt-1 text-sm text-text-secondary">
          {body.length} / 2000 characters
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-base text-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-11 items-center rounded-md bg-action px-6 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Submitting your review…" : "Submit review"}
      </button>
    </form>
  );
}
