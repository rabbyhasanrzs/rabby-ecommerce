import type { ProductMeasurements } from "@/lib/supabase/catalog";

/**
 * Face-shape guide data (S-5, T-52) — shared by the English and
 * Bangla versions so the two pages cannot drift apart.
 *
 * FACTS ONLY:
 * - The "rated excellent" product lists come from the seed
 *   face_shape_ratings in supabase/migrations/0001_s1_catalogue.sql.
 *   Ratings exist only for Round, Square, Oval and Heart — no demo
 *   product carries an Oblong rating, so the Oblong section lists
 *   none and says so plainly instead of inventing one.
 * - The size bands are groupings of the real catalogue frame
 *   widths (126–138 mm across the 8 demo products): Narrow 126–130
 *   (SAMPLE Round A 126, SAMPLE Hexagon A 130), Medium 131–135
 *   (SAMPLE Tortoise A 131, SAMPLE Red Lens A 132, SAMPLE Blue Tint
 *   A 133), Wide 136–138 (SAMPLE Square Gold A 136, SAMPLE Aviator A
 *   138, SAMPLE Futuristic A 138). Full catalogue ranges: lens
 *   50–58 mm, bridge 14–19 mm, temple 140–145 mm, lens height
 *   40–45 mm (lens height is a DEMO value per the migration note).
 * - The example measurements are SAMPLE Round A, the product the
 *   kickoff pack names (126/50/18/44/140).
 * - Features + recommended frame shapes are general guide advice
 *   (the guide's purpose per Phase 06A §2.9), not product claims.
 */

/** Seeded measurements for sample-round-a (migration 0001). */
export const ROUND_A_MEASUREMENTS: ProductMeasurements = {
  lens_width_mm: 50,
  bridge_mm: 18,
  temple_mm: 140,
  frame_width_mm: 126,
  lens_height_mm: 44,
  face_shape_ratings: {
    Round: "fair",
    Square: "excellent",
    Oval: "excellent",
    Heart: "good",
  },
};

export interface FaceShapeEntry {
  id: string;
  name: string;
  features: string;
  recommended: string;
  /** Demo products rated "excellent" for this shape, or null when
   *  the catalogue carries no rating for the shape (Oblong). */
  catalogueBest: string[] | null;
}

export interface SizeBand {
  name: string;
  frameWidth: string;
  products: string;
}

export interface FaceShapeGuideContent {
  title: string;
  intro: string;
  howToTitle: string;
  howToBody: string;
  sizeTitle: string;
  sizeIntro: string;
  sizeNote: string;
  catalogueNote: string;
  oblongNote: string;
  shopLinkLabel: string;
  otherLangLabel: string;
  otherLangHref: string;
  bandHeader: string;
  frameWidthHeader: string;
  framesHeader: string;
  exampleLabel: string;
  shapes: FaceShapeEntry[];
  bands: SizeBand[];
  sizeRanges: { label: string; value: string }[];
}

export const FACE_SHAPE_GUIDE_EN: FaceShapeGuideContent = {
  title: "Face-shape guide",
  intro:
    "The right frame balances your face. Find your face shape below, see which frame shapes suit it, and check the size in millimetres before you buy.",
  howToTitle: "How to tell your face shape",
  howToBody:
    "Look in a mirror with your hair pulled back. Compare the width of your forehead, cheekbones and jaw, and the length of your face. A face that is about as wide as it is long with soft curves is round; a face longer than it is wide with a balanced jaw is oval; a strong jaw and broad forehead is square; a wide forehead with a narrow chin is heart-shaped; a face much longer than it is wide is oblong.",
  sizeTitle: "Size in millimetres",
  sizeIntro:
    "Every product page shows the frame's measurements in millimetres. The bands below come from the demo catalogue's real frame widths.",
  sizeNote:
    "Lens height (40–45 mm) is a demo value in the catalogue — real products must use their real measured height. Frame width is measured hinge to hinge.",
  catalogueNote:
    "“Rated excellent” means the demo catalogue rates that frame excellent for the face shape.",
  oblongNote:
    "The demo catalogue does not rate any frame for oblong faces yet, so no product is listed here.",
  shopLinkLabel: "Shop frames that suit you",
  otherLangLabel: "বাংলায় পড়ুন",
  otherLangHref: "/guide/face-shape/bn",
  bandHeader: "Band",
  frameWidthHeader: "Frame width",
  framesHeader: "Frames",
  exampleLabel: "Example",
  shapes: [
    {
      id: "round",
      name: "Round",
      features:
        "About as wide as it is long, with soft curves and full cheeks.",
      recommended:
        "Angular, square or rectangular frames — they add definition. Avoid round frames, which repeat the face's curves.",
      catalogueBest: [
        "SAMPLE Square Gold A",
        "SAMPLE Hexagon A",
        "SAMPLE Blue Tint A",
        "SAMPLE Futuristic A",
        "SAMPLE Red Lens A",
      ],
    },
    {
      id: "oval",
      name: "Oval",
      features:
        "Slightly longer than it is wide, with balanced features and a gently curved jaw.",
      recommended:
        "Most frame shapes suit an oval face. Keep the frame about as wide as the widest part of your face.",
      catalogueBest: [
        "SAMPLE Round A",
        "SAMPLE Aviator A",
        "SAMPLE Square Gold A",
        "SAMPLE Hexagon A",
        "SAMPLE Blue Tint A",
        "SAMPLE Red Lens A",
        "SAMPLE Tortoise A",
      ],
    },
    {
      id: "square",
      name: "Square",
      features:
        "A strong jaw, a broad forehead and clear angles — width and length are close.",
      recommended:
        "Round or oval frames soften the angles. Avoid square frames, which repeat them.",
      catalogueBest: [
        "SAMPLE Round A",
        "SAMPLE Aviator A",
        "SAMPLE Tortoise A",
      ],
    },
    {
      id: "heart",
      name: "Heart",
      features: "A wide forehead and cheekbones with a narrow chin.",
      recommended:
        "Round or oval frames, and frames that are wider at the bottom, balance a narrow chin.",
      catalogueBest: ["SAMPLE Aviator A"],
    },
    {
      id: "oblong",
      name: "Oblong",
      features:
        "Noticeably longer than it is wide, with a narrow forehead, cheeks and jaw.",
      recommended:
        "Wider frames make the face look less long. Avoid narrow, oblong frames, which repeat the length.",
      catalogueBest: null,
    },
  ],
  bands: [
    {
      name: "Narrow",
      frameWidth: "126–130 mm",
      products: "SAMPLE Round A (126 mm), SAMPLE Hexagon A (130 mm)",
    },
    {
      name: "Medium",
      frameWidth: "131–135 mm",
      products:
        "SAMPLE Tortoise A (131 mm), SAMPLE Red Lens A (132 mm), SAMPLE Blue Tint A (133 mm)",
    },
    {
      name: "Wide",
      frameWidth: "136–138 mm",
      products:
        "SAMPLE Square Gold A (136 mm), SAMPLE Aviator A (138 mm), SAMPLE Futuristic A (138 mm)",
    },
  ],
  sizeRanges: [
    { label: "Frame width", value: "126–138 mm" },
    { label: "Lens width", value: "50–58 mm" },
    { label: "Bridge", value: "14–19 mm" },
    { label: "Temple", value: "140–145 mm" },
    { label: "Lens height", value: "40–45 mm (demo value)" },
  ],
};

export const FACE_SHAPE_GUIDE_BN: FaceShapeGuideContent = {
  title: "মুখের আকৃতি অনুযায়ী ফ্রেম গাইড",
  intro:
    "সঠিক ফ্রেম আপনার মুখের সঙ্গে ভারসাম্য আনে। নিচে আপনার মুখের আকৃতি খুঁজুন, কোন আকৃতির ফ্রেম মানায় দেখুন, আর কেনার আগে মিলিমিটারে মাপ দেখে নিন।",
  howToTitle: "আপনার মুখের আকৃতি কেমন বুঝবেন",
  howToBody:
    "চুল পেছনে সরিয়ে আয়নায় দেখুন। কপাল, গালের হাড় আর চোয়ালের চওড়া এবং মুখের লম্বা তুলনা করুন। চওড়া আর লম্বা প্রায় সমান, নরম বাঁক থাকলে গোল; লম্বা চওড়ার চেয়ে বেশি আর ভারসাম্যপূর্ণ হলে ডিম্বাকৃতি; শক্ত চোয়াল আর চওড়া কপাল হলে চৌকো; চওড়া কপাল আর সরু চিবুক হলে হৃদয়াকৃতি; চওড়ার চেয়ে অনেক লম্বা হলে লম্বাটে।",
  sizeTitle: "মিলিমিটারে মাপ",
  sizeIntro:
    "প্রতিটি পণ্যের পাতায় ফ্রেমের মাপ মিলিমিটারে দেওয়া আছে। নিচের ভাগগুলো ডেমো ক্যাটালগের আসল ফ্রেমের চওড়া থেকে নেওয়া।",
  sizeNote:
    "লেন্সের উচ্চতা (৪০–৪৫ মিমি) ক্যাটালগে একটি ডেমো মান — আসল পণ্যে আসল মাপা উচ্চতা ব্যবহার করতে হবে। ফ্রেমের চওড়া মাপা হয় এক হিঞ্জ থেকে অন্য হিঞ্জ পর্যন্ত।",
  catalogueNote:
    "“সেরা মানানসই” মানে ডেমো ক্যাটালগ ওই ফ্রেমটিকে ওই মুখের আকৃতির জন্য সেরা বলে রেট করেছে।",
  oblongNote:
    "ডেমো ক্যাটালগে লম্বাটে মুখের জন্য এখনো কোনো ফ্রেমের রেটিং নেই, তাই এখানে কোনো পণ্যের নাম দেওয়া হয়নি।",
  shopLinkLabel: "আপনার জন্য মানানসই ফ্রেম কিনুন",
  otherLangLabel: "Read in English",
  otherLangHref: "/guide/face-shape",
  bandHeader: "ভাগ",
  frameWidthHeader: "ফ্রেমের চওড়া",
  framesHeader: "ফ্রেম",
  exampleLabel: "উদাহরণ",
  shapes: [
    {
      id: "round",
      name: "গোল (Round)",
      features: "চওড়া আর লম্বা প্রায় সমান, নরম বাঁক, ভরাট গাল।",
      recommended:
        "কৌণিক, চৌকো বা আয়তাকার ফ্রেম — মুখে সংজ্ঞা যোগ করে। গোল ফ্রেম এড়িয়ে চলুন, কারণ তা মুখের বাঁকেরই পুনরাবৃত্তি করে।",
      catalogueBest: [
        "SAMPLE Square Gold A",
        "SAMPLE Hexagon A",
        "SAMPLE Blue Tint A",
        "SAMPLE Futuristic A",
        "SAMPLE Red Lens A",
      ],
    },
    {
      id: "oval",
      name: "ডিম্বাকৃতি (Oval)",
      features:
        "লম্বা চওড়ার চেয়ে সামান্য বেশি, ভারসাম্যপূর্ণ, চোয়াল নরম বাঁকানো।",
      recommended:
        "ডিম্বাকৃতি মুখে প্রায় সব আকৃতির ফ্রেম মানায়। ফ্রেম মুখের সবচেয়ে চওড়া অংশের সমান চওড়া রাখুন।",
      catalogueBest: [
        "SAMPLE Round A",
        "SAMPLE Aviator A",
        "SAMPLE Square Gold A",
        "SAMPLE Hexagon A",
        "SAMPLE Blue Tint A",
        "SAMPLE Red Lens A",
        "SAMPLE Tortoise A",
      ],
    },
    {
      id: "square",
      name: "চৌকো (Square)",
      features:
        "শক্ত চোয়াল, চওড়া কপাল আর স্পষ্ট কোণ — চওড়া আর লম্বা কাছাকাছি।",
      recommended:
        "গোল বা ডিম্বাকৃতি ফ্রেম কোণ নরম করে। চৌকো ফ্রেম এড়িয়ে চলুন, কারণ তা কোণেরই পুনরাবৃত্তি করে।",
      catalogueBest: [
        "SAMPLE Round A",
        "SAMPLE Aviator A",
        "SAMPLE Tortoise A",
      ],
    },
    {
      id: "heart",
      name: "হৃদয়াকৃতি (Heart)",
      features: "চওড়া কপাল আর গালের হাড়, সরু চিবুক।",
      recommended:
        "গোল বা ডিম্বাকৃতি ফ্রেম, আর নিচের দিকে চওড়া ফ্রেম সরু চিবুকের ভারসাম্য আনে।",
      catalogueBest: ["SAMPLE Aviator A"],
    },
    {
      id: "oblong",
      name: "লম্বাটে (Oblong)",
      features:
        "চওড়ার চেয়ে লক্ষণীয়ভাবে লম্বা, কপাল, গাল আর চোয়াল সরু।",
      recommended:
        "চওড়া ফ্রেম মুখ কম লম্বা দেখায়। সরু, লম্বাটে ফ্রেম এড়িয়ে চলুন, কারণ তা লম্বারই পুনরাবৃত্তি করে।",
      catalogueBest: null,
    },
  ],
  bands: [
    {
      name: "সরু (Narrow)",
      frameWidth: "১২৬–১৩০ মিমি",
      products: "SAMPLE Round A (১২৬ মিমি), SAMPLE Hexagon A (১৩০ মিমি)",
    },
    {
      name: "মাঝারি (Medium)",
      frameWidth: "১৩১–১৩৫ মিমি",
      products:
        "SAMPLE Tortoise A (১৩১ মিমি), SAMPLE Red Lens A (১৩২ মিমি), SAMPLE Blue Tint A (১৩৩ মিমি)",
    },
    {
      name: "চওড়া (Wide)",
      frameWidth: "১৩৬–১৩৮ মিমি",
      products:
        "SAMPLE Square Gold A (১৩৬ মিমি), SAMPLE Aviator A (১৩৮ মিমি), SAMPLE Futuristic A (১৩৮ মিমি)",
    },
  ],
  sizeRanges: [
    { label: "ফ্রেমের চওড়া", value: "১২৬–১৩৮ মিমি" },
    { label: "লেন্সের চওড়া", value: "৫০–৫৮ মিমি" },
    { label: "ব্রিজ", value: "১৪–১৯ মিমি" },
    { label: "টেম্পল", value: "১৪০–১৪৫ মিমি" },
    { label: "লেন্সের উচ্চতা", value: "৪০–৪৫ মিমি (ডেমো মান)" },
  ],
};
