/**
 * AmenityIcon — lucide icon per amenity kind (see lib/amenities).
 */
import type { LucideIcon, LucideProps } from "lucide-react";
import { Baby, Clapperboard, ConciergeBell, Dumbbell, Flag, Laptop, Sofa, Sparkles, Telescope, Trees, UtensilsCrossed, WavesLadder } from "lucide-react";
import type { AmenityKind } from "@/types";

const ICONS: Record<AmenityKind, LucideIcon> = {
  "sky-lobby": ConciergeBell,
  gym: Dumbbell,
  pool: WavesLadder,
  spa: Sparkles,
  lounge: Sofa,
  cinema: Clapperboard,
  coworking: Laptop,
  kids: Baby,
  "sky-garden": Trees,
  observation: Telescope,
  dining: UtensilsCrossed,
  "golf-sim": Flag,
};

export default function AmenityIcon({ kind, ...props }: { kind: AmenityKind } & LucideProps) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden {...props} />;
}
