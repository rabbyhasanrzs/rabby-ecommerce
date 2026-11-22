import ContentPage from "@/components/content-page";

/**
 * Terms & Conditions (S-5, T-54) — DRAFT.
 *
 * The owner has NOT provided final legal text. This page is built
 * only from approved decisions (guest checkout, BDT pricing, demo
 * configuration, demo-safe payment, delivery, the 7-day returns
 * proposal, order workflow) and is labelled "Draft — owner to
 * confirm final text" at the top. Legal review remains open. Do NOT
 * present this text as final.
 */
export default function TermsPage() {
  return (
    <ContentPage
      title="Terms & Conditions"
      intro="Draft — owner to confirm final text. This is plain-language draft content built only from the shop's approved decisions. It is not final legal text, and legal review is still open."
    >
      <p className="rounded-md border border-warning bg-surface px-4 py-3 font-semibold text-text">
        Draft — owner to confirm final text
      </p>

      <section aria-labelledby="terms-ordering">
        <h2
          id="terms-ordering"
          className="font-display text-2xl font-bold text-text"
        >
          Ordering
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          Rabby is a guest-checkout shop — you order without an
          account or login. Placing an order is your offer to buy the
          items in your bag. Your order moves through Placed,
          Confirmed, Processing, Packed, Shipped, Out for Delivery,
          then Delivered. You can cancel before the Shipped step; after
          that the order is on its way.
        </p>
      </section>

      <section aria-labelledby="terms-prices">
        <h2
          id="terms-prices"
          className="font-display text-2xl font-bold text-text"
        >
          Prices and payment
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          All prices are in Bangladeshi Taka (৳), as whole Taka. The
          total is the subtotal plus tax plus the delivery fee. Tax is
          5% and delivery is Inside Dhaka ৳60 (1–2 days) or Outside
          Dhaka ৳120 (3–5 days) — these are demo configuration values,
          not final prices. Payment methods are Cash on Delivery,
          bKash, Nagad, Rocket, Debit/Credit Card and Online Payment
          Gateway (demo configuration). No real payment gateway exists
          yet: bKash, Nagad and Rocket are manual payments confirmed by
          Transaction ID and sender number, and card details are never
          collected on this site.
        </p>
      </section>

      <section aria-labelledby="terms-delivery">
        <h2
          id="terms-delivery"
          className="font-display text-2xl font-bold text-text"
        >
          Delivery
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          We deliver Inside Dhaka in 1–2 days and Outside Dhaka in
          3–5 days (demo estimates). Track your order with your order
          reference and phone number. Check your sunglasses as soon as
          they arrive and keep the original packaging.
        </p>
      </section>

      <section aria-labelledby="terms-returns">
        <h2
          id="terms-returns"
          className="font-display text-2xl font-bold text-text"
        >
          Returns and exchanges
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          Proposed default: you can return or exchange within 7 days
          of delivery, if the sunglasses are unused and undamaged and
          in their original packaging. This is a proposed default, not
          final policy — it must be verified against the real business
          terms before launch.
        </p>
      </section>

      <section aria-labelledby="terms-demo">
        <h2
          id="terms-demo"
          className="font-display text-2xl font-bold text-text"
        >
          Demo products
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          The products listed in the shop are demo products, labelled
          DEMO, with demo prices, demo tax and demo delivery charges
          until the owner confirms the real values. Product photos,
          measurements and face-shape ratings come from the demo
          catalogue; lens height is a demo value.
        </p>
      </section>
    </ContentPage>
  );
}
