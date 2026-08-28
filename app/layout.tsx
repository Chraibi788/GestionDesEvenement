import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Khedma AI",
  description: "Automatisation de devis assistée par IA pour PME B2B marocaines",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
