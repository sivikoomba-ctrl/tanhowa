"use client";

import { useRef, useEffect } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = [
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
  /** Show month as short name (Jan) vs long (January). Default: short on mobile, long on desktop */
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
  const parts = value ? value.split("-") : [];
  const year = parts[0] || "";
  const month = parts[1] ? String(Number(parts[1])) : "";
  const day = parts[2] ? String(Number(parts[2])) : "";

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
  const daysCount = getDaysInMonth(Number(year) || 2000, Number(month) || 1);
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);

  // Refs for auto-scroll to selected value
  const yearRef = useRef<HTMLSelectElement>(null);

  // On first open, scroll year to selected value
  useEffect(() => {
    if (yearRef.current && year) {
      yearRef.current.value = year;
    }
  }, [year]);

  function update(y: string, m: string, d: string) {
    if (y && m && d) {
      const maxDay = getDaysInMonth(Number(y), Number(m));
      const clampedDay = Math.min(Number(d), maxDay);
      onChange(`${y}-${m.padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`);
    } else {
      onChange("");
    }
  }

  const selectBase =
    "h-10 w-full rounded-xl border border-input bg-background px-2 text-sm shadow-xs " +
    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary " +
    "disabled:cursor-not-allowed disabled:opacity-50 " +
    "appearance-none bg-no-repeat bg-[length:16px] bg-[right_8px_center] " +
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] " +
    "pr-7 truncate";

  const filledClass = "border-primary/30 bg-primary/[0.03]";
  const emptyClass = "text-muted-foreground";

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {/* Day */}
      <div className="relative">
        <select
          value={day}
          onChange={(e) => update(year, month, e.target.value)}
          disabled={disabled}
          className={`${selectBase} ${day ? filledClass : ""}`}
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
        {!day && (
          <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-sm pointer-events-none ${emptyClass}`}>
            Day
          </span>
        )}
      </div>

      {/* Month */}
      <div className="relative">
        <select
          value={month}
          onChange={(e) => update(year, e.target.value, day)}
          disabled={disabled}
          className={`${selectBase} ${month ? filledClass : ""}`}
          aria-label="Month"
        >
          <option value="" disabled className="text-muted-foreground">
            Month
          </option>
          {MONTHS.map((name, i) => (
            <option key={i} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </select>
        {!month && (
          <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-sm pointer-events-none ${emptyClass}`}>
            Month
          </span>
        )}
      </div>

      {/* Year */}
      <div className="relative">
        <select
          ref={yearRef}
          value={year}
          onChange={(e) => update(e.target.value, month, day)}
          disabled={disabled}
          className={`${selectBase} ${year ? filledClass : ""}`}
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
        {!year && (
          <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-sm pointer-events-none ${emptyClass}`}>
            Year
          </span>
        )}
      </div>
    </div>
  );
}
