"use client";

import {
  addDiscountCodeAction,
  toggleDiscountCodeAction,
  type DiscountActionState,
} from "@/app/admin/(protected)/settings/actions";
import {
  updateSiteSettingsAction,
} from "@/lib/site-settings-actions";
import { type SiteSettings } from "@/lib/site-settings";
import { useActionState, useState } from "react";

/**
 * Admin Settings form — Slice C (S-4, T-48).
 *
 * Sections: (a) payment methods on/off, (b) tax %, (c) delivery,
 * (d) discount codes, (e) website notice, (f) support contacts.
 * Every demo value is labelled DEMO: tax, delivery and discount
 * codes are placeholders the owner confirms (or replaces) — the
 * storefront uses whatever is saved here (create_guest_order reads
 * site_settings; the S-5 storefront work displays the notice).
 *
 * FIELD NAMES are Slice A's camelCase contract
 * (lib/site-settings.ts: SiteSettings + parseSiteSettingsForm):
 * taxRatePercent, deliveryInsideFeeBdt, deliveryInsideEstimate,
 * deliveryOutsideFeeBdt, deliveryOutsideEstimate,
 * paymentCodEnabled / paymentBkashEnabled / paymentNagadEnabled /
 * paymentRocketEnabled / paymentCardEnabled, websiteNotice,
 * supportWhatsapp / supportMessenger / supportPhone / supportEmail.
 * Payment toggles are plain checkboxes (value "on"): an unchecked
 * box sends nothing, and parseSiteSettingsForm treats a missing
 * field as off.
 *
 * The payment / tax / delivery / notice / support section submits
 * via Slice A's updateSiteSettingsAction (returns { ok, error? });
 * discount codes use this slice's own actions (./actions.ts).
 * Client-side validation runs in onSubmit and blocks the save when
 * a value is bad — the server actions validate again (zod) as
 * defence in depth. The number inputs deliberately carry no native
 * min/max attributes: native range validation would block the
 * submit before this form's own inline errors could show.
 */

/** One discount_codes row, as read from the database (snake_case). */
export interface DiscountCodeRow {
  code: string;
  percent_off: number;
  active: boolean;
}

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text";
const labelClassName = "mb-1 block font-semibold";
const sectionClassName =
  "rounded-lg border border-border bg-surface p-4 sm:p-6";
const sectionTitleClassName = "font-display text-xl font-bold";
const errorClassName = "mt-1 text-sm font-semibold text-error";

const PAYMENT_METHODS = [
  { field: "paymentCodEnabled", label: "Cash on Delivery" },
  { field: "paymentBkashEnabled", label: "bKash" },
  { field: "paymentNagadEnabled", label: "Nagad" },
  { field: "paymentRocketEnabled", label: "Rocket" },
  { field: "paymentCardEnabled", label: "Debit / Credit Card" },
] as const;

type PaymentField = (typeof PAYMENT_METHODS)[number]["field"];

interface SettingsSaveState {
  ok: boolean;
  message: string;
  /** Short "what changed" lines for a successful save, e.g. "Rocket: on → off". */
  changes?: string[];
}

const showValue = (value: string): string =>
  value === "" ? "(blank)" : value;

/**
 * Compare the submitted form values with the settings the page
 * loaded, and describe each change in one short line. The owner
 * asked to see not just "saved" but what actually changed.
 * Numbers compare numerically (form values arrive as strings);
 * payment toggles compare on/off; free-text fields (notice,
 * contacts) only say "updated" — their content is not repeated.
 */
function describeSettingsChanges(
  oldSettings: SiteSettings,
  formData: FormData,
): string[] {
  const changes: string[] = [];

  for (const method of PAYMENT_METHODS) {
    const wasOn = oldSettings[method.field];
    const isOn = formData.get(method.field) === "on";
    if (wasOn !== isOn) {
      changes.push(
        `${method.label}: ${wasOn ? "on" : "off"} → ${isOn ? "on" : "off"}`,
      );
    }
  }

  const numberChange = (
    label: string,
    field: string,
    oldValue: number,
    format: (value: number) => string,
  ): void => {
    const raw = formData.get(field);
    if (raw === null || raw === "") {
      return;
    }
    const next = Number(raw);
    if (!Number.isNaN(next) && next !== oldValue) {
      changes.push(`${label}: ${format(oldValue)} → ${format(next)}`);
    }
  };
  numberChange(
    "Tax rate",
    "taxRatePercent",
    oldSettings.taxRatePercent,
    (value) => `${value}%`,
  );
  numberChange(
    "Delivery fee (Inside Dhaka)",
    "deliveryInsideFeeBdt",
    oldSettings.deliveryInsideFeeBdt,
    (value) => `৳${value}`,
  );
  numberChange(
    "Delivery fee (Outside Dhaka)",
    "deliveryOutsideFeeBdt",
    oldSettings.deliveryOutsideFeeBdt,
    (value) => `৳${value}`,
  );

  const textChange = (
    label: string,
    field: string,
    oldValue: string,
    showValues: boolean,
  ): void => {
    const raw = formData.get(field);
    if (typeof raw !== "string") {
      return;
    }
    const next = raw.trim();
    if (next !== oldValue) {
      changes.push(
        showValues
          ? `${label}: ${showValue(oldValue)} → ${showValue(next)}`
          : `${label}: updated`,
      );
    }
  };
  textChange(
    "Delivery estimate (Inside Dhaka)",
    "deliveryInsideEstimate",
    oldSettings.deliveryInsideEstimate,
    true,
  );
  textChange(
    "Delivery estimate (Outside Dhaka)",
    "deliveryOutsideEstimate",
    oldSettings.deliveryOutsideEstimate,
    true,
  );
  textChange("Website notice", "websiteNotice", oldSettings.websiteNotice, false);
  textChange("WhatsApp", "supportWhatsapp", oldSettings.supportWhatsapp, false);
  textChange("Messenger", "supportMessenger", oldSettings.supportMessenger, false);
  textChange("Phone", "supportPhone", oldSettings.supportPhone, false);
  textChange("Email", "supportEmail", oldSettings.supportEmail, false);

  return changes;
}

function DemoBadge() {
  return (
    <span className="ml-2 rounded-full bg-background-subtle px-2 py-0.5 text-xs font-bold tracking-wide text-text-secondary">
      DEMO
    </span>
  );
}

function isIntegerInRange(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) {
    return false;
  }
  const n = Number(value);
  return n >= min && n <= max;
}

export default function SettingsForm({
  settings,
  discountCodes,
}: {
  settings: SiteSettings;
  discountCodes: DiscountCodeRow[];
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [codeError, setCodeError] = useState<string | null>(null);

  // Main settings save: Slice A's action returns { ok, error? } —
  // no thrown error for bad input. A redirect (requireAdmin) throws
  // NEXT_REDIRECT and must propagate, so it is re-thrown, not
  // swallowed into a save message.
  const [settingsState, saveSettings] = useActionState(
    async (
      _prevState: SettingsSaveState | null,
      formData: FormData,
    ): Promise<SettingsSaveState> => {
      try {
        const result = await updateSiteSettingsAction(formData);
        if (result.ok) {
          const changes = describeSettingsChanges(settings, formData);
          return {
            ok: true,
            message:
              changes.length > 0
                ? "Settings saved successfully."
                : "Settings saved. Nothing changed.",
            changes,
          };
        }
        return {
          ok: false,
          message:
            result.error ??
            "Settings could not be saved. Please check the values and try again.",
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("NEXT_REDIRECT")
        ) {
          throw error;
        }
        return {
          ok: false,
          message:
            "Settings could not be saved. Please check the values and try again.",
        };
      }
    },
    null,
  );

  const [addState, addCode] = useActionState<
    DiscountActionState | null,
    FormData
  >(addDiscountCodeAction, null);
  const [toggleState, toggleCode] = useActionState<
    DiscountActionState | null,
    FormData
  >(toggleDiscountCodeAction, null);

  function validateSettingsForm(form: HTMLFormElement): boolean {
    const data = new FormData(form);
    const errors: Record<string, string> = {};

    const tax = String(data.get("taxRatePercent") ?? "");
    if (!isIntegerInRange(tax, 0, 100)) {
      errors.taxRatePercent =
        "Tax must be a whole number between 0 and 100.";
    }
    for (const field of [
      "deliveryInsideFeeBdt",
      "deliveryOutsideFeeBdt",
    ] as const) {
      const fee = String(data.get(field) ?? "");
      if (!isIntegerInRange(fee, 0, 100000)) {
        errors[field] = "Delivery fee must be a whole number of Taka (0 or more).";
      }
    }
    for (const field of [
      "deliveryInsideEstimate",
      "deliveryOutsideEstimate",
    ] as const) {
      if (String(data.get(field) ?? "").trim().length === 0) {
        errors[field] = "Enter a delivery estimate, for example “1–2 days”.";
      }
    }
    const email = String(data.get("supportEmail") ?? "").trim();
    if (email.length > 0 && !email.includes("@")) {
      errors.supportEmail = "Enter a valid email address, or leave it empty.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateAddCodeForm(form: HTMLFormElement): boolean {
    const data = new FormData(form);
    const code = String(data.get("code") ?? "").trim().toUpperCase();
    const percent = String(data.get("percent_off") ?? "");
    if (!/^[A-Z0-9]{3,20}$/.test(code)) {
      setCodeError("Code must be 3–20 letters or numbers (A–Z, 0–9).");
      return false;
    }
    if (!isIntegerInRange(percent, 1, 100)) {
      setCodeError("Percent must be a whole number between 1 and 100.");
      return false;
    }
    setCodeError(null);
    return true;
  }

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-border bg-surface px-4 py-3 text-text-secondary">
        Demo configuration — tax, delivery and discount values are
        placeholders until the owner confirms real ones. Saving here
        changes what shoppers see at checkout.
      </p>

      {/* ---- Main settings: payment / tax / delivery / notice / support ---- */}
      <form
        action={saveSettings}
        onSubmit={(event) => {
          if (!validateSettingsForm(event.currentTarget)) {
            event.preventDefault();
          }
        }}
        className="space-y-6"
      >
        <section aria-labelledby="payment-heading" className={sectionClassName}>
          <h2 id="payment-heading" className={sectionTitleClassName}>
            Payment methods
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Turn a method off and shoppers cannot choose it at checkout —
            orders already placed are not affected.
          </p>
          <ul className="mt-4 space-y-3">
            {PAYMENT_METHODS.map((method) => (
              <li key={method.field} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={method.field}
                  name={method.field}
                  value="on"
                  defaultChecked={settings[method.field as PaymentField]}
                  className="h-5 w-5 shrink-0 accent-action"
                />
                <label htmlFor={method.field} className="font-semibold">
                  {method.label}
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="tax-heading" className={sectionClassName}>
          <h2 id="tax-heading" className={sectionTitleClassName}>
            Tax
            <DemoBadge />
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Demo value — the percentage added to every order subtotal.
          </p>
          <div className="mt-4 max-w-xs">
            <label htmlFor="taxRatePercent" className={labelClassName}>
              Tax rate (%)
            </label>
            <input
              type="number"
              id="taxRatePercent"
              name="taxRatePercent"
              inputMode="numeric"
              step={1}
              defaultValue={settings.taxRatePercent}
              aria-describedby={
                fieldErrors.taxRatePercent ? "taxRatePercent-error" : undefined
              }
              className={inputClassName}
            />
            {fieldErrors.taxRatePercent ? (
              <p id="taxRatePercent-error" className={errorClassName}>
                {fieldErrors.taxRatePercent}
              </p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="delivery-heading" className={sectionClassName}>
          <h2 id="delivery-heading" className={sectionTitleClassName}>
            Delivery
            <DemoBadge />
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Demo values — the fee and estimate shown at checkout for each
            zone.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="deliveryInsideFeeBdt"
                className={labelClassName}
              >
                Inside Dhaka — fee (৳)
              </label>
              <input
                type="number"
                id="deliveryInsideFeeBdt"
                name="deliveryInsideFeeBdt"
                inputMode="numeric"
                step={1}
                defaultValue={settings.deliveryInsideFeeBdt}
                aria-describedby={
                  fieldErrors.deliveryInsideFeeBdt
                    ? "deliveryInsideFeeBdt-error"
                    : undefined
                }
                className={inputClassName}
              />
              {fieldErrors.deliveryInsideFeeBdt ? (
                <p id="deliveryInsideFeeBdt-error" className={errorClassName}>
                  {fieldErrors.deliveryInsideFeeBdt}
                </p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="deliveryInsideEstimate"
                className={labelClassName}
              >
                Inside Dhaka — estimate
              </label>
              <input
                type="text"
                id="deliveryInsideEstimate"
                name="deliveryInsideEstimate"
                defaultValue={settings.deliveryInsideEstimate}
                aria-describedby={
                  fieldErrors.deliveryInsideEstimate
                    ? "deliveryInsideEstimate-error"
                    : undefined
                }
                className={inputClassName}
              />
              {fieldErrors.deliveryInsideEstimate ? (
                <p
                  id="deliveryInsideEstimate-error"
                  className={errorClassName}
                >
                  {fieldErrors.deliveryInsideEstimate}
                </p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="deliveryOutsideFeeBdt"
                className={labelClassName}
              >
                Outside Dhaka — fee (৳)
              </label>
              <input
                type="number"
                id="deliveryOutsideFeeBdt"
                name="deliveryOutsideFeeBdt"
                inputMode="numeric"
                step={1}
                defaultValue={settings.deliveryOutsideFeeBdt}
                aria-describedby={
                  fieldErrors.deliveryOutsideFeeBdt
                    ? "deliveryOutsideFeeBdt-error"
                    : undefined
                }
                className={inputClassName}
              />
              {fieldErrors.deliveryOutsideFeeBdt ? (
                <p
                  id="deliveryOutsideFeeBdt-error"
                  className={errorClassName}
                >
                  {fieldErrors.deliveryOutsideFeeBdt}
                </p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="deliveryOutsideEstimate"
                className={labelClassName}
              >
                Outside Dhaka — estimate
              </label>
              <input
                type="text"
                id="deliveryOutsideEstimate"
                name="deliveryOutsideEstimate"
                defaultValue={settings.deliveryOutsideEstimate}
                aria-describedby={
                  fieldErrors.deliveryOutsideEstimate
                    ? "deliveryOutsideEstimate-error"
                    : undefined
                }
                className={inputClassName}
              />
              {fieldErrors.deliveryOutsideEstimate ? (
                <p
                  id="deliveryOutsideEstimate-error"
                  className={errorClassName}
                >
                  {fieldErrors.deliveryOutsideEstimate}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section aria-labelledby="notice-heading" className={sectionClassName}>
          <h2 id="notice-heading" className={sectionTitleClassName}>
            Website notice
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Short notice shown on the storefront (the storefront display
            is S-5 work — S-4 stores it here).
          </p>
          <div className="mt-4">
            <label htmlFor="websiteNotice" className={labelClassName}>
              Notice text
            </label>
            <textarea
              id="websiteNotice"
              name="websiteNotice"
              rows={2}
              defaultValue={settings.websiteNotice}
              placeholder="For example: Eid delivery times may be longer."
              className={`${inputClassName} min-h-11 py-2`}
            />
          </div>
        </section>

        <section aria-labelledby="support-heading" className={sectionClassName}>
          <h2 id="support-heading" className={sectionTitleClassName}>
            Support contacts
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Demo placeholders until the owner provides real contact
            details. Leave a field empty to hide it.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supportWhatsapp" className={labelClassName}>
                WhatsApp
              </label>
              <input
                type="text"
                id="supportWhatsapp"
                name="supportWhatsapp"
                defaultValue={settings.supportWhatsapp}
                placeholder="WhatsApp number or link"
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="supportMessenger" className={labelClassName}>
                Messenger
              </label>
              <input
                type="text"
                id="supportMessenger"
                name="supportMessenger"
                defaultValue={settings.supportMessenger}
                placeholder="Messenger link"
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="supportPhone" className={labelClassName}>
                Phone
              </label>
              <input
                type="text"
                id="supportPhone"
                name="supportPhone"
                defaultValue={settings.supportPhone}
                placeholder="Phone number"
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="supportEmail" className={labelClassName}>
                Email
              </label>
              <input
                type="email"
                id="supportEmail"
                name="supportEmail"
                defaultValue={settings.supportEmail}
                placeholder="Support email"
                aria-describedby={
                  fieldErrors.supportEmail ? "supportEmail-error" : undefined
                }
                className={inputClassName}
              />
              {fieldErrors.supportEmail ? (
                <p id="supportEmail-error" className={errorClassName}>
                  {fieldErrors.supportEmail}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="min-h-11 rounded-md bg-action px-6 py-2 font-semibold text-text-inverse hover:bg-action-hover"
          >
            Save settings
          </button>
          {settingsState ? (
            <div role="status">
              <p
                className={`font-semibold ${settingsState.ok ? "text-success" : "text-error"}`}
              >
                {settingsState.message}
              </p>
              {settingsState.ok &&
              settingsState.changes &&
              settingsState.changes.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text">
                  {settingsState.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </form>

      {/* ---- Discount codes (own actions — ./actions.ts) ---- */}
      <section aria-labelledby="discount-heading" className={sectionClassName}>
        <h2 id="discount-heading" className={sectionTitleClassName}>
          Discount codes
          <DemoBadge />
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Demo code DEMO10 is pre-seeded. Customers can now redeem
          active codes at checkout — the discount applies to their
          order total. Codes are never deleted: deactivate a code
          instead, so past orders keep their record.
        </p>

        {discountCodes.length === 0 ? (
          <p className="mt-4 text-text-secondary">
            No discount codes yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {discountCodes.map((code) => (
              <li
                key={code.code}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <span className="font-mono font-bold">{code.code}</span>
                <span className="text-text-secondary">
                  {code.percent_off}% off
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    code.active
                      ? "bg-background-subtle text-success"
                      : "bg-background-subtle text-text-secondary"
                  }`}
                >
                  {code.active ? "Active" : "Deactivated"}
                </span>
                <form action={toggleCode} className="ml-auto">
                  <input type="hidden" name="code" value={code.code} />
                  <input
                    type="hidden"
                    name="active"
                    value={code.active ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 font-semibold hover:bg-surface-hover"
                  >
                    {code.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {toggleState ? (
          <p
            role="status"
            className={`mt-2 font-semibold ${toggleState.ok ? "text-success" : "text-error"}`}
          >
            {toggleState.message}
          </p>
        ) : null}

        <form
          action={addCode}
          onSubmit={(event) => {
            if (!validateAddCodeForm(event.currentTarget)) {
              event.preventDefault();
            }
          }}
          className="mt-6 border-t border-border pt-4"
        >
          <h3 className="font-semibold">Add a discount code</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
            <div>
              <label htmlFor="new_discount_code" className={labelClassName}>
                New code
              </label>
              <input
                type="text"
                id="new_discount_code"
                name="code"
                placeholder="For example: SAVE20"
                autoCapitalize="characters"
                aria-describedby={codeError ? "new_discount_code-error" : undefined}
                className={`${inputClassName} font-mono uppercase`}
              />
            </div>
            <div>
              <label htmlFor="new_discount_percent" className={labelClassName}>
                Percent off (%)
              </label>
              <input
                type="number"
                id="new_discount_percent"
                name="percent_off"
                inputMode="numeric"
                step={1}
                placeholder="10"
                aria-describedby={codeError ? "new_discount_code-error" : undefined}
                className={inputClassName}
              />
            </div>
            <button
              type="submit"
              className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 font-semibold hover:bg-surface-hover"
            >
              Add code
            </button>
          </div>
          {codeError ? (
            <p id="new_discount_code-error" className={errorClassName}>
              {codeError}
            </p>
          ) : null}
          {addState ? (
            <p
              role="status"
              className={`mt-2 font-semibold ${addState.ok ? "text-success" : "text-error"}`}
            >
              {addState.message}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
