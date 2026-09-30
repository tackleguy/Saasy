/**
 * Explorer constants shared by the 3D scene and the HTML overlays.
 * Kept free of Three.js so UI code can import it without pulling the WebGL
 * bundle out of its dynamic chunk.
 */
export type Quality = "high" | "low";
export type PhotoAngle = "street" | "waterfront" | "aerial" | "podium";

export const PHOTO_ANGLES: { id: PhotoAngle; label: string }[] = [
  { id: "street", label: "Street" },
  { id: "waterfront", label: "Waterfront" },
  { id: "aerial", label: "Aerial" },
  { id: "podium", label: "Podium" },
];
