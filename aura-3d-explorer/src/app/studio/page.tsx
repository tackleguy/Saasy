import type { Metadata } from "next";
import StudioApp from "@/components/studio/StudioApp";
import { FLAGSHIP } from "@/content/projects";

export const metadata: Metadata = {
  title: "Studio",
  description: "AURA Studio — explore a development in live 3D, walk its interiors and underwrite it with a developer-grade yield engine.",
};

export default function StudioPage() {
  return <StudioApp project={FLAGSHIP} />;
}
