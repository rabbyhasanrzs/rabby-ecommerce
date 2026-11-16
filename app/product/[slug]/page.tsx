import PlaceholderPage from "@/components/placeholder-page";
import { Suspense } from "react";

/**
 * Product detail page — S-0 placeholder only.
 * With Cache Components enabled (Next 16), reading `params` blocks
 * prerendering unless it sits behind a Suspense boundary, so the slug
 * is read in the inner component and the shell streams the fallback.
 * The real product page (server-rendered) lands in S-1.
 */
async function ProductContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <PlaceholderPage
      title="Product details"
      description={`The product detail page for “${slug}” lands in S-1: gallery, variations, explicit stock, millimetre measurements, and face-shape ratings — with the demo catalog. No product exists yet.`}
    />
  );
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <PlaceholderPage
          title="Product details"
          description="Loading product details…"
        />
      }
    >
      <ProductContent params={params} />
    </Suspense>
  );
}
