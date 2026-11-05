import { Geist, Geist_Mono } from "next/font/google";

// Postslot type (docs/DESIGN.md section 7): Geist 400/500/600 for UI, Geist Mono for keys, timestamps, code and the postmark.
export const sans = Geist({ subsets: ["latin"], variable: "--font-kit-sans", weight: ["400", "500", "600"], display: "swap" });
export const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-kit-mono", weight: ["400", "500"], display: "swap" });
