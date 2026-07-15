import type { Metadata } from "next";
import { DebitMapDashboard } from "./dashboard";

export const metadata: Metadata = {
  title: "DebitMap | Know what will debit next",
  description: "A private 30-day recurring debit forecast built from financial messages.",
};

export default function Home() {
  return <DebitMapDashboard />;
}

