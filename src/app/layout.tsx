import type { Metadata } from "next";
import { Inter, DM_Serif_Display, JetBrains_Mono, Caveat, Dancing_Script, Great_Vibes } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Script fonts for the TYPED e-signature flow (/sign/[token]). Only the signing page references
// these via CSS family names, so the bundle weight is mostly opportunistic — browsers won't
// download them until a `font-family: Caveat` rule actually matches an element.
const caveat = Caveat({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-caveat", display: "swap" });
const dancingScript = Dancing_Script({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dancing-script", display: "swap" });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: ["400"], variable: "--font-great-vibes", display: "swap" });

export const metadata: Metadata = {
  title: "Foundry by Gitwork",
  description:
    "Gitwork’s prompt-to-production delivery platform for projects, signals, documents, reviews, and support.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSerifDisplay.variable} ${jetbrainsMono.variable} ${caveat.variable} ${dancingScript.variable} ${greatVibes.variable}`}
    >
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
