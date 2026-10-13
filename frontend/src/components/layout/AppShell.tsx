import type { ReactNode } from "react";
import Link from "next/link";

import { AuthNavigation } from "../auth/AuthNavigation";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link className="flex items-center gap-2 font-bold tracking-tight" href="/"><span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-violet-700 text-sm text-white">P</span><span>PRG32 <span className="hidden font-medium text-[var(--color-text-muted)] sm:inline">Cartridge Store</span></span></Link>
          <div className="flex items-center gap-5">
            <nav aria-label="Primary navigation" className="flex max-w-full items-center gap-4 overflow-x-auto whitespace-nowrap"><Link className="text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-violet-600" href="/">Store</Link><Link className="text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-violet-600" href="/stats">Statistics</Link><Link className="text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-violet-600" href="/scores">Scores</Link><Link className="text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-violet-600" href="/docs">Docs</Link><Link className="text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-violet-600" href="/workspace">Workspace</Link><Link className="text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-violet-600" href="/publish">Publish</Link><Link className="text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-violet-600" href="/review">Review</Link></nav>
            <div className="flex items-center gap-2"><ThemeToggle /><AuthNavigation /></div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
