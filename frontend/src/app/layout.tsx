import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "../components/layout/AppShell";
import { PwaRegistration } from "../components/pwa/PwaRegistration";
import { Providers } from "./providers";
import "../styles/index.css";

export const metadata: Metadata = {
  title: "PRG32 Cartridge Store",
  description: "Discover and download published PRG32 cartridges for hardware and QEMU.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/static/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/static/icon-512.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <PwaRegistration /><AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
