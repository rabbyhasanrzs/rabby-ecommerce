"use client";

import type { SiteSettings } from "@/lib/site-settings";
import { useEffect, useState } from "react";

/**
 * Contact channels (S-5, T-53) — settings-driven.
 *
 * Fetches GET /api/settings on mount, the same pattern as
 * components/checkout-form.tsx (shape-check the JSON; on any
 * failure keep the fallback). The actual contact details have NOT
 * been provided by the owner, so a field that is empty — including
 * while settings are still loading — renders a LABELLED placeholder
 * ("Not provided yet"), never an invented number, link or address.
 *
 * No setState in useEffect: the fetch is fire-and-forget with a
 * cancelled flag, exactly like the checkout form. The initial
 * `null` settings state IS the loading state, so placeholders show
 * before the fetch resolves.
 */

function parseSettingsJson(value: unknown): SiteSettings | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.supportWhatsapp !== "string" ||
    typeof row.supportMessenger !== "string" ||
    typeof row.supportPhone !== "string" ||
    typeof row.supportEmail !== "string"
  ) {
    return null;
  }
  return value as SiteSettings;
}

function isLink(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function ChannelRow({
  name,
  note,
  value,
}: {
  name: string;
  note: string;
  value: string | null;
}) {
  const display = (value ?? "").trim();
  return (
    <li className="rounded-md border border-border bg-surface p-4">
      <p className="font-semibold text-text">{name}</p>
      <p className="mt-1 text-sm leading-relaxed text-text-secondary">
        {note}
      </p>
      {display ? (
        isLink(display) ? (
          <a
            href={display}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block break-all font-semibold text-action underline underline-offset-2"
          >
            {display}
          </a>
        ) : (
          <p className="mt-2 break-all font-semibold text-text">{display}</p>
        )
      ) : (
        <p className="mt-2 text-text-secondary">
          Not provided yet — coming soon.
        </p>
      )}
    </li>
  );
}

export default function ContactChannels() {
  // null = still loading, or the fetch failed — placeholders show
  // either way; contact is never blocked on settings.
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
        // Settings unavailable — placeholders stay.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <p className="leading-relaxed text-text">
        Reach us on any channel below. WhatsApp is our primary channel;
        Messenger is secondary. Contact details are added here as soon
        as the owner provides them — nothing here is a placeholder
        number or link.
      </p>
      <ul className="space-y-3">
        <ChannelRow
          name="WhatsApp (primary)"
          note="Message us on WhatsApp for orders, delivery and returns."
          value={settings?.supportWhatsapp ?? null}
        />
        <ChannelRow
          name="Messenger (secondary)"
          note="Message us on Facebook Messenger."
          value={settings?.supportMessenger ?? null}
        />
        <ChannelRow
          name="Phone"
          note="Call us during shop hours."
          value={settings?.supportPhone ?? null}
        />
        <ChannelRow
          name="Email"
          note="Write to us for anything that needs a longer answer."
          value={settings?.supportEmail ?? null}
        />
      </ul>
    </>
  );
}
