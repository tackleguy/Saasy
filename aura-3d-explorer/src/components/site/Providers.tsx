"use client";
/**
 * Client-side providers for the whole app.
 * MotionConfig makes every Framer Motion animation respect the OS
 * "reduce motion" setting.
 */
import { MotionConfig } from "framer-motion";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
