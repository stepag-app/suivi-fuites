import { DM_Sans, Figtree, Geist, Geist_Mono, Inter, Noto_Sans } from "next/font/google";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const fontVars = [geist, geistMono, inter, notoSans, figtree, dmSans].map((f) => f.variable).join(" ");

export const fontOptions = [
  { key: "geist", label: "Geist" },
  { key: "inter", label: "Inter" },
  { key: "notoSans", label: "Noto Sans" },
  { key: "figtree", label: "Figtree" },
  { key: "dmSans", label: "DM Sans" },
  { key: "geistMono", label: "Geist Mono" },
] as const;

export const fontKeys = fontOptions.map((f) => f.key);
export type FontKey = (typeof fontKeys)[number];
