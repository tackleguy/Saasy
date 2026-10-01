import type { Metadata } from "next";
import EngineApp from "@/components/engine/EngineApp";

export const metadata: Metadata = {
  title: "Aura Engine",
  description: "Aura Engine — turn DXF, CAD JSON or blueprint images into staged, engine-ready 3D scene JSON for React Three Fiber.",
};

export default function EnginePage() {
  return <EngineApp />;
}
