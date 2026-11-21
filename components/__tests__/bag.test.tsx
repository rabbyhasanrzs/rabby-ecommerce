import BagPage from "@/app/bag/page";
import MiniCartDrawer from "@/components/mini-cart-drawer";
import { BagProvider, useBag } from "@/lib/bag-context";
import type { BagItem } from "@/lib/bag";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "rabby-bag-v1";

const SEEDED_ITEM: BagItem = {
  slug: "sample-round-a",
  name: "SAMPLE Round A",
  priceBdt: 950,
  image: "/images/sample-round-a.webp",
  variantColour: "Black",
  quantity: 1,
};

function seedBag(items: BagItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** Opens the drawer on mount, so the drawer can be tested directly. */
function OpenDrawerOnMount() {
  const { openDrawer } = useBag();
  // Guard: openDrawer gets a new identity on every provider render,
  // so without this the effect would re-open the drawer after Escape
  // closes it.
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      openDrawer();
    }
  }, [openDrawer]);
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, items: [], issues: [] }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Bag page", () => {
  it("empty state shows 'Your bag is empty.' and NO Checkout button", async () => {
    render(
      <BagProvider>
        <BagPage />
      </BagProvider>,
    );

    expect(
      await screen.findByText("Your bag is empty."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Checkout" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Checkout" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continue Shopping" }),
    ).toHaveAttribute("href", "/sunglasses");
  });

  it("renders a line item with stepper and remove, and + increases qty", async () => {
    seedBag([SEEDED_ITEM]);
    render(
      <BagProvider>
        <BagPage />
      </BagProvider>,
    );

    expect(
      await screen.findByRole("link", { name: "SAMPLE Round A" }),
    ).toHaveAttribute("href", "/product/sample-round-a");
    expect(screen.getByText("Colour: Black")).toBeInTheDocument();
    expect(screen.getByText("৳950 each")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Decrease quantity of SAMPLE Round A",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Increase quantity of SAMPLE Round A",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove SAMPLE Round A from bag",
      }),
    ).toBeInTheDocument();

    // Validation is mocked empty, so the stepper falls back to the
    // local snapshot and + is allowed.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Increase quantity of SAMPLE Round A",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("group", {
          name: "Quantity of SAMPLE Round A",
        }),
      ).toHaveTextContent("2");
    });
    // Line total follows: 2 x ৳950 — the same figure also appears as
    // the summary Subtotal.
    expect(screen.getAllByText("৳1,900")).toHaveLength(2);
  });
});

describe("Mini-cart drawer", () => {
  it("renders items + subtotal and closes on Escape", async () => {
    seedBag([SEEDED_ITEM]);
    render(
      <BagProvider>
        <OpenDrawerOnMount />
        <MiniCartDrawer />
      </BagProvider>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Your bag",
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("SAMPLE Round A")).toBeInTheDocument();
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    // ৳950 twice: the line total and the subtotal.
    expect(screen.getAllByText("৳950")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "View Bag" }),
    ).toHaveAttribute("href", "/bag");
    expect(
      screen.getByRole("link", { name: "Checkout" }),
    ).toHaveAttribute("href", "/checkout");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Your bag" }),
      ).not.toBeInTheDocument();
    });
  });
});
