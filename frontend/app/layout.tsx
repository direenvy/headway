import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Serrif Condensed and Saans Variable are licensed faces. Instrument Serif is
// the condensed editorial serif on Google Fonts closest to the display voice;
// DM Sans is a geometric variable sans whose wght axis reaches every weight
// the system uses (300, 380, 400, 500, 570).
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400" });
const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Headway — fourteen days of ridership, forecast and scored",
  description: "A 14-day forecast for every Malaysian rail and bus line in Turnstile's checked data, backtested over 52 weeks against the seasonal naive, with the days it loses on named.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
