"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";
type ThemeMode = Theme | "system";

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "wappapi-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") {
    return saved;
  }

  return "system";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredThemeMode());
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme());

  const theme = mode === "system" ? systemTheme : mode;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateFromSystem = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", updateFromSystem);

    return () => {
      mediaQuery.removeEventListener("change", updateFromSystem);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      setMode,
      toggleTheme: () => {
        setMode((current) => {
          if (current === "system") return "light";
          if (current === "light") return "dark";
          return "system";
        });
      },
    }),
    [theme, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
