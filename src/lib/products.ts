type Asset = { url: string };
const files = import.meta.glob<Asset>("/src/assets/p/*.json", { eager: true, import: "default" });

function img(name: string): string {
  const key = Object.keys(files).find((k) => k.endsWith(`/${name}.jpg.asset.json`));
  return key ? files[key]!.url : "";
}

export type Category = "t-shirts" | "hoodies" | "hats" | "sweatpants" | "adventure-pants" | "rain-jackets";

export const categories: { slug: Category; name: string; image: string }[] = [
  { slug: "t-shirts", name: "T-Shirts", image: img("t-shirts_01_forest-green_mountain-lifestyle") },
  { slug: "hoodies", name: "Hoodies", image: img("hoodies_02_forest-green_lakeside") },
  { slug: "hats", name: "Hats", image: img("hats_01_forest-green_on-model") },
  { slug: "sweatpants", name: "Sweatpants", image: img("sweatpants_04_forest-green_outdoor-fit") },
  { slug: "adventure-pants", name: "Adventure Pants", image: img("adventure-pants_01_olive_rock-trail") },
  { slug: "rain-jackets", name: "Rain Jackets", image: img("rain-jackets_01_forest-green_rain-shell") },
];

export const groups: Record<string, Category[]> = {
  bottoms: ["sweatpants", "adventure-pants"],
  outerwear: ["rain-jackets", "hoodies"],
};

export type Color = { name: string; swatch: string; image: number };

export type Product = {
  slug: string;
  name: string;
  category: Category;
  price: number; // placeholder — replace with approved retail price
  colors: Color[];
  sizes: string[];
  images: string[];
  description: string;
};

const SW = {
  forest: "oklch(0.36 0.06 155)",
  cream: "oklch(0.93 0.03 90)",
  charcoal: "oklch(0.32 0.005 250)",
  black: "oklch(0.16 0 0)",
  heather: "oklch(0.68 0.005 250)",
  olive: "oklch(0.45 0.07 120)",
  stone: "oklch(0.78 0.04 80)",
  gray: "oklch(0.6 0.005 250)",
};

const apparel = ["XS", "S", "M", "L", "XL", "XXL"];

export const products: Product[] = [
  {
    slug: "essential-oversized-tee",
    name: "Essential Oversized Tee",
    category: "t-shirts",
    price: 58,
    sizes: apparel,
    images: ["01_forest-green_mountain-lifestyle", "02_cream-alpine-front", "03_charcoal-hiking-lifestyle", "04_black-lakeside-lifestyle", "05_earth-tone_studio-folded", "06_minimal-chest-mark_detail"].map((n) => img(`t-shirts_${n}`)),
    colors: [
      { name: "Forest Green", swatch: SW.forest, image: 0 },
      { name: "Cream", swatch: SW.cream, image: 1 },
      { name: "Charcoal", swatch: SW.charcoal, image: 2 },
      { name: "Black", swatch: SW.black, image: 3 },
    ],
    description: "A relaxed, oversized tee with a dropped shoulder and a single minimal chest mark. Made for trailheads, city streets, and everything in between.",
  },
  {
    slug: "essential-heavyweight-hoodie",
    name: "Essential Heavyweight Hoodie",
    category: "hoodies",
    price: 128,
    sizes: apparel,
    images: ["02_forest-green_lakeside", "01_black-alpine-portrait", "04_gray-backpack-trail", "03_cream-plain-back", "05_mixed-neutral_studio-stack", "06_charcoal-chest-mark_detail"].map((n) => img(`hoodies_${n}`)),
    colors: [
      { name: "Forest Green", swatch: SW.forest, image: 0 },
      { name: "Black", swatch: SW.black, image: 1 },
      { name: "Heather Gray", swatch: SW.heather, image: 2 },
      { name: "Cream", swatch: SW.cream, image: 3 },
    ],
    description: "A heavyweight pullover hoodie with a roomy, boxy fit and clean unprinted back. The layer you reach for on cold mornings and long drives home.",
  },
  {
    slug: "everyday-adventure-cap",
    name: "Everyday Adventure Cap",
    category: "hats",
    price: 42,
    sizes: ["One Size"],
    images: ["01_forest-green_on-model", "02_washed-black_stone-studio", "03_cream-embroidered-cap", "04_charcoal_on-model", "05_forest-green_adjustable-back", "06_earth-tone_four-color-lineup"].map((n) => img(`hats_${n}`)),
    colors: [
      { name: "Forest Green", swatch: SW.forest, image: 0 },
      { name: "Black", swatch: SW.black, image: 1 },
      { name: "Cream", swatch: SW.cream, image: 2 },
      { name: "Charcoal", swatch: SW.charcoal, image: 3 },
    ],
    description: "A low-profile six-panel cap with an adjustable back strap and a single embroidered front mark.",
  },
  {
    slug: "relaxed-essential-sweatpant",
    name: "Relaxed Essential Sweatpant",
    category: "sweatpants",
    price: 98,
    sizes: apparel,
    images: ["01_cream_front-fit", "02_black_front-fit", "03_gray_lakeside-fit", "04_forest-green_outdoor-fit", "05_cream-waistband-detail", "06_four-color-studio-lineup"].map((n) => img(`sweatpants_${n}`)),
    colors: [
      { name: "Cream", swatch: SW.cream, image: 0 },
      { name: "Black", swatch: SW.black, image: 1 },
      { name: "Heather Gray", swatch: SW.heather, image: 2 },
      { name: "Forest Green", swatch: SW.forest, image: 3 },
    ],
    description: "A relaxed, straight-leg sweatpant with an elastic drawstring waistband. Easy comfort from the cabin to the coffee run.",
  },
  {
    slug: "technical-adventure-pant",
    name: "Technical Adventure Pant",
    category: "adventure-pants",
    price: 148,
    sizes: apparel,
    images: ["01_olive_rock-trail", "02_black_technical-hiking", "03_sandstone_alpine-trail", "04_charcoal_trail-walking", "05_utility-pocket-detail", "06_water-repellent_fabric-detail"].map((n) => img(`adventure-pants_${n}`)),
    colors: [
      { name: "Olive", swatch: SW.olive, image: 0 },
      { name: "Black", swatch: SW.black, image: 1 },
      { name: "Stone", swatch: SW.stone, image: 2 },
      { name: "Charcoal", swatch: SW.charcoal, image: 3 },
    ],
    description: "A trail-ready pant with utility pockets and a clean, tapered silhouette. Built to move on rock, dirt, and pavement alike.",
  },
  {
    slug: "alpine-rain-shell",
    name: "Alpine Rain Shell",
    category: "rain-jackets",
    price: 248,
    sizes: apparel,
    images: ["01_forest-green_rain-shell", "02_black_alpine-rain-shell", "04_gray_outdoor-rain-shell", "03_cream_hooded-rain-shell", "05_four-color_studio-shells", "06_waterproof-zipper_detail"].map((n) => img(`rain-jackets_${n}`)),
    colors: [
      { name: "Forest Green", swatch: SW.forest, image: 0 },
      { name: "Black", swatch: SW.black, image: 1 },
      { name: "Gray", swatch: SW.gray, image: 2 },
      { name: "Cream", swatch: SW.cream, image: 3 },
    ],
    description: "A hooded shell with a clean, minimal profile for unpredictable weather. Light enough to pack, sharp enough to wear every day.",
  },
];

export const featuredSlugs = products.map((p) => p.slug);

export const getProduct = (slug: string) => products.find((p) => p.slug === slug);

export const formatPrice = (n: number) => `$${n.toFixed(0)}`;
