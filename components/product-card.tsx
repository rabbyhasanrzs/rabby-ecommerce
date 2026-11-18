import ProductImage from "@/components/product-image";
import { formatPriceBdt, stockLabel } from "@/lib/format";
import type { ProductSummary } from "@/lib/supabase/catalog";
import Link from "next/link";

/**
 * Product card — listing grid. Shows the primary image (or the
 * "Photo coming soon" placeholder), name, integer BDT price, and stock
 * in plain words. Out-of-stock cards show "Out of Stock" and no
 * add-to-bag control — S-1 has no bag/checkout (S-2).
 */
export default function ProductCard({ product }: { product: ProductSummary }) {
  const outOfStock = product.stock_total <= 0;
  return (
    <li className="overflow-hidden rounded-lg border border-border bg-surface">
      <Link href={`/product/${product.slug}`} className="block">
        <ProductImage
          src={product.primary_image}
          alt={product.name}
          className="aspect-[4/3] w-full object-cover"
        />
        <span className="block px-4 pt-4">
          <span className="block font-display text-lg font-bold leading-snug text-text">
            {product.name}
          </span>
          {product.category_name ? (
            <span className="mt-1 block text-sm text-text-secondary">
              {product.category_name}
            </span>
          ) : null}
          <span className="mt-2 block text-base font-semibold text-text">
            {formatPriceBdt(product.price_bdt)}
          </span>
          <span
            className={`mt-1 block pb-4 text-sm font-semibold ${
              outOfStock ? "text-error" : "text-stock-in"
            }`}
          >
            {stockLabel(product.stock_total)}
          </span>
        </span>
      </Link>
    </li>
  );
}
