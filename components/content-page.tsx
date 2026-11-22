/**
 * Shared content-page layout (S-5, Slice A).
 *
 * Phase 06A §1.4: storefront layout, content within the grid,
 * sections separated by space. Content pages (Help, Returns, Guide,
 * Contact, Privacy, Terms) are reading pages, so they use a narrower
 * measure than the product grid — one H1 per page, in Playfair
 * Display, with the intro in secondary text.
 */
export default function ContentPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:px-8 md:py-14">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        {title}
      </h1>
      {intro ? (
        <p className="mt-4 text-lg leading-relaxed text-text-secondary">
          {intro}
        </p>
      ) : null}
      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}
