import type { Metadata, Viewport } from "next";
import { Orbitron, Chakra_Petch, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], weight: ["500", "700", "900"] });
const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const lcd = Share_Tech_Mono({ variable: "--font-lcd", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "StrumLab",
  description: "Build a strumming pattern, set the chords, and play it against a metronome that listens back.",
};

export const viewport: Viewport = {
  themeColor: "#08040f",
  // The app is a single fixed screen; letting it zoom on a double-tap only
  // ever means accidentally zooming while tapping the transport.
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${orbitron.variable} ${chakra.variable} ${lcd.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
