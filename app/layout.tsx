import type { Metadata, Viewport } from "next";
import { Inter, Poppins, DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

// Each font exposes a CSS variable. brand.ts points --font-sans at the one the gym picked.
const inter   = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });
const dmSans  = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Psync",
  description: "Gym management for Indian gyms",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} ${dmSans.variable} ${manrope.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
