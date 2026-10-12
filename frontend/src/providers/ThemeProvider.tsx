"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { useThemeStore } from "../stores/theme-store";

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return children;
}
