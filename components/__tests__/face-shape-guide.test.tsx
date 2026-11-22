import FaceShapeGuideBnPage from "@/app/guide/face-shape/bn/page";
import FaceShapeGuidePage from "@/app/guide/face-shape/page";
import FaceShapeGuideContent from "@/components/face-shape-guide-content";
import {
  FACE_SHAPE_GUIDE_BN,
  FACE_SHAPE_GUIDE_EN,
  ROUND_A_MEASUREMENTS,
} from "@/lib/face-shape-guide";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/font/google only runs inside a Next build; in Vitest the font
// module is stubbed so the page can render. The Bengali text itself
// is asserted, not the font loader.
vi.mock("@/lib/fonts", () => ({
  notoSansBengali: { className: "mock-bengali-font", variable: "--font-bengali" },
}));

describe("Face-shape guide — English (S-5, T-52)", () => {
  it("renders all five face shapes with features and recommendations", async () => {
    render(await FaceShapeGuidePage());

    expect(
      screen.getByRole("heading", { name: "Face-shape guide" }),
    ).toBeInTheDocument();
    for (const shape of ["Round", "Oval", "Square", "Heart", "Oblong"]) {
      expect(
        screen.getByRole("heading", { name: shape }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(/Angular, square or rectangular frames/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Most frame shapes suit an oval face/),
    ).toBeInTheDocument();
  });

  it("shows the real SAMPLE Round A measurements in the diagram", async () => {
    render(await FaceShapeGuidePage());

    expect(
      screen.getByRole("img", {
        name: /frame width 126 mm, lens 50 mm, bridge 18 mm, lens height 44 mm, temple 140 mm/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Frame width 126 mm")).toBeInTheDocument();
  });

  it("shows size bands derived from the catalogue frame widths", () => {
    render(
      <FaceShapeGuideContent
        content={FACE_SHAPE_GUIDE_EN}
        measurements={ROUND_A_MEASUREMENTS}
        exampleName="SAMPLE Round A"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Size in millimetres" }),
    ).toBeInTheDocument();
    expect(screen.getByText("126–130 mm")).toBeInTheDocument();
    expect(screen.getByText("131–135 mm")).toBeInTheDocument();
    expect(screen.getByText("136–138 mm")).toBeInTheDocument();
    expect(
      screen.getByText(/SAMPLE Round A \(126 mm\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Lens width: 50–58 mm/)).toBeInTheDocument();
  });

  it("says plainly that no frame is rated for oblong faces", () => {
    render(
      <FaceShapeGuideContent
        content={FACE_SHAPE_GUIDE_EN}
        measurements={ROUND_A_MEASUREMENTS}
        exampleName="SAMPLE Round A"
      />,
    );

    expect(
      screen.getByText(/does not rate any frame for oblong faces yet/),
    ).toBeInTheDocument();
  });

  it("links to the Bangla version and to the shop", () => {
    render(
      <FaceShapeGuideContent
        content={FACE_SHAPE_GUIDE_EN}
        measurements={ROUND_A_MEASUREMENTS}
        exampleName="SAMPLE Round A"
      />,
    );

    expect(
      screen.getByRole("link", { name: "বাংলায় পড়ুন" }),
    ).toHaveAttribute("href", "/guide/face-shape/bn");
    expect(
      screen.getByRole("link", { name: "Shop frames that suit you" }),
    ).toHaveAttribute("href", "/sunglasses");
  });
});

describe("Face-shape guide — Bangla (S-5, T-52)", () => {
  it("renders the guide in Bengali, in a Bengali typeface wrapper", async () => {
    const { container } = render(await FaceShapeGuideBnPage());

    expect(
      screen.getByRole("heading", {
        name: "মুখের আকৃতি অনুযায়ী ফ্রেম গাইড",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/সঠিক ফ্রেম আপনার মুখের সঙ্গে ভারসাম্য আনে/),
    ).toBeInTheDocument();
    for (const shape of [
      "গোল (Round)",
      "ডিম্বাকৃতি (Oval)",
      "চৌকো (Square)",
      "হৃদয়াকৃতি (Heart)",
      "লম্বাটে (Oblong)",
    ]) {
      expect(
        screen.getByRole("heading", { name: shape }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: "Read in English" }),
    ).toHaveAttribute("href", "/guide/face-shape");
    expect(
      screen.getByRole("link", {
        name: "আপনার জন্য মানানসই ফ্রেম কিনুন",
      }),
    ).toHaveAttribute("href", "/sunglasses");
    // The Bengali font class is applied on the page wrapper.
    expect(container.querySelector(".mock-bengali-font")).not.toBeNull();
    expect(container.querySelector('[lang="bn"]')).not.toBeNull();
  });

  it("renders Bengali content directly with the shared component", () => {
    render(
      <FaceShapeGuideContent
        content={FACE_SHAPE_GUIDE_BN}
        measurements={ROUND_A_MEASUREMENTS}
        exampleName="SAMPLE Round A"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "মিলিমিটারে মাপ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ডেমো ক্যাটালগে লম্বাটে মুখের জন্য এখনো কোনো ফ্রেমের রেটিং নেই/),
    ).toBeInTheDocument();
  });
});
