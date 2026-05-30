import type { DayOfWeek } from "@/services/ai-analyzer";

/** Maps a DayOfWeek to JS Date.getDay() index (0 = Sunday ... 6 = Saturday). */
const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Polish display labels for each day. */
export const DAY_LABELS_PL: Record<DayOfWeek, string> = {
  monday: "Poniedziałek",
  tuesday: "Wtorek",
  wednesday: "Środa",
  thursday: "Czwartek",
  friday: "Piątek",
  saturday: "Sobota",
  sunday: "Niedziela",
};

/** Ordered list of weekdays (Mon–Fri) for typical lunch menus. */
export const WEEKDAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

/**
 * Returns the ISO date (YYYY-MM-DD) of the next occurrence of the given weekday,
 * counting from `from` (defaults to today). If today matches the weekday, today is returned.
 *
 * The offer system accepts dates from today up to 30 days ahead, so this always
 * resolves to a date within the current or upcoming week.
 */
export function nextDateForDay(day: DayOfWeek, from: Date = new Date()): string {
  const target = DAY_INDEX[day];
  const current = from.getDay();
  let diff = target - current;
  if (diff < 0) diff += 7; // wrap to next week
  const result = new Date(from);
  result.setDate(from.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return toISODate(result);
}

/** Formats a Date as local YYYY-MM-DD (avoids UTC offset shifting the day). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's ISO date (local). */
export function todayISO(): string {
  return toISODate(new Date());
}

/**
 * Returns the next `count` days starting from today as { date, label } pairs.
 * Used for the day selector on the offers page so users can browse a weekly menu.
 */
export function upcomingDays(count: number = 7, from: Date = new Date()): { date: string; label: string; weekday: string }[] {
  const result: { date: string; label: string; weekday: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const iso = toISODate(d);
    const weekday = d.toLocaleDateString("pl-PL", { weekday: "short" });
    let label: string;
    if (i === 0) label = "Dziś";
    else if (i === 1) label = "Jutro";
    else label = d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
    result.push({ date: iso, label, weekday });
  }
  return result;
}
