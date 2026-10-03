"use client";
import { createContext, useContext } from "react";
export const PresentationContext = createContext(false);
export const usePresentation = () => useContext(PresentationContext);
export interface ModelCut { mode: "exterior" | "floor" | "core"; fraction: number }
