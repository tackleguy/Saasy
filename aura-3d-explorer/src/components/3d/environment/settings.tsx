"use client";
import { createContext, useContext } from "react";
export type SunPreset = "dawn" | "golden" | "dusk" | "night";
export type Tier = "high" | "medium" | "low";
export const SUN = {
  dawn: { label: "Dawn", elevation: 9, azimuth: 105, intensity: 2.2, color: "#FFD0AE", fill: 0.65, env: 0.7, turbidity: 5, rayleigh: 2.8, night: 0, haze: "#252b39" },
  golden: { label: "Golden Hour", elevation: 22, azimuth: 155, intensity: 3.5, color: "#FFD9A8", fill: 0.7, env: 0.85, turbidity: 4, rayleigh: 1.7, night: 0, haze: "#202631" },
  dusk: { label: "Dusk", elevation: 2, azimuth: 220, intensity: 0.65, color: "#FFAF83", fill: 0.38, env: 0.48, turbidity: 8, rayleigh: 3.8, night: 0.5, haze: "#171d2c" },
  night: { label: "Night", elevation: -12, azimuth: 250, intensity: 0.09, color: "#9EB7D9", fill: 0.22, env: 0.25, turbidity: 3, rayleigh: 0.2, night: 1, haze: "#090e18" },
} as const;
export const CinematicContext = createContext<{time: SunPreset; tier: Tier; legacy: boolean}>({time:"golden",tier:"high",legacy:false});
export const useCinematic = () => useContext(CinematicContext);
