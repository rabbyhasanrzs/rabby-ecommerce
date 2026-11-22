"use client";

import { useBag } from "@/lib/bag-context";
import type { BagItem } from "@/lib/bag";
import {
  checkoutFormSchema,
  type CheckoutFormData,
} from "@/lib/checkout-validation";
import {
  DELIVERY_OPTIONS,
  DEMO_TAX_RATE_PERCENT,
  PAYMENT_METHODS,
  type DeliveryOption,
  type DeliveryZone,
  type PaymentMethodId,
} from "@/lib/demo-config";
import { formatPriceBdt } from "@/lib/format";
import { computeTotals, settingsToPricing } from "@/lib/pricing";
import type { SiteSettings } from "@/lib/site-settings";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
 * S-3 (demo-safe): mobile banking (bKash / Nagad / Rocket) shows a
 * Transaction ID + sender number pair — the customer pays first, then
 * enters the TrxID. Card shows a note only; card details are NEVER
 * collected. COD shows no extra fields. Payment details travel INSIDE
 * `customer` in the checkout body (same shape as the S-2 fix).
 * On any failure the entered details are kept (controlled inputs).
 *
 * S-4: the form fetches the public shop settings (GET /api/settings)
 * on mount and uses them for the totals + delivery display. While
 * loading, or if the fetch fails, the demo-config values are used —
 * checkout is never blocked on settings. The server is authoritative
 * for the total anyway (create_guest_order reads site_settings).
 */

/** Shape-check the /api/settings JSON; anything else is ignored and
 *  the demo-config values stay in use. */
function parseSettingsJson(value: unknown): SiteSettings | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.taxRatePercent !== "number" ||
    typeof row.deliveryInsideFeeBdt !== "number" ||
    typeof row.deliveryInsideEstimate !== "string" ||
    typeof row.deliveryOutsideFeeBdt !== "number" ||
    typeof row.deliveryOutsideEstimate !== "string"
  ) {
    return null;
  }
  return value as SiteSettings;
}

const FIELD_ORDER = [
  "name",
  "phone",
  "email",
  "address",
  "zone",
  "paymentMethod",
  "paymentReference",
  "paymentSender",
] as const;

type FieldName = (typeof FIELD_ORDER)[number];

/** Mobile-banking methods need TrxID + sender number (S-3). */
function isMobileBankingMethodId(method: PaymentMethodId): boolean {
  return method === "bkash" || method === "nagad" || method === "rocket";
}

/**
 * S-4: whether a payment method is switched on in the admin
 * settings. The checkout list must follow these flags — a method
 * the owner turned off must not be offered. Unknown ids stay on
 * (never block checkout on a bad value).
 */
function isPaymentMethodEnabled(
  method: PaymentMethodId,
  settings: SiteSettings,
): boolean {
  switch (method) {
    case "cod":
      return settings.paymentCodEnabled;
    case "bkash":
      return settings.paymentBkashEnabled;
    case "nagad":
      return settings.paymentNagadEnabled;
    case "rocket":
      return settings.paymentRocketEnabled;
    case "card":
      return settings.paymentCardEnabled;
  }
}

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
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentSender, setPaymentSender] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>(
    {},
  );
  const [banner, setBanner] = useState<string | null>(null);
  const [validateIssues, setValidateIssues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // S-4: public shop settings (tax %, delivery fees/estimates).
  // null = still loading, or the fetch failed — the demo-config
  // values are used until settings arrive, never a blocked checkout.
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/settings");
        if (!response?.ok) {
          return;
        }
        const parsed = parseSettingsJson(await response.json());
        if (!cancelled && parsed) {
          setSettings(parsed);
        }
      } catch {
        // Settings unavailable — keep the demo-config values.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One ref per field so a failed submit can move focus to the first
  // bad field. (Plain useRef objects passed straight to `ref=` — no
  // ref-callback factory, which the React 19 lint rules flag.)
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);
  const zoneRef = useRef<HTMLInputElement>(null);
  const paymentMethodRef = useRef<HTMLInputElement>(null);
  const paymentReferenceRef = useRef<HTMLInputElement>(null);
  const paymentSenderRef = useRef<HTMLInputElement>(null);
  const fieldRefs: Record<FieldName, React.RefObject<HTMLElement | null>> = {
    name: nameRef,
    phone: phoneRef,
    email: emailRef,
    address: addressRef,
    zone: zoneRef,
    paymentMethod: paymentMethodRef,
    paymentReference: paymentReferenceRef,
    paymentSender: paymentSenderRef,
  };

  // Switching away from mobile banking clears the TrxID + sender
  // number (and their errors) so a stale value can never be submitted
  // with COD / card — the schema rejects non-empty details for those
  // methods. Switching between mobile-banking methods keeps them.
  function handlePaymentMethodChange(method: PaymentMethodId) {
    setPaymentMethod(method);
    if (!isMobileBankingMethodId(method)) {
      setPaymentReference("");
      setPaymentSender("");
      setErrors((current) => {
        const next = { ...current };
        delete next.paymentReference;
        delete next.paymentSender;
        return next;
      });
    }
  }

  // S-4: totals + delivery display use the admin settings when they
  // have loaded; otherwise the demo-config defaults.
  const deliveryOptions: Record<DeliveryZone, DeliveryOption> = settings
    ? {
        inside: {
          feeBdt: settings.deliveryInsideFeeBdt,
          label: "Inside Dhaka",
          estimate: settings.deliveryInsideEstimate,
        },
        outside: {
          feeBdt: settings.deliveryOutsideFeeBdt,
          label: "Outside Dhaka",
          estimate: settings.deliveryOutsideEstimate,
        },
      }
    : DELIVERY_OPTIONS;
  const taxRatePercent = settings?.taxRatePercent ?? DEMO_TAX_RATE_PERCENT;
  const totals = computeTotals(
    subtotalBdt,
    zone,
    settings ? settingsToPricing(settings) : undefined,
  );

  // S-4: only offer the payment methods the owner left switched on
  // in Admin Settings. While settings are still loading (or the
  // fetch failed) every method is offered — checkout is never
  // blocked on settings. The server stays authoritative: it rejects
  // a disabled method even if it is somehow submitted.
  const enabledPaymentMethods = settings
    ? PAYMENT_METHODS.filter((method) =>
        isPaymentMethodEnabled(method.id, settings),
      )
    : PAYMENT_METHODS;
  // If the offered set changes (settings arrive, or the owner
  // turned a method off) and the current selection is no longer
  // offered, move to the first offered method. Render-time
  // adjustment, same pattern as the admin order-status form — no
  // effect, so react-hooks/set-state-in-effect stays clean. The key
  // is the joined ids, not the array identity: filter() builds a
  // new array on every render.
  const enabledPaymentKey = enabledPaymentMethods
    .map((method) => method.id)
    .join(",");
  const [prevEnabledPaymentKey, setPrevEnabledPaymentKey] =
    useState(enabledPaymentKey);
  if (enabledPaymentKey !== prevEnabledPaymentKey) {
    setPrevEnabledPaymentKey(enabledPaymentKey);
    if (
      !enabledPaymentMethods.some((method) => method.id === paymentMethod)
    ) {
      setPaymentMethod(enabledPaymentMethods[0]?.id ?? "cod");
    }
  }

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
      paymentReference,
      paymentSender,
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
            // S-3: payment details travel INSIDE customer (same shape
            // as the S-2 fix). Empty strings become undefined here and
            // are dropped by JSON.stringify, so the body stays clean
            // for COD/card (no payment details sent for those methods).
            paymentReference: data.paymentReference || undefined,
            paymentSender: data.paymentSender || undefined,
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
          {(Object.keys(deliveryOptions) as DeliveryZone[]).map(
            (optionZone, index) => {
              const option = deliveryOptions[optionZone];
              return (
                <label
                  key={optionZone}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong"
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
          {PAYMENT_GROUP_ORDER.map((group) => {
            // S-4: a group with no offered method is hidden entirely
            // (e.g. Mobile Banking when bKash, Nagad and Rocket are
            // all switched off in Settings).
            const groupMethods = enabledPaymentMethods.filter(
              (method) => method.group === group,
            );
            if (groupMethods.length === 0) {
              return null;
            }
            return (
              <fieldset key={group}>
                <legend className="mb-2 text-sm font-semibold text-text-secondary">
                  {group}
                </legend>
                <div className="space-y-2">
                  {groupMethods.map((method, index) => (
                  <label
                    key={method.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong"
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
                      onChange={() => handlePaymentMethodChange(method.id)}
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
            );
          })}
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

      {isMobileBankingMethodId(paymentMethod) ? (
        <div className="space-y-5">
          <div>
            <label
              htmlFor="checkout-paymentReference"
              className="mb-1 block font-semibold text-text"
            >
              Transaction ID (TrxID)
            </label>
            <input
              ref={paymentReferenceRef}
              id="checkout-paymentReference"
              name="paymentReference"
              type="text"
              autoComplete="off"
              inputMode="text"
              placeholder="e.g. 9A1B2C3D4E"
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              aria-invalid={Boolean(errors.paymentReference)}
              aria-describedby={
                errors.paymentReference
                  ? "checkout-paymentReference-error"
                  : undefined
              }
              className={inputClassName}
            />
            {errors.paymentReference ? (
              <p
                id="checkout-paymentReference-error"
                className="mt-1 text-sm text-error"
              >
                {errors.paymentReference}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="checkout-paymentSender"
              className="mb-1 block font-semibold text-text"
            >
              Sender mobile number
            </label>
            <input
              ref={paymentSenderRef}
              id="checkout-paymentSender"
              name="paymentSender"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              value={paymentSender}
              onChange={(event) => setPaymentSender(event.target.value)}
              aria-invalid={Boolean(errors.paymentSender)}
              aria-describedby={
                errors.paymentSender
                  ? "checkout-paymentSender-error"
                  : undefined
              }
              className={inputClassName}
            />
            {errors.paymentSender ? (
              <p
                id="checkout-paymentSender-error"
                className="mt-1 text-sm text-error"
              >
                {errors.paymentSender}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <section
        aria-label="Order summary"
        className="rounded-lg border border-border bg-surface p-6 shadow-sm"
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
            <dt>Tax ({taxRatePercent}%)</dt>
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
        className="min-h-11 w-full rounded-md bg-action px-6 py-3 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Placing your order…" : "Place Order"}
      </button>
    </form>
  );
}
