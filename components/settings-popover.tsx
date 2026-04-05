"use client";

import { useState, useEffect } from "react";
import { Settings, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

export function SettingsPopover() {
  const { lang, setLang, fontSize, setFontSize, t } = useLang();
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("tanhowa-theme") as "light" | "dark" | null;
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      setThemeState("dark");
    }
  }, []);

  function setTheme(t: "light" | "dark") {
    setThemeState(t);
    localStorage.setItem("tanhowa-theme", t);
    if (t === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 w-full text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-lg hover:bg-sidebar-accent/50 transition-colors"
      >
        <Settings size={16} />
        <span className="flex-1 text-left">{t("settings.title")}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-sidebar-accent/50">{lang === "ta" ? "தமிழ்" : "EN"}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 w-56 rounded-xl border bg-popover text-popover-foreground shadow-lg z-50 p-3 space-y-3">
            {/* Language Toggle */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">{t("settings.language")}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  variant={lang === "en" ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setLang("en")}
                >
                  English
                </Button>
                <Button
                  size="sm"
                  variant={lang === "ta" ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setLang("ta")}
                >
                  தமிழ்
                </Button>
              </div>
            </div>

            {/* Theme */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">{t("settings.theme")}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  variant={theme === "light" ? "default" : "outline"}
                  className="h-8 text-xs gap-1"
                  onClick={() => setTheme("light")}
                >
                  <Sun size={12} />Light
                </Button>
                <Button
                  size="sm"
                  variant={theme === "dark" ? "default" : "outline"}
                  className="h-8 text-xs gap-1"
                  onClick={() => setTheme("dark")}
                >
                  <Moon size={12} />Dark
                </Button>
              </div>
            </div>

            {/* Font Size */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">{t("settings.font_size")}</p>
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  size="sm"
                  variant={fontSize === "sm" ? "default" : "outline"}
                  className="h-8 text-[11px]"
                  onClick={() => setFontSize("sm")}
                >
                  A<span className="sr-only"> {t("settings.small")}</span>
                </Button>
                <Button
                  size="sm"
                  variant={fontSize === "md" ? "default" : "outline"}
                  className="h-8 text-sm"
                  onClick={() => setFontSize("md")}
                >
                  A<span className="sr-only"> {t("settings.medium")}</span>
                </Button>
                <Button
                  size="sm"
                  variant={fontSize === "lg" ? "default" : "outline"}
                  className="h-8 text-base"
                  onClick={() => setFontSize("lg")}
                >
                  A<span className="sr-only"> {t("settings.large")}</span>
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
