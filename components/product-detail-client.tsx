"use client";

import FaceShapeIcon from "@/components/face-shape-icon";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import MeasurementDiagram from "@/components/measurement-diagram";
import ProductImage from "@/components/product-image";
import { StarsDisplay } from "@/components/star-rating";
import StockAlertForm from "@/components/stock-alert-form";
import WishlistButton from "@/components/wishlist-button";
import { useBag } from "@/lib/bag-context";
import { formatPriceBdt, stockLabel } from "@/lib/format";
import {
  faceShapeChipLabel,
  type ProductDetail,
} from "@/lib/supabase/catalog";
import type { ReviewAggregate } from "@/lib/supabase/reviews";
import { useState } from "react";

/**
 * Product detail (interactive part) — gallery + colour variants.
 *
 * Gallery: primary image large, thumbnails below; selecting a thumbnail
 * swaps the large image. With more than one photo there are also
 * prev/next arrows, a "1 / N" counter, and Left/Right keyboard
 * navigation (the gallery region is focusable); navigation wraps around
 * from the last photo to the first. The main photo is zoomable: hovering
 * magnifies it at the cursor, clicking opens a fullscreen lightbox that
 * shows the currently selected photo. Photos live at /images/<file>; a
 * missing file renders the "Photo coming soon" placeholder, never a
 * broken icon — and with no photo there is no zoom, arrows, or counter.
 *
 * Face shapes: one animated outline icon per shape in the data
 * (components/face-shape-icon.tsx); the best ("Excellent") rating
 * pulses softly. Only shapes present in measurements.face_shape_ratings
 * are shown — no rating is ever invented for a shape.
 *
 * Variants: colour swatches. Selecting a variant updates the variant
 * name and the price/stock line. Demo data has NO per-variant price or
 * stock (both NULL in the database — see lib/supabase/catalog.ts), so
 * the product price and product stock always apply; a variant is
 * available iff the product has stock.
 *
 * Add to Bag (S-2): adds one unit of the selected colour variant and
 * opens the mini-cart drawer. Out-of-stock products show
 * "Out of Stock" and no purchase control — instead they get the
 * back-in-stock alert form (S-7): one email field + "Notify me".
 */

const MEASUREMENT_LABELS = [
  { key: "frame_width_mm", label: "Width" },
  { key: "lens_width_mm", label: "Lens" },
  { key: "bridge_mm", label: "Bridge" },
  { key: "lens_height_mm", label: "Height" },
  { key: "temple_mm", label: "Temple" },
] as const;

export default function ProductDetailClient({
  product,
  reviewAggregate,
}: {
  product: ProductDetail;
  /** Approved-review aggregate, or null when the fetch failed. */
  reviewAggregate?: ReviewAggregate | null;
}) {
  const { addItem } = useBag();
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(0);

  const outOfStock = product.stock_total <= 0;
  const variant = product.variants[selectedVariant] ?? null;
  const images = product.images;
  const imageCount = images.length;
  const currentImage = images[selectedImage] ?? images[0] ?? null;
  const measurements = product.measurements;

  /** Gallery navigation with wrap-around (last -> first, first -> last). */
  const showPhoto = (index: number) => {
    if (imageCount === 0) {
      return;
    }
    setSelectedImage(((index % imageCount) + imageCount) % imageCount);
  };

  const handleGalleryKeyDown = (event: React.KeyboardEvent) => {
    if (imageCount <= 1) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPhoto(selectedImage - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      showPhoto(selectedImage + 1);
    }
  };

  return (
    <div className="grid gap-10 md:grid-cols-2">
      {/* Gallery */}
      <div>
        <div
          data-testid="product-gallery"
          role="group"
          aria-label="Product photos"
          tabIndex={imageCount > 1 ? 0 : undefined}
          onKeyDown={handleGalleryKeyDown}
          className="relative"
        >
          <ProductImage
            src={currentImage?.storage_path ?? null}
            alt={currentImage?.alt_text ?? product.name}
            zoomable
            className="aspect-[4/3] w-full rounded-lg border border-border object-cover"
          />
          {imageCount > 1 ? (
            <>
              <button
                type="button"
                onClick={() => showPhoto(selectedImage - 1)}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-text shadow-sm hover:border-action"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => showPhoto(selectedImage + 1)}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-text shadow-sm hover:border-action"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
              <p
                aria-live="polite"
                className="absolute bottom-3 left-3 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text shadow-sm"
              >
                {selectedImage + 1} / {imageCount}
              </p>
            </>
          ) : null}
        </div>
        {images.length > 1 ? (
          <ul className="mt-4 flex flex-wrap gap-3" aria-label="Product photos">
            {images.map((image, index) => (
              <li key={image.id}>
                <button
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  aria-pressed={index === selectedImage}
                  aria-label={`View photo ${index + 1}`}
                  className={`block overflow-hidden rounded-md border-2 ${
                    index === selectedImage
                      ? "border-action"
                      : "border-border"
                  }`}
                >
                  <ProductImage
                    src={image.storage_path}
                    alt={image.alt_text ?? `${product.name} photo ${index + 1}`}
                    className="h-20 w-20 object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Details */}
      <div>
        {product.category_name ? (
          <p className="text-sm font-semibold text-text-secondary">
            {product.category_name}
          </p>
        ) : null}
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
          {product.name}
        </h1>
        {product.is_demo ? (
          <p className="mt-2 inline-block rounded bg-background-subtle px-3 py-1 text-sm font-semibold text-text-secondary">
            Demo product — sample catalogue, not a real product
          </p>
        ) : null}
        <p className="mt-4 text-2xl font-semibold text-text">
          {formatPriceBdt(product.price_bdt)}
        </p>
        {/* S-7: buy-panel rating line — only once real approved
            reviews exist (no "0.0", no rating without reviews, D-8). */}
        {reviewAggregate &&
        reviewAggregate.reviewCount > 0 &&
        reviewAggregate.averageRating !== null ? (
          <p className="mt-2 flex items-center gap-2">
            <StarsDisplay
              average={reviewAggregate.averageRating}
              count={reviewAggregate.reviewCount}
            />
            <a
              href="#reviews"
              className="text-base font-semibold text-action hover:text-action-hover"
            >
              {reviewAggregate.averageRating.toFixed(1)} (
              {reviewAggregate.reviewCount} review
              {reviewAggregate.reviewCount === 1 ? "" : "s"})
            </a>
          </p>
        ) : null}
        <p
          className={`mt-2 text-base font-semibold ${
            outOfStock ? "text-error" : "text-stock-in"
          }`}
        >
          {stockLabel(product.stock_total)}
        </p>
        {product.description ? (
          <p className="mt-4 text-base leading-relaxed text-text-secondary">
            {product.description}
          </p>
        ) : null}

        {/* Colour variants */}
        {product.variants.length > 0 ? (
          <div className="mt-8">
            <p className="text-base font-semibold text-text">
              Colour{variant ? `: ${variant.colour}` : ""}
            </p>
            <ul className="mt-3 flex flex-wrap gap-3">
              {product.variants.map((v, index) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedVariant(index)}
                    aria-pressed={index === selectedVariant}
                    className={`min-h-11 rounded-md border px-4 py-2 text-base ${
                      index === selectedVariant
                        ? "border-action bg-action text-text-inverse"
                        : "border-border bg-surface text-text hover:border-action"
                    }`}
                  >
                    {v.colour}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-text-secondary">
              {outOfStock
                ? "This colour is out of stock."
                : `Available in ${variant?.colour ?? ""} — ${stockLabel(product.stock_total).toLowerCase()}.`}
            </p>
          </div>
        ) : null}

        {/* Measurements */}
        {measurements ? (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-text">Measurements</h2>
            <div className="mt-3">
              <MeasurementDiagram measurements={measurements} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MEASUREMENT_LABELS.map(({ key, label }) => {
                const value = measurements[key];
                return (
                  <div
                    key={key}
                    className="rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <dt className="text-sm text-text-secondary">{label}</dt>
                    <dd className="text-base font-semibold text-text">
                      {value === null || value === undefined
                        ? "—"
                        : `${value} mm`}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ) : null}

        {/* Face-shape ratings */}
        {measurements?.face_shape_ratings &&
        Object.keys(measurements.face_shape_ratings).length > 0 ? (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-text">
              How it fits your face shape
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {Object.entries(measurements.face_shape_ratings).map(
                ([shape, rating]) => (
                  <li
                    key={shape}
                    className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text"
                  >
                    <FaceShapeIcon
                      shape={shape}
                      highlight={rating.toLowerCase() === "excellent"}
                      className="h-5 w-5 text-action"
                    />
                    <span>
                      {shape}: {faceShapeChipLabel(rating)}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        ) : null}

        {outOfStock ? (
          <>
            {/* S-7 back-in-stock: the alert form replaces the old
                out-of-stock box — its copy claimed bag and checkout
                were still coming, which has been stale since S-2. */}
            <StockAlertForm
              productSlug={product.slug}
              productName={product.name}
            />
            {/* S-7: an out-of-stock product can still be saved — the
                wishlist page keeps it visible with "Out of Stock". */}
            <WishlistButton
              slug={product.slug}
              productName={product.name}
              variant="pdp"
              className="mt-4 w-full"
            />
          </>
        ) : (
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() =>
                addItem(
                  {
                    slug: product.slug,
                    name: product.name,
                    priceBdt: product.price_bdt,
                    image: currentImage?.storage_path ?? null,
                    variantColour: variant?.colour ?? null,
                  },
                  product.stock_total,
                )
              }
              className="flex min-h-11 flex-1 items-center justify-center rounded-md bg-action px-4 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover"
            >
              Add to Bag
            </button>
            {/* S-7: wishlist toggle beside Add to Bag, secondary style. */}
            <WishlistButton
              slug={product.slug}
              productName={product.name}
              variant="pdp"
            />
          </div>
        )}
      </div>
    </div>
  );
}
