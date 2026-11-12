import { JetBrains_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";

// Postslot type (docs/design-brief.md section 4): Newsreader 500 display serif for headings (one weight keeps the preload small), Schibsted Grotesk for UI and body,
// JetBrains Mono for keys, endpoints, timestamps and receipt events. No italics are loaded.
export const display = Newsreader({ subsets: ["latin"], variable: "--font-kit-display", weight: ["500"], style: ["normal"], display: "swap" });
export const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-kit-sans", weight: ["400", "500", "600"], display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-kit-mono", weight: ["400", "500"], display: "swap", preload: false });
