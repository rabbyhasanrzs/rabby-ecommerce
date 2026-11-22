"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Help / FAQ (S-5, T-50).
 *
 * Every answer states only approved facts (kickoff pack §3):
 * delivery + tax are DEMO config, payment is demo-safe (no real
 * gateway), returns are the 7-day Proposed Default, cancel is
 * before Shipped with stock restored, tracking is reference +
 * phone. Nothing else is promised.
 *
 * Behaviour per Phase 06A §2.9 / §3 S-7: category chips filter the
 * questions; accordions are real buttons with aria-expanded, one
 * open at a time.
 */

export type FaqCategory = "Delivery" | "Payment" | "Returns" | "Stock" | "Fit";

export const FAQ_CATEGORIES: FaqCategory[] = [
  "Delivery",
  "Payment",
  "Returns",
  "Stock",
  "Fit",
];

export interface FaqItem {
  category: FaqCategory;
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    category: "Delivery",
    question: "How much is delivery, and how long does it take?",
    answer:
      "Inside Dhaka: ৳60, 1–2 days. Outside Dhaka: ৳120, 3–5 days. These are demo configuration values, not final prices — the owner confirms the real delivery charges before launch.",
  },
  {
    category: "Delivery",
    question: "How do I track my order?",
    answer:
      "Track your order with your order reference and phone number on the Track Order page (/orders). Your order moves through Placed, Confirmed, Processing, Packed, Shipped, Out for Delivery, then Delivered.",
  },
  {
    category: "Payment",
    question: "Which payment methods can I use?",
    answer:
      "Cash on Delivery (COD), bKash, Nagad, Rocket, Debit/Credit Card, and Online Payment Gateway. This is the demo configuration — no real payment gateway exists yet.",
  },
  {
    category: "Payment",
    question: "How do bKash, Nagad and Rocket payments work?",
    answer:
      "They are manual: you send the payment first, then enter your Transaction ID (TrxID) and sender mobile number at checkout. No money moves through the website itself.",
  },
  {
    category: "Payment",
    question: "Is card payment real?",
    answer:
      "No. Card details are never collected on this site. A card payment is confirmed after you place the order — no money moves in this demo.",
  },
  {
    category: "Payment",
    question: "Is there tax on my order?",
    answer:
      "Tax is 5% of the subtotal. That is a demo configuration value, not a final tax rate.",
  },
  {
    category: "Returns",
    question: "What is the returns policy?",
    answer:
      "Proposed default: you can return or exchange within 7 days of delivery, if the sunglasses are unused and undamaged and in their original packaging. This is a proposed default, not final policy — it must be verified against the real business terms before launch.",
  },
  {
    category: "Returns",
    question: "How do I start a return or exchange?",
    answer:
      "Contact us from the Contact page with your order reference. The support channels are not confirmed yet, so there is no direct message button here — the Contact page shows the channels once the owner provides them.",
  },
  {
    category: "Returns",
    question: "Can I cancel my order?",
    answer:
      "Yes, as long as it has not shipped yet. Cancel before the Shipped step and your items go back into stock. Track your order to see its current step.",
  },
  {
    category: "Stock",
    question: "What does “Only 1 left in stock” mean?",
    answer:
      "It means only one piece of that frame is left. The product page always shows the current stock — In Stock, Only X left in stock, or Out of Stock.",
  },
  {
    category: "Stock",
    question: "What if the frame I want is out of stock?",
    answer:
      "An out-of-stock frame cannot be added to your bag. Browse the sunglasses listing for similar frames — every frame there shows its own stock.",
  },
  {
    category: "Fit",
    question: "How do I choose a frame for my face shape?",
    answer:
      "See the face-shape guide — it covers Round, Oval, Square, Heart and Oblong faces, which frame shapes suit each one, and the size in millimetres.",
  },
  {
    category: "Fit",
    question: "What do the measurements in millimetres mean?",
    answer:
      "Lens width, bridge, temple length, frame width and lens height, all in millimetres. Every product page shows them with a measurement diagram. For example, SAMPLE Round A measures 126 mm frame width, 50 mm lens, 18 mm bridge, 44 mm lens height and 140 mm temple.",
  },
  {
    category: "Fit",
    question: "What if the fit is not right?",
    answer:
      "If the frame does not fit, the proposed returns rule applies: return or exchange within 7 days of delivery, unused and undamaged, in the original packaging. That rule is a proposed default, not final policy.",
  },
];

export default function HelpFaq() {
  const [category, setCategory] = useState<FaqCategory | "All">("All");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const visible =
    category === "All"
      ? FAQ_ITEMS
      : FAQ_ITEMS.filter((item) => item.category === category);

  return (
    <div className="space-y-6">
      <div
        role="group"
        aria-label="Filter questions by topic"
        className="flex flex-wrap gap-2"
      >
        {(["All", ...FAQ_CATEGORIES] as const).map((chip) => {
          const selected = category === chip;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setCategory(chip);
                setOpenIndex(null);
              }}
              aria-pressed={selected}
              className={
                selected
                  ? "min-h-11 rounded-full bg-action px-4 py-2 text-sm font-semibold text-text-inverse"
                  : "min-h-11 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:border-action"
              }
            >
              {chip === "All" ? "All questions" : chip}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="text-text-secondary">
          No questions in this topic yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item, index) => {
            const open = openIndex === index;
            return (
              <li
                key={item.question}
                className="rounded-md border border-border bg-surface"
              >
                <h2>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`faq-answer-${index}`}
                    onClick={() => setOpenIndex(open ? null : index)}
                    className="flex min-h-11 w-full items-center justify-between gap-4 px-4 py-3 text-left font-semibold text-text"
                  >
                    <span>{item.question}</span>
                    <span aria-hidden="true" className="shrink-0 text-xl">
                      {open ? "−" : "+"}
                    </span>
                  </button>
                </h2>
                {open ? (
                  <p
                    id={`faq-answer-${index}`}
                    className="px-4 pb-4 leading-relaxed text-text"
                  >
                    {item.answer}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="leading-relaxed text-text">
        Still need help?{" "}
        <Link
          href="/contact"
          className="font-semibold text-action underline underline-offset-2"
        >
          Contact us
        </Link>
      </p>
    </div>
  );
}
