import type { ReactNode } from "react";
import Link from "next/link";

import { AuthNavigation } from "../auth/AuthNavigation";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between px-6">
          <Link className="font-bold tracking-tight" href="/">PRG32 Cartridge Store</Link>
          <AuthNavigation />
        </div>
      </header>
      {children}
    </div>
  );
}
