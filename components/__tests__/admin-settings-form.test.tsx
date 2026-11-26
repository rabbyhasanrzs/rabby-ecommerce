import SettingsForm from "@/components/admin/settings-form";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Settings form tests (S-4, T-47 / T-48).
 *
 * Slice A's updateSiteSettingsAction and this slice's discount-code
 * actions are mocked — the form is tested, not the database. The
 * tests prove: every section renders, DEMO10 is shown pre-seeded,
 * a tax over 100 is rejected without calling the save action, and
 * a bad discount code is rejected without calling the add action.
 */

const { updateSettingsMock, addCodeMock, toggleCodeMock } = vi.hoisted(
  () => ({
    updateSettingsMock: vi.fn(),
    addCodeMock: vi.fn(),
    toggleCodeMock: vi.fn(),
  }),
);

vi.mock("@/lib/site-settings-actions", () => ({
  updateSiteSettingsAction: updateSettingsMock,
}));

vi.mock("@/app/admin/(protected)/settings/actions", () => ({
  addDiscountCodeAction: addCodeMock,
  toggleDiscountCodeAction: toggleCodeMock,
}));

import { DEFAULT_SETTINGS } from "@/lib/site-settings";

function renderForm() {
  return render(
    <SettingsForm
      settings={DEFAULT_SETTINGS}
      discountCodes={[{ code: "DEMO10", percent_off: 10, active: true }]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Slice A's real action returns { ok, error? } — never throws for
  // bad input.
  updateSettingsMock.mockResolvedValue({ ok: true });
  addCodeMock.mockResolvedValue({
    ok: true,
    message: "Discount code SAVE20 added (20% off).",
  });
  toggleCodeMock.mockResolvedValue({
    ok: true,
    message: "Discount code DEMO10 is deactivated. Past orders keep their discount.",
  });
});

describe("SettingsForm", () => {
  it("renders all sections and shows DEMO10 pre-seeded", () => {
    renderForm();

    expect(
      screen.getByRole("heading", { name: "Payment methods" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Tax/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Delivery/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Discount codes/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Website notice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Support contacts" }),
    ).toBeInTheDocument();

    // Five payment toggles on by default; Pay Online (S-7) off by
    // default until the owner turns it on after the sandbox
    // credentials are in.
    for (const label of [
      "Cash on Delivery",
      "bKash",
      "Nagad",
      "Rocket",
      "Debit / Credit Card",
    ]) {
      expect(screen.getByLabelText(label)).toBeChecked();
    }
    expect(screen.getByLabelText("Pay Online (SSLCommerz)")).not.toBeChecked();

    // DEMO10 pre-seeded, active, 10% off.
    expect(screen.getByText("DEMO10")).toBeInTheDocument();
    expect(screen.getByText("10% off")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("rejects tax over 100 and does not call the save action", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Tax rate (%)"), {
      target: { value: "101" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      screen.getByText("Tax must be a whole number between 0 and 100."),
    ).toBeInTheDocument();
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("saves valid settings with Slice A's camelCase field names and shows the confirmation", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(updateSettingsMock).toHaveBeenCalledTimes(1);
    const formData = updateSettingsMock.mock.calls[0][0] as FormData;
    expect(formData.get("taxRatePercent")).toBe("5");
    expect(formData.get("deliveryInsideFeeBdt")).toBe("60");
    expect(formData.get("deliveryOutsideFeeBdt")).toBe("120");
    expect(formData.get("paymentCodEnabled")).toBe("on");
    expect(
      await screen.findByText("Settings saved. Nothing changed."),
    ).toBeInTheDocument();
  });

  it("lists what changed after a successful save", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Tax rate (%)"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByLabelText("Rocket"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      await screen.findByText("Settings saved successfully."),
    ).toBeInTheDocument();
    expect(screen.getByText("Tax rate: 5% → 10%")).toBeInTheDocument();
    expect(screen.getByText("Rocket: on → off")).toBeInTheDocument();
  });

  it("lists a delivery-fee change with the Taka amount", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Inside Dhaka — fee (৳)"), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      await screen.findByText("Settings saved successfully."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Delivery fee (Inside Dhaka): ৳60 → ৳80"),
    ).toBeInTheDocument();
  });

  it("rejects a bad discount code and does not call the add action", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("New code"), {
      target: { value: "SAVE-10" },
    });
    fireEvent.change(screen.getByLabelText("Percent off (%)"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add code" }));

    expect(
      screen.getByText("Code must be 3–20 letters or numbers (A–Z, 0–9)."),
    ).toBeInTheDocument();
    expect(addCodeMock).not.toHaveBeenCalled();
  });

  it("rejects a discount percent over 100", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("New code"), {
      target: { value: "SAVE20" },
    });
    fireEvent.change(screen.getByLabelText("Percent off (%)"), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add code" }));

    expect(
      screen.getByText("Percent must be a whole number between 1 and 100."),
    ).toBeInTheDocument();
    expect(addCodeMock).not.toHaveBeenCalled();
  });

  it("submits a valid discount code", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("New code"), {
      target: { value: "SAVE20" },
    });
    fireEvent.change(screen.getByLabelText("Percent off (%)"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add code" }));

    expect(addCodeMock).toHaveBeenCalledTimes(1);
    const formData = addCodeMock.mock.calls[0][1] as FormData;
    expect(formData.get("code")).toBe("SAVE20");
    expect(formData.get("percent_off")).toBe("20");
    expect(
      await screen.findByText("Discount code SAVE20 added (20% off)."),
    ).toBeInTheDocument();
  });

  it("deactivating DEMO10 calls the toggle action with active=false", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(toggleCodeMock).toHaveBeenCalledTimes(1);
    const formData = toggleCodeMock.mock.calls[0][1] as FormData;
    expect(formData.get("code")).toBe("DEMO10");
    expect(formData.get("active")).toBe("false");
  });
});
