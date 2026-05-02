import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Contabilidad Personal",
  description: "Aplicación personal de finanzas en español.",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-ES" className={cn("font-sans", geist.variable)}>
      <body className="antialiased">
        {/*
          NuqsAdapter is required for `nuqs` (`useQueryState`) to work in the
          Next 16 App Router — it bridges nuqs to Next's router. Phase 1 did not
          ship URL state; Phase 2 (Plan 02-08 nav, Plan 02-06 transactions list,
          Plan 02-05 QuickAddSheet, dashboard MonthPicker) all rely on nuqs.
          Without this adapter every `useQueryState()` call throws at first render.
        */}
        <NuqsAdapter>{children}</NuqsAdapter>
        <Toaster />
      </body>
    </html>
  );
}
