import type { Metadata, Viewport } from "next";
import { Bagel_Fat_One, Archivo, DM_Mono } from "next/font/google";
import { PrivacyNotice } from "@/components/ui/PrivacyNotice";
import "./globals.css";

/**
 * Bagel Fat One is the inflated display face the chrome treatment needs — the
 * metal gradient only reads as metal on very fat, very round glyphs. Archivo
 * carries everything else, and DM Mono the numerals, where tabular figures
 * stop the tempo readout jittering as it counts.
 */
const bagel = Bagel_Fat_One({ variable: "--font-bagel", subsets: ["latin"], weight: "400" });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const mono = DM_Mono({ variable: "--font-mono-num", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "StrumLab",
  description: "Build a strumming pattern, set the chords, and play it against a metronome that listens back.",
};

export const viewport: Viewport = {
  themeColor: "#0b0a0c",
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bagel.variable} ${archivo.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <PrivacyNotice />
      </body>
    </html>
  );
}
