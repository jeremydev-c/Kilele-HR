/**
 * Counting leave days, Kenyan rules. Pure functions (no database), so the
 * apply form can preview the count in the browser and the server can
 * recompute it the same way.
 *
 * All dates are calendar dates ("2026-12-21"), handled in UTC so a timezone
 * never shifts a day.
 */

export type DayCount = "working" | "calendar";

const DAY = 86_400_000;

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseISODate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export type Holiday = { date: string; name: string };

/**
 * Kenya's public holidays (Public Holidays Act, Cap. 110) for a year.
 * Fixed dates plus Easter; a holiday on a Sunday moves to the Monday.
 * Eid al-Fitr and one-off gazetted days change every year, so they're kept
 * in the database and passed in as `extra`.
 */
export function kenyanHolidays(year: number, extra: Holiday[] = []): Holiday[] {
  const fixed: [number, number, string][] = [
    [1, 1, "New Year's Day"],
    [5, 1, "Labour Day"],
    [6, 1, "Madaraka Day"],
    [10, 10, "Mazingira Day"],
    [10, 20, "Mashujaa Day"],
    [12, 12, "Jamhuri Day"],
    [12, 25, "Christmas Day"],
    [12, 26, "Boxing Day"],
  ];
  const easter = easterSunday(year);
  const list: Holiday[] = [
    ...fixed.map(([m, d, name]) => ({ date: toISODate(new Date(Date.UTC(year, m - 1, d))), name })),
    { date: toISODate(new Date(easter.getTime() - 2 * DAY)), name: "Good Friday" },
    { date: toISODate(new Date(easter.getTime() + DAY)), name: "Easter Monday" },
    ...extra.filter((h) => h.date.startsWith(String(year))),
  ];

  // Sunday holidays are observed on the next free weekday.
  const taken = new Set(list.map((h) => h.date));
  const observed: Holiday[] = [];
  for (const h of list) {
    if (parseISODate(h.date).getUTCDay() !== 0) continue;
    let next = parseISODate(h.date).getTime() + DAY;
    while (taken.has(toISODate(new Date(next))) || new Date(next).getUTCDay() === 6) next += DAY;
    const date = toISODate(new Date(next));
    taken.add(date);
    observed.push({ date, name: `${h.name} (observed)` });
  }
  return [...list, ...observed].sort((x, y) => x.date.localeCompare(y.date));
}

export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Days of leave a request uses. "working" skips weekends and public
 * holidays (annual, sick, compassionate leave); "calendar" counts every day
 * (maternity and paternity leave are set in calendar days by law).
 */
export function countLeaveDays(start: string, end: string, mode: DayCount, holidays: Iterable<string>): number {
  const s = parseISODate(start).getTime();
  const e = parseISODate(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  if (mode === "calendar") return Math.round((e - s) / DAY) + 1;
  const off = new Set(holidays);
  let n = 0;
  for (let t = s; t <= e; t += DAY) {
    const d = new Date(t);
    if (!isWeekend(d) && !off.has(toISODate(d))) n++;
  }
  return n;
}

/** Two date ranges (inclusive) overlap? */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
