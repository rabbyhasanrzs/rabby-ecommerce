import ContentPage from "@/components/content-page";
import Link from "next/link";

/**
 * Returns & Exchange (S-5, T-51) — plain steps, approved facts only.
 *
 * The 7-day rule is the Proposed Default from the kickoff pack §3:
 * labelled as proposed, not final, and to be verified against the
 * real business terms before launch. Phase 06A §2.9's "Exchange
 * within 24 hours" summary cards are NOT used — that was never an
 * approved fact. There is no "Start an exchange" button that opens
 * a channel (channels unconfirmed); the page points to /contact.
 */
export default function ReturnsPage() {
  return (
    <ContentPage
      title="Returns & Exchange"
      intro="How returns and exchanges work at Rabby. The policy below is the proposed default — it must be verified against the real business terms before launch."
    >
      <section aria-labelledby="returns-summary">
        <h2
          id="returns-summary"
          className="font-display text-2xl font-bold text-text"
        >
          The policy in short
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-text">
          <li>
            Return or exchange within 7 days of delivery — proposed
            default, not final policy.
          </li>
          <li>The sunglasses must be unused and undamaged.</li>
          <li>They must be in their original packaging.</li>
        </ul>
      </section>

      <section aria-labelledby="returns-steps">
        <h2
          id="returns-steps"
          className="font-display text-2xl font-bold text-text"
        >
          How to return or exchange, step by step
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed text-text">
          <li>
            Check the sunglasses as soon as they arrive. Keep the
            original packaging.
          </li>
          <li>
            Contact us from the Contact page with your order reference
            and tell us what is wrong or what you would like instead.
          </li>
          <li>
            We confirm whether the return or exchange is accepted under
            the policy above.
          </li>
          <li>
            Send the sunglasses back unused, undamaged and in the
            original packaging.
          </li>
          <li>
            Once we receive them, your exchange is sent or your return
            is processed.
          </li>
        </ol>
      </section>

      <section aria-labelledby="returns-cannot">
        <h2
          id="returns-cannot"
          className="font-display text-2xl font-bold text-text"
        >
          What cannot be returned
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          Sunglasses that have been used or damaged, or that are
          returned after 7 days from delivery, cannot be returned under
          this proposed policy. Sunglasses without their original
          packaging cannot be returned either.
        </p>
      </section>

      <section aria-labelledby="returns-cancel">
        <h2
          id="returns-cancel"
          className="font-display text-2xl font-bold text-text"
        >
          Cancelling instead
        </h2>
        <p className="mt-3 leading-relaxed text-text">
          You can cancel your order before it ships — cancel before the
          Shipped step and the items go back into stock. Track your
          order to see its current step.
        </p>
      </section>

      <p className="leading-relaxed text-text">
        To start a return or exchange,{" "}
        <Link
          href="/contact"
          className="font-semibold text-action underline underline-offset-2"
        >
          contact us
        </Link>{" "}
        with your order reference.
      </p>
    </ContentPage>
  );
}
