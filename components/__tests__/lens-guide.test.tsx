import LensGuideBnPage from "@/app/guide/lens/bn/page";
import LensGuidePage from "@/app/guide/lens/page";
import LensSimulator from "@/components/lens-simulator";
import { LENS_GUIDE_BN, LENS_GUIDE_EN } from "@/lib/lens-guide";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/font/google only runs inside a Next build; in Vitest the font
// module is stubbed so the page can render. The Bengali text itself
// is asserted, not the font loader.
vi.mock("@/lib/fonts", () => ({
  notoSansBengali: { className: "mock-bengali-font", variable: "--font-bengali" },
}));

// The scene photo is a binary the owner uploads via the GitHub web
// UI, so it is absent from a fresh checkout (and from CI). The
// pages resolve it at render time — stub it so the page tests cover
// the simulator deterministically in every environment. The
// no-photo behaviour is tested directly on LensSimulator below.
vi.mock("@/lib/lens-scene-photo", () => ({
  resolveLensScenePhoto: () => "/images/lens-scene-beach.jpg",
  LENS_SCENE_PHOTO_PATH: "/images/lens-scene-beach.jpg",
}));

const SCENE = "/images/lens-scene-beach.jpg";

describe("Lens guide content — owner-approved copy (S-7, 1.x-7)", () => {
  it("has the RabbY Lens name and exactly the four approved benefits in both languages", () => {
    expect(LENS_GUIDE_EN.title).toBe("The RabbY Lens");
    expect(LENS_GUIDE_EN.heading).toBe("Made for bright days.");
    expect(LENS_GUIDE_EN.benefits.map((b) => b.title)).toEqual([
      "Less glare",
      "True colours",
      "Comfort in bright light",
      "Made for everyday",
    ]);
    expect(LENS_GUIDE_EN.benefits[0].body).toContain(
      "Bright sunlight feels softer.",
    );
    expect(LENS_GUIDE_EN.benefits[3].body).toContain(
      "Driving, sport, beach, everyday",
    );

    expect(LENS_GUIDE_BN.title).toBe("RabbY Lens");
    expect(LENS_GUIDE_BN.heading).toBe("Ujjol diner jonno banano.");
    expect(LENS_GUIDE_BN.benefits.map((b) => b.title)).toEqual([
      "Kom jholkani",
      "Asol rong",
      "Ujjol alote aram",
      "Protidin er jonno",
    ]);
  });

  it("has three demo tints — Grey, Brown, Green — with captions and preview overlays", () => {
    for (const content of [LENS_GUIDE_EN, LENS_GUIDE_BN]) {
      expect(content.tints.map((t) => t.id)).toEqual([
        "grey",
        "brown",
        "green",
      ]);
      for (const tint of content.tints) {
        expect(tint.demo).toBe(true);
        expect(tint.overlay).toContain("rgba(");
        expect(tint.caption.trim().length).toBeGreaterThan(0);
      }
    }
    expect(LENS_GUIDE_EN.tints[0].caption).toBe(
      "Neutral Grey. Colours stay truest.",
    );
    expect(LENS_GUIDE_EN.tints[1].caption).toBe(
      "Warm Brown. Softer contrast.",
    );
    expect(LENS_GUIDE_EN.tints[2].caption).toBe(
      "Green. Easy on the eyes in bright light.",
    );
  });

  it("makes no lens claim about any demo product", () => {
    const allText = [
      LENS_GUIDE_EN.intro,
      ...LENS_GUIDE_EN.benefits.map((b) => `${b.title} ${b.body}`),
      LENS_GUIDE_EN.simulatorIntro,
      LENS_GUIDE_BN.intro,
      ...LENS_GUIDE_BN.benefits.map((b) => `${b.title} ${b.body}`),
    ].join(" ");
    expect(allText).not.toMatch(/SAMPLE|UV400|UV380|99\.9%|PolarizedPlus2|Prizm/);
    expect(allText).not.toMatch(/try-on|prescription|eye exam/i);
  });
});

describe("Lens guide — English page", () => {
  it("renders the story, the four benefits, and the simulator", () => {
    render(<LensGuidePage />);

    expect(
      screen.getByRole("heading", { name: "The RabbY Lens" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Made for bright days." }),
    ).toBeInTheDocument();
    for (const title of [
      "Less glare",
      "True colours",
      "Comfort in bright light",
      "Made for everyday",
    ]) {
      expect(
        screen.getByRole("heading", { name: title }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(/built for Bangladesh sun/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Try the tints" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /bright tropical beach scene/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The three tints are demo tints/),
    ).toBeInTheDocument();
  });

  it("links to the Bangla version and to the shop", () => {
    render(<LensGuidePage />);

    expect(
      screen.getByRole("link", { name: "বাংলায় পড়ুন" }),
    ).toHaveAttribute("href", "/guide/lens/bn");
    expect(
      screen.getByRole("link", { name: "Shop sunglasses" }),
    ).toHaveAttribute("href", "/sunglasses");
  });
});

describe("Lens guide — Bangla page", () => {
  it("renders the guide in the approved Romanized Bangla, in a Bengali typeface wrapper", () => {
    const { container } = render(<LensGuideBnPage />);

    expect(
      screen.getByRole("heading", { name: "RabbY Lens" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ujjol diner jonno banano." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Bangladesh er rod er jonno banano/),
    ).toBeInTheDocument();
    for (const title of [
      "Kom jholkani",
      "Asol rong",
      "Ujjol alote aram",
      "Protidin er jonno",
    ]) {
      expect(
        screen.getByRole("heading", { name: title }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { name: "Tint gulo dekho" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Read in English" }),
    ).toHaveAttribute("href", "/guide/lens");
    expect(
      screen.getByRole("link", { name: "Sunglasses kinun" }),
    ).toHaveAttribute("href", "/sunglasses");
    // The Bengali font class is applied on the page wrapper.
    expect(container.querySelector(".mock-bengali-font")).not.toBeNull();
    expect(container.querySelector('[lang="bn"]')).not.toBeNull();
  });
});

describe("LensSimulator — tint preview (S-7, 1.x-7)", () => {
  it("starts with no tint and switches the preview when a tint is picked", () => {
    render(<LensSimulator content={LENS_GUIDE_EN} scenePhoto={SCENE} />);

    expect(screen.queryByTestId("lens-tint-overlay")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Neutral Grey\. Colours stay truest\./),
    ).not.toBeInTheDocument();

    const greyButton = screen.getByRole("button", { name: "Grey" });
    expect(greyButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(greyButton);

    const overlay = screen.getByTestId("lens-tint-overlay");
    expect(overlay.style.backgroundColor).toContain("70, 70, 70");
    expect(greyButton).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Neutral Grey. Colours stay truest."),
    ).toBeInTheDocument();
  });

  it("each tint shows its own overlay colour and caption", () => {
    render(<LensSimulator content={LENS_GUIDE_EN} scenePhoto={SCENE} />);

    fireEvent.click(screen.getByRole("button", { name: "Brown" }));
    expect(screen.getByTestId("lens-tint-overlay").style.backgroundColor).toContain(
      "122, 74, 22",
    );
    expect(
      screen.getByText("Warm Brown. Softer contrast."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Green" }));
    expect(screen.getByTestId("lens-tint-overlay").style.backgroundColor).toContain(
      "34, 92, 58",
    );
    expect(
      screen.getByText("Green. Easy on the eyes in bright light."),
    ).toBeInTheDocument();
  });

  it("No tint clears the preview and its caption", () => {
    render(<LensSimulator content={LENS_GUIDE_EN} scenePhoto={SCENE} />);

    fireEvent.click(screen.getByRole("button", { name: "Grey" }));
    expect(screen.getByTestId("lens-tint-overlay")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No tint" }));
    expect(screen.queryByTestId("lens-tint-overlay")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Neutral Grey\. Colours stay truest\./),
    ).not.toBeInTheDocument();
  });

  it("renders nothing at all when the scene photo is absent — no placeholder simulator", () => {
    const { container } = render(
      <LensSimulator content={LENS_GUIDE_EN} scenePhoto={null} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("heading", { name: "Try the tints" }),
    ).not.toBeInTheDocument();
  });
});
