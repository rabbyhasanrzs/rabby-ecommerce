"use client";

import { useBag } from "@/lib/bag-context";
import type { BagItem } from "@/lib/bag";
import {
  checkoutFormSchema,
  type CheckoutFormData,
} from "@/lib/checkout-validation";
import {
  DELIVERY_OPTIONS,
  PAYMENT_METHODS,
  type DeliveryZone,
  type PaymentMethodId,
} from "@/lib/demo-config";
import { formatPriceBdt } from "@/lib/format";
import { computeTotals } from "@/lib/pricing";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * Guest checkout form (S-2, T-22).
 *
 * Reads the bag from useBag(), validates with checkoutFormSchema,
 * re-checks prices + stock via POST /api/bag/validate, then places the
 * order via POST /api/checkout. Payment is a SELECTION ONLY — no money
 * moves, no gateway (S-3). On success the bag is cleared, the phone is
 * kept in sessionStorage so the confirmation page can look the order
 * up, and the customer is sent to /order/confirmation?ref=...
 *
 * On any failure the entered details are kept (controlled inputs).
 */

const FIELD_ORDER = [
  "name",
  "phone",
  "email",
  "address",
  "zone",
  "paymentMethod",
] as const;

type FieldName = (typeof FIELD_ORDER)[number];

const PAYMENT_GROUP_ORDER = ["Cash on Delivery", "Mobile Banking", "Card"];

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text";

export default function CheckoutForm() {
  const { items, subtotalBdt, clearBag } = useBag();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState<DeliveryZone>("inside");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodId>("cod");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>(
    {},
  );
  const [banner, setBanner] = useState<string | null>(null);
  const [validateIssues, setValidateIssues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // One ref per field so a failed submit can move focus to the first
  // bad field. (Plain useRef objects passed straight to `ref=` — no
  // ref-callback factory, which the React 19 lint rules flag.)
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);
  const zoneRef = useRef<HTMLInputElement>(null);
  const paymentMethodRef = useRef<HTMLInputElement>(null);
  const fieldRefs: Record<FieldName, React.RefObject<HTMLElement | null>> = {
    name: nameRef,
    phone: phoneRef,
    email: emailRef,
    address: addressRef,
    zone: zoneRef,
    paymentMethod: paymentMethodRef,
  };

  const totals = computeTotals(subtotalBdt, zone);

  function focusFirstError(
    nextErrors: Partial<Record<FieldName, string>>,
  ) {
    const firstBadField = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstBadField) {
      fieldRefs[firstBadField].current?.focus();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);
    setValidateIssues([]);

    const parsed = checkoutFormSchema.safeParse({
      name,
      phone,
      email,
      address,
      zone,
      paymentMethod,
    });

    if (!parsed.success) {
      const nextErrors: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName | undefined;
        if (field && FIELD_ORDER.includes(field) && !nextErrors[field]) {
          nextErrors[field] = issue.message;
        }
      }
      setErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      // Re-check prices + stock before placing the order.
      const validateResponse = await fetch("/api/bag/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item: BagItem) => ({
            slug: item.slug,
            quantity: item.quantity,
            priceBdt: item.priceBdt,
          })),
        }),
      });
      const validateData: {
        ok?: boolean;
        issues?: { slug: string; type: string; message: string }[];
        error?: string;
      } = await validateResponse.json();
      if (!validateResponse.ok || !validateData.ok) {
        setBanner(
          validateData.error ??
            "Something went wrong while checking your bag. Please try again.",
        );
        return;
      }
      if (validateData.issues && validateData.issues.length > 0) {
        setValidateIssues(
          validateData.issues.map((issue) => issue.message),
        );
        return;
      }

      const data: CheckoutFormData = parsed.data;
      const checkoutResponse = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: data.name,
            phone: data.phone,
            email: data.email,
            address: data.address,
            zone: data.zone,
            paymentMethod: data.paymentMethod,
          },
          items: items.map((item: BagItem) => ({
            slug: item.slug,
            variantColour: item.variantColour,
            quantity: item.quantity,
          })),
        }),
      });
      const checkoutData: {
        ok?: boolean;
        reference?: string;
        error?: string;
        issues?: { message: string }[];
      } = await checkoutResponse.json();
      if (!checkoutResponse.ok || !checkoutData.ok || !checkoutData.reference) {
        if (checkoutData.issues && checkoutData.issues.length > 0) {
          setValidateIssues(
            checkoutData.issues.map((issue) => issue.message),
          );
        } else {
          setBanner(
            checkoutData.error ??
              "Something went wrong while placing your order. Please try again.",
          );
        }
        return;
      }

      clearBag();
      sessionStorage.setItem("rabby-order-phone", data.phone);
      router.push(`/order/confirmation?ref=${checkoutData.reference}`);
    } catch {
      setBanner(
        "Something went wrong while placing your order. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {validateIssues.length > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-error bg-surface px-4 py-3"
        >
          <p className="font-semibold text-error">
            Your bag changed — please check before placing the order.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-text">
            {validateIssues.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {banner ? (
        <div
          role="alert"
          className="rounded-md border border-error bg-surface px-4 py-3 text-text"
        >
          {banner}
        </div>
      ) : null}

      <div className="space-y-5">
        <div>
          <label
            htmlFor="checkout-name"
            className="mb-1 block font-semibold text-text"
          >
            Full name
          </label>
          <input
            ref={nameRef}
            id="checkout-name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "checkout-name-error" : undefined}
            className={inputClassName}
          />
          {errors.name ? (
            <p id="checkout-name-error" className="mt-1 text-sm text-error">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="checkout-phone"
            className="mb-1 block font-semibold text-text"
          >
            Phone number
          </label>
          <input
            ref={phoneRef}
            id="checkout-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={
              errors.phone ? "checkout-phone-error" : undefined
            }
            className={inputClassName}
          />
          {errors.phone ? (
            <p id="checkout-phone-error" className="mt-1 text-sm text-error">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="checkout-email"
            className="mb-1 block font-semibold text-text"
          >
            Email
          </label>
          <input
            ref={emailRef}
            id="checkout-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={
              errors.email ? "checkout-email-error" : undefined
            }
            className={inputClassName}
          />
          {errors.email ? (
            <p id="checkout-email-error" className="mt-1 text-sm text-error">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="checkout-address"
            className="mb-1 block font-semibold text-text"
          >
            Delivery address
          </label>
          <textarea
            ref={addressRef}
            id="checkout-address"
            name="address"
            autoComplete="street-address"
            rows={3}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-invalid={Boolean(errors.address)}
            aria-describedby={
              errors.address ? "checkout-address-error" : undefined
            }
            className={inputClassName}
          />
          {errors.address ? (
            <p
              id="checkout-address-error"
              className="mt-1 text-sm text-error"
            >
              {errors.address}
            </p>
          ) : null}
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 font-semibold text-text">
          Delivery zone
        </legend>
        <div className="space-y-2">
          {(Object.keys(DELIVERY_OPTIONS) as DeliveryZone[]).map(
            (optionZone, index) => {
              const option = DELIVERY_OPTIONS[optionZone];
              return (
                <label
                  key={optionZone}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
                >
                  <input
                    ref={index === 0 ? zoneRef : undefined}
                    type="radio"
                    name="zone"
                    value={optionZone}
                    checked={zone === optionZone}
                    onChange={() => setZone(optionZone)}
                    aria-describedby={
                      errors.zone ? "checkout-zone-error" : undefined
                    }
                    className="h-5 w-5 accent-action"
                  />
                  <span className="text-text">
                    {option.label} — {formatPriceBdt(option.feeBdt)},{" "}
                    {option.estimate}
                  </span>
                </label>
              );
            },
          )}
        </div>
        {errors.zone ? (
          <p id="checkout-zone-error" className="mt-1 text-sm text-error">
            {errors.zone}
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-semibold text-text">
          Payment method
        </legend>
        <div className="space-y-4">
          {PAYMENT_GROUP_ORDER.map((group) => (
            <fieldset key={group}>
              <legend className="mb-2 text-sm font-semibold text-text-secondary">
                {group}
              </legend>
              <div className="space-y-2">
                {PAYMENT_METHODS.filter(
                  (method) => method.group === group,
                ).map((method, index) => (
                  <label
                    key={method.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <input
                      ref={
                        group === PAYMENT_GROUP_ORDER[0] && index === 0
                          ? paymentMethodRef
                          : undefined
                      }
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={paymentMethod === method.id}
                      onChange={() => setPaymentMethod(method.id)}
                      aria-describedby={
                        errors.paymentMethod
                          ? "checkout-paymentMethod-error"
                          : undefined
                      }
                      className="h-5 w-5 accent-action"
                    />
                    <span className="text-text">
                      {method.label}
                      {method.note ? (
                        <span className="block text-sm text-text-secondary">
                          {method.note}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {errors.paymentMethod ? (
          <p
            id="checkout-paymentMethod-error"
            className="mt-1 text-sm text-error"
          >
            {errors.paymentMethod}
          </p>
        ) : null}
      </fieldset>

      <section
        aria-label="Order summary"
        className="rounded-lg border border-border bg-surface p-4"
      >
        <h2 className="font-display text-xl font-bold text-text">
          Order summary
        </h2>
        <ul className="mt-3 space-y-2">
          {items.map((item: BagItem) => (
            <li
              key={`${item.slug}-${item.variantColour ?? "default"}`}
              className="flex items-baseline justify-between gap-4 text-text"
            >
              <span>
                {item.name}
                {item.variantColour ? ` — ${item.variantColour}` : ""}
                <span className="text-text-secondary">
                  {" "}
                  × {item.quantity}
                </span>
              </span>
              <span className="shrink-0 font-semibold">
                {formatPriceBdt(item.priceBdt * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-border pt-3 text-text">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatPriceBdt(totals.subtotalBdt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax (5%)</dt>
            <dd>{formatPriceBdt(totals.taxBdt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Delivery fee</dt>
            <dd>{formatPriceBdt(totals.deliveryFeeBdt)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
            <dt>Total</dt>
            <dd>{formatPriceBdt(totals.totalBdt)}</dd>
          </div>
        </dl>
      </section>

      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 w-full rounded-md bg-action px-6 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Placing your order…" : "Place Order"}
      </button>
    </form>
  );
}
