"use client";

import ProductImage from "@/components/product-image";
import { formatPriceBdt, stockLabel } from "@/lib/format";
import {
  faceShapeChipLabel,
  type ProductDetail,
} from "@/lib/supabase/catalog";
import { useState } from "react";

/**
 * Product detail (interactive part) — gallery + colour variants.
 *
 * Gallery: primary image large, thumbnails below; selecting a thumbnail
 * swaps the large image. Photos live at /images/<file>; a missing file
 * renders the "Photo coming soon" placeholder, never a broken icon.
 *
 * Variants: colour swatches. Selecting a variant updates the variant
 * name and the price/stock line. Demo data has NO per-variant price or
 * stock (both NULL in the database — see lib/supabase/catalog.ts), so
 * the product price and product stock always apply; a variant is
 * available iff the product has stock.
 *
 * No bag/checkout in S-1 (S-2): out-of-stock products show
 * "Out of Stock" and no purchase control.
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
}: {
  product: ProductDetail;
}) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(0);

  const outOfStock = product.stock_total <= 0;
  const variant = product.variants[selectedVariant] ?? null;
  const images = product.images;
  const currentImage = images[selectedImage] ?? images[0] ?? null;
  const measurements = product.measurements;

  return (
    <div className="grid gap-10 md:grid-cols-2">
      {/* Gallery */}
      <div>
        <ProductImage
          src={currentImage?.storage_path ?? null}
          alt={currentImage?.alt_text ?? product.name}
          className="aspect-[4/3] w-full rounded-lg border border-border object-cover"
        />
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
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text"
                  >
                    {shape}: {faceShapeChipLabel(rating)}
                  </li>
                ),
              )}
            </ul>
          </div>
        ) : null}

        {outOfStock ? (
          <p className="mt-8 rounded-md border border-border bg-background-subtle px-4 py-3 text-base text-text-secondary">
            This product is currently out of stock. Bag and checkout arrive
            in S-2.
          </p>
        ) : (
          <p className="mt-8 rounded-md border border-border bg-background-subtle px-4 py-3 text-base text-text-secondary">
            Bag and checkout arrive in S-2 — browsing only in S-1.
          </p>
        )}
      </div>
    </div>
  );
}
