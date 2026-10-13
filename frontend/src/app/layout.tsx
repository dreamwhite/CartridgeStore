import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "../components/layout/AppShell";
import { Providers } from "./providers";
import "../styles/index.css";

export const metadata: Metadata = {
  title: "PRG32 Cartridge Store",
  description: "Discover and download published PRG32 cartridges for hardware and QEMU.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
