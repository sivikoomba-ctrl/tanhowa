"use client";

import { useState, useEffect, useRef } from "react";

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getDaysInMonth(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

interface DateDropdownsProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  minYear?: number;
  maxYear?: number;
  className?: string;
  disabled?: boolean;
  label?: string;
}

export function DateDropdowns({
  value,
  onChange,
  minYear = 1940,
  maxYear = new Date().getFullYear(),
  className = "",
  disabled = false,
}: DateDropdownsProps) {
  // Internal state preserves partial selections
  const [selYear, setSelYear] = useState("");
  const [selMonth, setSelMonth] = useState("");
  const [selDay, setSelDay] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const yearRef = useRef<HTMLSelectElement>(null);

  // Detect mobile screen for abbreviated month names
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Sync internal state from external value (on mount or when value changes externally)
  useEffect(() => {
    if (value) {
      const parts = value.split("-");
      setSelYear(parts[0] || "");
      setSelMonth(parts[1] ? String(Number(parts[1])) : "");
      setSelDay(parts[2] ? String(Number(parts[2])) : "");
    } else if (!selYear && !selMonth && !selDay) {
      // Only reset if we have no partial selections (external clear)
      setSelYear("");
      setSelMonth("");
      setSelDay("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
  const daysCount = getDaysInMonth(Number(selYear) || 2000, Number(selMonth) || 1);
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);

  function handleChange(y: string, m: string, d: string) {
    setSelYear(y);
    setSelMonth(m);
    setSelDay(d);

    if (y && m && d) {
      const maxDay = getDaysInMonth(Number(y), Number(m));
      const clampedDay = Math.min(Number(d), maxDay);
      onChange(`${y}-${m.padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`);
    }
    // Don't call onChange("") on partial — preserve what's selected
  }

  const months = isMobile ? MONTHS_SHORT : MONTHS_FULL;

  const selectBase =
    "h-10 w-full rounded-xl border border-input bg-background px-1.5 sm:px-2 text-xs sm:text-sm shadow-xs " +
    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary " +
    "disabled:cursor-not-allowed disabled:opacity-50 " +
    "appearance-none bg-no-repeat bg-[length:14px] sm:bg-[length:16px] bg-[right_4px_center] sm:bg-[right_8px_center] " +
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] " +
    "pr-5 sm:pr-7 truncate";

  const filledClass = "border-primary/30 bg-primary/[0.03]";
  const emptyClass = "text-muted-foreground";

  return (
    <div className={`grid grid-cols-3 gap-1.5 sm:gap-2 ${className}`}>
      {/* Day */}
      <div className="relative">
        <select
          value={selDay}
          onChange={(e) => handleChange(selYear, selMonth, e.target.value)}
          disabled={disabled}
          className={`${selectBase} ${selDay ? filledClass : ""}`}
          aria-label="Day"
        >
          <option value="" disabled className="text-muted-foreground">
            Day
          </option>
          {days.map((d) => (
            <option key={d} value={String(d)}>
              {d}
            </option>
          ))}
        </select>
        {!selDay && (
          <span className={`absolute left-1.5 sm:left-2 top-1/2 -translate-y-1/2 text-xs sm:text-sm pointer-events-none ${emptyClass}`}>
            Day
          </span>
        )}
      </div>

      {/* Month */}
      <div className="relative">
        <select
          value={selMonth}
          onChange={(e) => handleChange(selYear, e.target.value, selDay)}
          disabled={disabled}
          className={`${selectBase} ${selMonth ? filledClass : ""}`}
          aria-label="Month"
        >
          <option value="" disabled className="text-muted-foreground">
            Month
          </option>
          {months.map((name, i) => (
            <option key={i} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </select>
        {!selMonth && (
          <span className={`absolute left-1.5 sm:left-2 top-1/2 -translate-y-1/2 text-xs sm:text-sm pointer-events-none ${emptyClass}`}>
            Month
          </span>
        )}
      </div>

      {/* Year */}
      <div className="relative">
        <select
          ref={yearRef}
          value={selYear}
          onChange={(e) => handleChange(e.target.value, selMonth, selDay)}
          disabled={disabled}
          className={`${selectBase} ${selYear ? filledClass : ""}`}
          aria-label="Year"
        >
          <option value="" disabled className="text-muted-foreground">
            Year
          </option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        {!selYear && (
          <span className={`absolute left-1.5 sm:left-2 top-1/2 -translate-y-1/2 text-xs sm:text-sm pointer-events-none ${emptyClass}`}>
            Year
          </span>
        )}
      </div>
    </div>
  );
}
