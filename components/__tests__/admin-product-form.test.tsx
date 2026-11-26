import ProductForm from "@/components/admin/product-form";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin ProductForm tests (S-4, T-42). The form must block a save
 * without a price, without a photo and without stock — and never
 * reach the API in those cases. The admin module is mocked (the
 * form only imports it through the shared Zod schema).
 */

const { fetchMock, pushMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  createAdminClient: () => ({ rpc: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const CATEGORIES = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Round" },
];

function renderAddForm() {
  render(<ProductForm categories={CATEGORIES} initial={null} mode="add" />);
}

describe("ProductForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it("blocks save with everything empty and never calls the API", async () => {
    renderAddForm();
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    expect(
      await screen.findByText("Enter a product name."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter a price greater than ৳0."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter the stock quantity.")).toBeInTheDocument();
    expect(screen.getByText("Upload a product photo.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks save when the price and stock are filled but no photo is given", async () => {
    renderAddForm();
    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "Test Shades" },
    });
    fireEvent.change(screen.getByLabelText("Price (৳)"), {
      target: { value: "950" },
    });
    fireEvent.change(screen.getByLabelText("Stock"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    expect(
      await screen.findByText("Upload a product photo."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks save when the price is 0 even with stock and a photo", async () => {
    render(
      <ProductForm
        categories={CATEGORIES}
        initial={{
          id: "22222222-2222-2222-2222-222222222222",
          name: "Test Shades",
          categoryId: null,
          activities: [],
          priceBdt: 950,
          stockTotal: 12,
          status: "active",
          description: "",
          colour: "Black",
          imageUrl: "https://example.supabase.co/photo.webp",
        }}
        mode="edit"
      />,
    );
    fireEvent.change(screen.getByLabelText("Price (৳)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Enter a price greater than ৳0."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the picked file by name, never as a blob-URL preview", async () => {
    renderAddForm();
    const input = screen.getByLabelText("Product photo");
    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "new-photo.webp", { type: "image/webp" })],
      },
    });

    expect(
      await screen.findByText(/Selected: new-photo\.webp/),
    ).toBeInTheDocument();
    // No preview image: the picked file is never rendered from an
    // object URL (CodeQL xss-through-dom). The <img> shows only the
    // already-saved photo, and an add form has none yet.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the saved photo in edit mode", () => {
    render(
      <ProductForm
        categories={CATEGORIES}
        initial={{
          id: "22222222-2222-2222-2222-222222222222",
          name: "Test Shades",
          categoryId: null,
          activities: [],
          priceBdt: 950,
          stockTotal: 12,
          status: "active",
          description: "",
          colour: "Black",
          imageUrl: "https://example.supabase.co/photo.webp",
        }}
        mode="edit"
      />,
    );

    const img = screen.getByRole("img", { name: "Current product photo" });
    expect(img.getAttribute("src")).toBe(
      "https://example.supabase.co/photo.webp",
    );
  });

  it("saves an edit keeping the existing photo, without re-uploading", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: "22222222-2222-2222-2222-222222222222" }),
    });
    render(
      <ProductForm
        categories={CATEGORIES}
        initial={{
          id: "22222222-2222-2222-2222-222222222222",
          name: "Test Shades",
          categoryId: null,
          activities: [],
          priceBdt: 950,
          stockTotal: 12,
          status: "active",
          description: "",
          colour: "Black",
          imageUrl: "https://example.supabase.co/photo.webp",
        }}
        mode="edit"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/products/22222222-2222-2222-2222-222222222222",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining(
          "https://example.supabase.co/photo.webp",
        ),
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/admin/products");
  });

  it("shows the four activity checkboxes, all unticked on a new product (S-7 Shop by Activity)", () => {
    renderAddForm();

    for (const label of ["Driving", "Sport", "Beach", "Everyday"]) {
      const checkbox = screen.getByRole("checkbox", { name: label });
      expect(checkbox).not.toBeChecked();
    }
  });

  it("pre-ticks the tagged activities in edit mode", () => {
    render(
      <ProductForm
        categories={CATEGORIES}
        initial={{
          id: "22222222-2222-2222-2222-222222222222",
          name: "Test Shades",
          categoryId: null,
          activities: ["driving", "everyday"],
          priceBdt: 950,
          stockTotal: 12,
          status: "active",
          description: "",
          colour: "Black",
          imageUrl: "https://example.supabase.co/photo.webp",
        }}
        mode="edit"
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Driving" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Everyday" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sport" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beach" })).not.toBeChecked();
  });

  it("sends the ticked activities in the save body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: "22222222-2222-2222-2222-222222222222" }),
    });
    render(
      <ProductForm
        categories={CATEGORIES}
        initial={{
          id: "22222222-2222-2222-2222-222222222222",
          name: "Test Shades",
          categoryId: null,
          activities: [],
          priceBdt: 950,
          stockTotal: 12,
          status: "active",
          description: "",
          colour: "Black",
          imageUrl: "https://example.supabase.co/photo.webp",
        }}
        mode="edit"
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Driving" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Beach" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as { activities: string[] };
    expect(body.activities).toEqual(["driving", "beach"]);
  });
});
