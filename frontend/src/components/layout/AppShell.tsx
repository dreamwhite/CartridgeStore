import type { ReactNode } from "react";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">{children}</div>;
}
