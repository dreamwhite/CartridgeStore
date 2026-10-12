import { create } from "zustand";

export type Theme = "light" | "dark";

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem("prg32-theme") === "dark" ? "dark" : "light";
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    window.localStorage.setItem("prg32-theme", theme);
    set({ theme });
  },
}));
