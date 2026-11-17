"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "neet-cbt-theme";

export type ThemeMode = "light" | "dark";

export function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* private mode */
  }
  return "light";
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#0b1220" : "#1e4d7b");
}

type Props = {
  className?: string;
  /** Compact icon-only control for exam header */
  compact?: boolean;
};

export function ThemeToggle({ className = "", compact = false }: Props) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = document.documentElement.classList.contains("dark")
      ? "dark"
      : readStoredTheme();
    applyTheme(current);
    setMode(current);
    setReady(true);
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    applyTheme(next);
    setMode(next);
  }

  const label = mode === "dark" ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        className ||
        (compact
          ? "cbt-btn cbt-btn-sm cbt-btn-ghost-toolbar"
          : "theme-toggle")
      }
      aria-label={label}
      title={label}
      data-theme={mode}
      suppressHydrationWarning
    >
      {!ready ? (
        <span aria-hidden>◐</span>
      ) : mode === "dark" ? (
        <>
          <span aria-hidden>☀</span>
          {!compact && <span>Light</span>}
        </>
      ) : (
        <>
          <span aria-hidden>☾</span>
          {!compact && <span>Dark</span>}
        </>
      )}
    </button>
  );
}
