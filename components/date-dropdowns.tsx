"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = [
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
  const month = parts[1] ? String(Number(parts[1])) : ""; // "03" → "3"
  const day = parts[2] ? String(Number(parts[2])) : ""; // "05" → "5"

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
  const daysCount = getDaysInMonth(Number(year) || 2000, Number(month) || 1);
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);

  function update(y: string, m: string, d: string) {
    if (y && m && d) {
      // Clamp day if month changed
      const maxDay = getDaysInMonth(Number(y), Number(m));
      const clampedDay = Math.min(Number(d), maxDay);
      onChange(`${y}-${m.padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`);
    } else if (y || m || d) {
      // Partial — store what we have
      const py = y || "";
      const pm = m ? m.padStart(2, "0") : "";
      const pd = d ? d.padStart(2, "0") : "";
      if (py && pm && pd) onChange(`${py}-${pm}-${pd}`);
      else onChange("");
    } else {
      onChange("");
    }
  }

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      <Select value={day} onValueChange={(v) => update(year, month, v)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          {days.map((d) => (
            <SelectItem key={d} value={String(d)}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={month} onValueChange={(v) => update(year, v, day)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((name, i) => (
            <SelectItem key={i} value={String(i + 1)}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={year} onValueChange={(v) => update(v, month, day)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
