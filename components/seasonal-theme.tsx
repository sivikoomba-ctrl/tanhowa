"use client";

import { useEffect } from "react";

/**
 * Seasonal theme rotation for TANHOWA based on Tamil Nadu seasons/festivals.
 *
 * Jan-Feb: Pongal Gold — warm amber tones
 * Mar-Apr: Spring Teal — fresh cyan/teal
 * May-Jun: Summer Emerald — vibrant green
 * Jul-Sep: Monsoon Blue — cool blue tones
 * Oct-Nov: Festival Purple — festive magenta/purple
 * Dec: Winter Forest — deep green (original theme)
 */

interface SeasonalTheme {
  name: string;
  primary: string;
  primaryFg: string;
  secondary: string;
  secondaryFg: string;
  accent: string;
  accentFg: string;
  ring: string;
  sidebar: string;
  sidebarFg: string;
  sidebarPrimary: string;
  sidebarPrimaryFg: string;
  sidebarAccent: string;
  sidebarAccentFg: string;
  sidebarBorder: string;
  sidebarRing: string;
  border: string;
  input: string;
  muted: string;
  mutedFg: string;
  chart1: string;
  chart2: string;
  chart3: string;
}

const themes: Record<string, SeasonalTheme> = {
  pongal: {
    name: "Pongal Gold",
    primary: "oklch(0.50 0.14 55)",
    primaryFg: "oklch(0.98 0.01 55)",
    secondary: "oklch(0.72 0.12 85)",
    secondaryFg: "oklch(0.2 0.02 50)",
    accent: "oklch(0.60 0.18 30)",
    accentFg: "oklch(0.98 0.01 55)",
    ring: "oklch(0.50 0.14 55)",
    sidebar: "oklch(0.30 0.08 55)",
    sidebarFg: "oklch(0.95 0.02 55)",
    sidebarPrimary: "oklch(0.78 0.12 85)",
    sidebarPrimaryFg: "oklch(0.2 0.04 55)",
    sidebarAccent: "oklch(0.35 0.08 55)",
    sidebarAccentFg: "oklch(0.95 0.02 55)",
    sidebarBorder: "oklch(0.35 0.06 55)",
    sidebarRing: "oklch(0.55 0.12 55)",
    border: "oklch(0.88 0.04 55)",
    input: "oklch(0.88 0.04 55)",
    muted: "oklch(0.94 0.02 55)",
    mutedFg: "oklch(0.55 0.03 55)",
    chart1: "oklch(0.50 0.14 55)",
    chart2: "oklch(0.60 0.18 30)",
    chart3: "oklch(0.72 0.12 85)",
  },
  spring: {
    name: "Spring Teal",
    primary: "oklch(0.48 0.12 195)",
    primaryFg: "oklch(0.98 0.01 195)",
    secondary: "oklch(0.70 0.10 165)",
    secondaryFg: "oklch(0.2 0.02 195)",
    accent: "oklch(0.62 0.15 145)",
    accentFg: "oklch(0.98 0.01 195)",
    ring: "oklch(0.48 0.12 195)",
    sidebar: "oklch(0.28 0.08 195)",
    sidebarFg: "oklch(0.95 0.02 195)",
    sidebarPrimary: "oklch(0.75 0.12 165)",
    sidebarPrimaryFg: "oklch(0.2 0.04 195)",
    sidebarAccent: "oklch(0.33 0.08 195)",
    sidebarAccentFg: "oklch(0.95 0.02 195)",
    sidebarBorder: "oklch(0.33 0.06 195)",
    sidebarRing: "oklch(0.52 0.12 195)",
    border: "oklch(0.88 0.03 195)",
    input: "oklch(0.88 0.03 195)",
    muted: "oklch(0.94 0.02 195)",
    mutedFg: "oklch(0.55 0.03 195)",
    chart1: "oklch(0.48 0.12 195)",
    chart2: "oklch(0.62 0.15 145)",
    chart3: "oklch(0.70 0.10 165)",
  },
  summer: {
    name: "Summer Emerald",
    primary: "oklch(0.45 0.15 155)",
    primaryFg: "oklch(0.98 0.01 95)",
    secondary: "oklch(0.72 0.14 55)",
    secondaryFg: "oklch(0.2 0.02 50)",
    accent: "oklch(0.65 0.18 40)",
    accentFg: "oklch(0.98 0.01 95)",
    ring: "oklch(0.45 0.15 155)",
    sidebar: "oklch(0.3 0.1 155)",
    sidebarFg: "oklch(0.95 0.02 130)",
    sidebarPrimary: "oklch(0.78 0.15 85)",
    sidebarPrimaryFg: "oklch(0.2 0.04 150)",
    sidebarAccent: "oklch(0.35 0.1 155)",
    sidebarAccentFg: "oklch(0.95 0.02 130)",
    sidebarBorder: "oklch(0.35 0.08 155)",
    sidebarRing: "oklch(0.55 0.15 155)",
    border: "oklch(0.88 0.04 140)",
    input: "oklch(0.88 0.04 140)",
    muted: "oklch(0.94 0.02 130)",
    mutedFg: "oklch(0.55 0.03 150)",
    chart1: "oklch(0.45 0.15 155)",
    chart2: "oklch(0.65 0.18 40)",
    chart3: "oklch(0.72 0.14 55)",
  },
  monsoon: {
    name: "Monsoon Blue",
    primary: "oklch(0.45 0.14 240)",
    primaryFg: "oklch(0.98 0.01 240)",
    secondary: "oklch(0.68 0.10 210)",
    secondaryFg: "oklch(0.2 0.02 240)",
    accent: "oklch(0.58 0.16 260)",
    accentFg: "oklch(0.98 0.01 240)",
    ring: "oklch(0.45 0.14 240)",
    sidebar: "oklch(0.25 0.08 240)",
    sidebarFg: "oklch(0.95 0.02 240)",
    sidebarPrimary: "oklch(0.72 0.10 210)",
    sidebarPrimaryFg: "oklch(0.2 0.04 240)",
    sidebarAccent: "oklch(0.30 0.08 240)",
    sidebarAccentFg: "oklch(0.95 0.02 240)",
    sidebarBorder: "oklch(0.30 0.06 240)",
    sidebarRing: "oklch(0.50 0.12 240)",
    border: "oklch(0.88 0.03 230)",
    input: "oklch(0.88 0.03 230)",
    muted: "oklch(0.94 0.02 230)",
    mutedFg: "oklch(0.55 0.03 240)",
    chart1: "oklch(0.45 0.14 240)",
    chart2: "oklch(0.58 0.16 260)",
    chart3: "oklch(0.68 0.10 210)",
  },
  festival: {
    name: "Festival Purple",
    primary: "oklch(0.48 0.18 310)",
    primaryFg: "oklch(0.98 0.01 310)",
    secondary: "oklch(0.70 0.12 340)",
    secondaryFg: "oklch(0.2 0.02 310)",
    accent: "oklch(0.60 0.20 350)",
    accentFg: "oklch(0.98 0.01 310)",
    ring: "oklch(0.48 0.18 310)",
    sidebar: "oklch(0.25 0.10 310)",
    sidebarFg: "oklch(0.95 0.02 310)",
    sidebarPrimary: "oklch(0.75 0.12 340)",
    sidebarPrimaryFg: "oklch(0.2 0.04 310)",
    sidebarAccent: "oklch(0.30 0.10 310)",
    sidebarAccentFg: "oklch(0.95 0.02 310)",
    sidebarBorder: "oklch(0.30 0.08 310)",
    sidebarRing: "oklch(0.52 0.15 310)",
    border: "oklch(0.88 0.04 310)",
    input: "oklch(0.88 0.04 310)",
    muted: "oklch(0.94 0.02 310)",
    mutedFg: "oklch(0.55 0.03 310)",
    chart1: "oklch(0.48 0.18 310)",
    chart2: "oklch(0.60 0.20 350)",
    chart3: "oklch(0.70 0.12 340)",
  },
  winter: {
    name: "Winter Forest",
    primary: "oklch(0.40 0.12 160)",
    primaryFg: "oklch(0.98 0.01 160)",
    secondary: "oklch(0.65 0.10 180)",
    secondaryFg: "oklch(0.2 0.02 160)",
    accent: "oklch(0.55 0.14 140)",
    accentFg: "oklch(0.98 0.01 160)",
    ring: "oklch(0.40 0.12 160)",
    sidebar: "oklch(0.22 0.08 160)",
    sidebarFg: "oklch(0.95 0.02 160)",
    sidebarPrimary: "oklch(0.70 0.10 180)",
    sidebarPrimaryFg: "oklch(0.2 0.04 160)",
    sidebarAccent: "oklch(0.28 0.08 160)",
    sidebarAccentFg: "oklch(0.95 0.02 160)",
    sidebarBorder: "oklch(0.28 0.06 160)",
    sidebarRing: "oklch(0.45 0.10 160)",
    border: "oklch(0.88 0.03 160)",
    input: "oklch(0.88 0.03 160)",
    muted: "oklch(0.94 0.02 160)",
    mutedFg: "oklch(0.55 0.03 160)",
    chart1: "oklch(0.40 0.12 160)",
    chart2: "oklch(0.55 0.14 140)",
    chart3: "oklch(0.65 0.10 180)",
  },
};

function getSeasonalTheme(): SeasonalTheme {
  const month = new Date().getMonth(); // 0-11
  if (month <= 1) return themes.pongal;       // Jan-Feb
  if (month <= 3) return themes.spring;       // Mar-Apr
  if (month <= 5) return themes.summer;       // May-Jun
  if (month <= 8) return themes.monsoon;      // Jul-Sep
  if (month <= 10) return themes.festival;    // Oct-Nov
  return themes.winter;                        // Dec
}

export function SeasonalTheme() {
  useEffect(() => {
    const theme = getSeasonalTheme();
    const root = document.documentElement;

    root.style.setProperty("--primary", theme.primary);
    root.style.setProperty("--primary-foreground", theme.primaryFg);
    root.style.setProperty("--secondary", theme.secondary);
    root.style.setProperty("--secondary-foreground", theme.secondaryFg);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-foreground", theme.accentFg);
    root.style.setProperty("--ring", theme.ring);
    root.style.setProperty("--sidebar", theme.sidebar);
    root.style.setProperty("--sidebar-foreground", theme.sidebarFg);
    root.style.setProperty("--sidebar-primary", theme.sidebarPrimary);
    root.style.setProperty("--sidebar-primary-foreground", theme.sidebarPrimaryFg);
    root.style.setProperty("--sidebar-accent", theme.sidebarAccent);
    root.style.setProperty("--sidebar-accent-foreground", theme.sidebarAccentFg);
    root.style.setProperty("--sidebar-border", theme.sidebarBorder);
    root.style.setProperty("--sidebar-ring", theme.sidebarRing);
    root.style.setProperty("--border", theme.border);
    root.style.setProperty("--input", theme.input);
    root.style.setProperty("--muted", theme.muted);
    root.style.setProperty("--muted-foreground", theme.mutedFg);
    root.style.setProperty("--chart-1", theme.chart1);
    root.style.setProperty("--chart-2", theme.chart2);
    root.style.setProperty("--chart-3", theme.chart3);
  }, []);

  return null;
}

export function getThemeName(): string {
  return getSeasonalTheme().name;
}
