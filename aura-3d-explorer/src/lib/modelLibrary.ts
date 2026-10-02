import installed from "@/content/installed-models.json";

export interface LibraryModel {
  uid: string;
  name: string;
  category: string;
  path: string;
  /** Reviewed longest dimension in real metres; preserve aspect ratio. */
  sizeMeters: number;
  rotationY: number;
  url: string;
  creator: { name: string; url: string };
  license: { label: string; url: string };
  modifications: string;
}

// Only installed local files are offered to the AI. Search candidates are not assets.
export const MODEL_LIBRARY: readonly LibraryModel[] = installed;
export const libraryModel = (uid: string) => MODEL_LIBRARY.find((model) => model.uid === uid)
  ?? MODEL_LIBRARY.find((model) => model.category === uid);
export const INTERIOR_CATEGORIES = ["sofas", "chairs", "tables", "beds", "plants"];

/** Reuse the existing collision-aware planner's ensemble footprints. */
export const MODEL_SLOTS: Record<string, readonly string[]> = {
  sofas: ["living", "lounge"], chairs: ["lounge"], tables: ["dining4", "dining6"],
  beds: ["bed", "bedDouble"], plants: ["plant", "plantLarge"],
};
