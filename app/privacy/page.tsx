import ContentPage from "@/components/content-page";

/**
 * Privacy Policy (S-5, T-54) — DRAFT.
 *
 * The owner has NOT provided final legal text. This page is built
 * only from approved decisions (guest checkout, data collected at
 * checkout, demo-safe payment handling, order tracking) and is
 * labelled "Draft — owner to confirm final text" at the top. Legal
 * review remains open. Do NOT present this text as final.
 */
export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy Policy"
      intro="Draft — owner to confirm final text. This is plain-language draft content built only from the shop's approved decisions. It is not final legal text, and legal review is still open."
    >
      <p className="rounded-md border border-warning bg-surface px-4 py-3 font-semibold text-text">
        Draft — owner to confirm final text
      </p>

      <section aria-labelledby="privacy-collect">
        <h2
          id="privacy-collect"
          className="font-display text-2xl font-bold text-text"
        >
          What we collect
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          Rabby is a guest-checkout shop — there is no account or
          login. When you place an order we collect the details you
          enter at checkout: your name, phone number, email address
          and delivery address, plus the items you order and the
          payment method you choose. To track an order we use your
          order reference and phone number.
        </p>
      </section>

      <section aria-labelledby="privacy-use">
        <h2
          id="privacy-use"
          className="font-display text-2xl font-bold text-text"
        >
          How we use it
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          We use your details only to fulfil your order: to deliver
          it, to confirm it, and to help you if you contact us about
          it. Your email is collected at checkout only — the shop
          sends you an order-confirmation email and emails when your
          order status changes, to the email address you gave at
          checkout.
        </p>
      </section>

      <section aria-labelledby="privacy-payment">
        <h2
          id="privacy-payment"
          className="font-display text-2xl font-bold text-text"
        >
          Payment details
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          No real payment gateway exists yet and no money moves through
          the website. If you pay by bKash, Nagad or Rocket you enter
          your Transaction ID and sender mobile number so the payment
          can be checked by hand. Card details are never collected on
          this site.
        </p>
      </section>

      <section aria-labelledby="privacy-sharing">
        <h2
          id="privacy-sharing"
          className="font-display text-2xl font-bold text-text"
        >
          Who we share it with
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          Your delivery details are shared only as far as needed to
          deliver your order — for example with the courier. The shop
          does not sell your details.
        </p>
      </section>

      <section aria-labelledby="privacy-contact">
        <h2
          id="privacy-contact"
          className="font-display text-2xl font-bold text-text"
        >
          Questions about your data
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          If you have a question about the details we hold about your
          order, contact us from the Contact page with your order
          reference.
        </p>
      </section>
    </ContentPage>
  );
}
