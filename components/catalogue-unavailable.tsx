/**
 * Shared "catalogue unavailable" state — rendered when the Supabase
 * tables do not exist yet, the project is unreachable, or the public
 * env vars are missing. Generic copy only; never a technical error.
 */
export default function CatalogueUnavailable() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Catalogue unavailable
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">
        Sorry — our sunglasses catalogue could not be loaded right now.
        Please try again in a moment.
      </p>
    </main>
  );
}
