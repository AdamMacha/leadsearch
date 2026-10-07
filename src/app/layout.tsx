import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });
const sora = Sora({ subsets: ["latin", "latin-ext"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: { default: "LeadRadar · Technologio", template: "%s · LeadRadar" },
  description: "Interní nástroj Technologio pro hledání firem, které potřebují nový web.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs" className={`${inter.variable} ${sora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
