/**
 * PlaceholderPage — shared placeholder for every S-0 route.
 * T-05 acceptance: every sitemap route exists, even if its content is a
 * placeholder. Every placeholder is clearly labelled as demo content.
 */
export default function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
      <p className="mb-4 inline-block rounded bg-background-subtle px-3 py-1 text-sm font-semibold text-text-secondary">
        Placeholder — demo content, not real products
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-text md:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">
          {description}
        </p>
      ) : null}
    </main>
  );
}
