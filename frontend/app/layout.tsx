import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "MRP Traceability",
  description: "Production traceability from Sales Order to Delivery Order",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
