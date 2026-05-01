import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contabilidad Personal",
  description: "Aplicación personal de finanzas en español.",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-ES">
      <body className="antialiased">{children}</body>
    </html>
  );
}
