"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import translations, { type TranslationKey, type Lang } from "./translations";

type FontSize = "sm" | "md" | "lg";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

const FONT_CLASSES: Record<FontSize, string> = {
  sm: "font-size-sm",
  md: "font-size-md",
  lg: "font-size-lg",
};

// Storage can be null (not just throw) in privacy-hardened browsers (e.g. Firefox
// with dom.storage.enabled=false) — guard every access instead of assuming it exists.
function safeGetItem(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Storage unavailable — setting is best-effort, state still updates in memory
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [fontSize, setFontSizeState] = useState<FontSize>("md");

  // Load from localStorage on mount
  useEffect(() => {
    const savedLang = safeGetItem("tanhowa-lang") as Lang | null;
    const savedSize = safeGetItem("tanhowa-font-size") as FontSize | null;
    if (savedLang === "en" || savedLang === "ta") setLangState(savedLang);
    if (savedSize === "sm" || savedSize === "md" || savedSize === "lg") setFontSizeState(savedSize);
  }, []);

  // Apply font size to <html>
  useEffect(() => {
    const root = document.documentElement;
    Object.values(FONT_CLASSES).forEach((cls) => root.classList.remove(cls));
    root.classList.add(FONT_CLASSES[fontSize]);
  }, [fontSize]);

  // Apply lang attribute to <html>
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    safeSetItem("tanhowa-lang", newLang);
  }, []);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    safeSetItem("tanhowa-font-size", size);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const entry = translations[key as TranslationKey];
    if (!entry) return key;
    let text: string = entry[lang] || entry.en || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, fontSize, setFontSize, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx.t;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
