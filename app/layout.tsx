import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DebitMap | Know what will debit next",
  description: "A private, explainable 30-day recurring debit forecast built from financial messages.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "DebitMap | Know what will debit next",
    description: "A private, explainable 30-day recurring debit forecast.",
    images: [{ url: "/og.png", width: 1728, height: 909, alt: "DebitMap 30-day debit forecast" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geist.variable} ${geistMono.variable}`}>{children}</body></html>;
}
