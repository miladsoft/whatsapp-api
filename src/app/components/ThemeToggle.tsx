"use client";

import { HiComputerDesktop } from "react-icons/hi2";
import { MdDarkMode, MdLightMode } from "react-icons/md";

import { useTheme } from "@/app/components/ThemeProvider";

export function ThemeToggle() {
  const { mode, theme, toggleTheme } = useTheme();

  const label =
    mode === "system"
      ? `System (${theme})`
      : mode === "light"
        ? "Light"
        : "Dark";

  const Icon = mode === "system" ? HiComputerDesktop : mode === "light" ? MdLightMode : MdDarkMode;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-300 bg-background text-foreground shadow-sm backdrop-blur transition-colors hover:bg-zinc-100 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
      aria-label={`Theme: ${label}. Click to switch mode`}
      title={`Theme: ${label} (click to switch)`}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}
