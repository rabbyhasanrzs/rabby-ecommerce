/**
 * Lens guide data (S-7, 1.x-7, F16) — shared by the English and
 * Bangla versions so the two pages cannot drift apart.
 *
 * COPY — OWNER-APPROVED, DO NOT REWRITE:
 * The words below are the draft copy the owner approved on
 * 2026-11-26 ("Beach photo diye build koro"), from
 * ~/workspace/your_files/s-7-lens-story-draft.md. The lens name
 * ("RabbY Lens") and the four benefits are his approved words, in
 * plain words, not engineering jargon. The Bangla version is the
 * draft's Romanized Bangla, exactly as approved — it is how the
 * owner communicates, unlike the face-shape guide's Bengali-script
 * version. If the owner wants Bengali script here, that is his
 * edit, not a silent transliteration.
 *
 * HONESTY (from the investigation):
 * - This is the brand story — a promise about what the RabbY Lens
 *   is made for. It makes NO claim about the 8 demo products'
 *   lenses (they have no real lens specs).
 * - The three tints are labelled demo tints (demo: true) — the
 *   owner's defaults, to be replaced when RabbY's real lens range
 *   is decided. The simulator is a preview, not a product's real
 *   lens performance, and it is not tied to any product.
 * - No invented numbers: no UV percentages, no light-transmission
 *   figures, no copied claims from Maui Jim / Oakley / Warby
 *   Parker / Lunettes.
 */

export interface LensTint {
  id: string;
  name: string;
  caption: string;
  /** CSS overlay colour previewed over the scene photo for this tint. */
  overlay: string;
  /** True while the tint is one of the labelled demo defaults. */
  demo: boolean;
}

export interface LensBenefit {
  title: string;
  body: string;
}

export interface LensGuideContent {
  title: string;
  heading: string;
  intro: string;
  benefits: LensBenefit[];
  simulatorTitle: string;
  simulatorIntro: string;
  simulatorDemoNote: string;
  clearLabel: string;
  otherLangLabel: string;
  otherLangHref: string;
  shopLinkLabel: string;
  tints: LensTint[];
}

export const LENS_GUIDE_EN: LensGuideContent = {
  title: "The RabbY Lens",
  heading: "Made for bright days.",
  intro:
    "Every RabbY frame carries the RabbY Lens — built for Bangladesh sun: bright roads, beach light, and long days outside. It takes the harsh edge off the glare, so your eyes can relax, while colours stay true.",
  benefits: [
    {
      title: "Less glare",
      body: "Bright sunlight feels softer. Harsh reflections from roads and water fade into the background.",
    },
    {
      title: "True colours",
      body: "The world keeps its colours. Nothing looks washed out or unnaturally dark.",
    },
    {
      title: "Comfort in bright light",
      body: "Your eyes feel relaxed, not strained — even on long days outside.",
    },
    {
      title: "Made for everyday",
      body: "Driving, sport, beach, everyday — one lens for the way you actually live.",
    },
  ],
  simulatorTitle: "Try the tints",
  simulatorIntro:
    "See the same scene through three tints. This is a preview — the tint changes how the light looks, not the product.",
  simulatorDemoNote:
    "The three tints are demo tints — RabbY's real lens range will replace them.",
  clearLabel: "No tint",
  otherLangLabel: "বাংলায় পড়ুন",
  otherLangHref: "/guide/lens/bn",
  shopLinkLabel: "Shop sunglasses",
  tints: [
    {
      id: "grey",
      name: "Grey",
      caption: "Neutral Grey. Colours stay truest.",
      overlay: "rgba(70, 70, 70, 0.38)",
      demo: true,
    },
    {
      id: "brown",
      name: "Brown",
      caption: "Warm Brown. Softer contrast.",
      overlay: "rgba(122, 74, 22, 0.38)",
      demo: true,
    },
    {
      id: "green",
      name: "Green",
      caption: "Green. Easy on the eyes in bright light.",
      overlay: "rgba(34, 92, 58, 0.38)",
      demo: true,
    },
  ],
};

export const LENS_GUIDE_BN: LensGuideContent = {
  title: "RabbY Lens",
  heading: "Ujjol diner jonno banano.",
  intro:
    "Prottek RabbY frame e thake RabbY Lens — Bangladesh er rod er jonno banano: ujjol rasta, beach er alo, ar lomba din baire. Kora alor jholkani komay dey, jate chokh aram pay, ar rong thake asol.",
  benefits: [
    {
      title: "Kom jholkani",
      body: "Kora rod norom lage. Rasta ar panir jholkani pichone miliye jay.",
    },
    {
      title: "Asol rong",
      body: "Duniya tar rong dhore rakhe. Kichui fika ba osavabik ondhokar lage na.",
    },
    {
      title: "Ujjol alote aram",
      body: "Chokh aram pay, chap lage na — lomba din baire thakleo.",
    },
    {
      title: "Protidin er jonno",
      body: "Driving, sport, beach, everyday — tomar jiboner moto kore ekta lens.",
    },
  ],
  simulatorTitle: "Tint gulo dekho",
  simulatorIntro:
    "Ek e drishyo tin ta tint e dekho. Eta ekta preview — tint alor chehara bodlay, product na.",
  simulatorDemoNote:
    "Tin ta tint e demo tint — RabbY-r asol lens er talika ele egulo bodle jabe.",
  clearLabel: "Tint chara",
  otherLangLabel: "Read in English",
  otherLangHref: "/guide/lens",
  shopLinkLabel: "Sunglasses kinun",
  tints: [
    {
      id: "grey",
      name: "Grey",
      caption: "Neutral Grey. Rong sobcheye asol thake.",
      overlay: "rgba(70, 70, 70, 0.38)",
      demo: true,
    },
    {
      id: "brown",
      name: "Brown",
      caption: "Warm Brown. Norom contrast.",
      overlay: "rgba(122, 74, 22, 0.38)",
      demo: true,
    },
    {
      id: "green",
      name: "Green",
      caption: "Green. Ujjol alote chokhe aram.",
      overlay: "rgba(34, 92, 58, 0.38)",
      demo: true,
    },
  ],
};
