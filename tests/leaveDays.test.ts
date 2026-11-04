/** Kenyan public holidays and working-day counting. No database.   npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { countLeaveDays, easterSunday, kenyanHolidays, toISODate } from "@/lib/leaveDays";

const dates = (year: number) => kenyanHolidays(year).map((h) => h.date);

test("Easter and the holidays that hang off it", () => {
  assert.equal(toISODate(easterSunday(2026)), "2026-04-05");
  assert.equal(toISODate(easterSunday(2027)), "2027-03-28");
  assert.ok(dates(2026).includes("2026-04-03"), "Good Friday");
  assert.ok(dates(2026).includes("2026-04-06"), "Easter Monday");
});

test("a holiday on a Sunday is observed on the Monday", () => {
  // 1 June 2025 (Madaraka Day) was a Sunday.
  assert.ok(dates(2025).includes("2025-06-02"));
  // 2027: Jamhuri Day (12 Dec) and Boxing Day (26 Dec) are both Sundays.
  assert.ok(dates(2027).includes("2027-12-13"));
  assert.ok(dates(2027).includes("2027-12-27"));
  // A Saturday holiday is not moved (10 Oct 2026, Mazingira Day).
  assert.ok(!dates(2026).includes("2026-10-12"));
});

test("extra gazetted holidays (Eid) are included for their year only", () => {
  const h = kenyanHolidays(2026, [{ date: "2026-03-20", name: "Idd-ul-Fitr" }, { date: "2027-03-10", name: "Idd-ul-Fitr" }]);
  assert.ok(h.some((x) => x.date === "2026-03-20"));
  assert.ok(!h.some((x) => x.date.startsWith("2027")));
});

test("working days skip weekends and public holidays", () => {
  // 7–25 April 2025: 15 weekdays, minus Good Friday and Easter Monday.
  assert.equal(countLeaveDays("2025-04-07", "2025-04-25", "working", dates(2025)), 13);
  // Christmas fortnight 2026: 21–31 Dec, minus Christmas Day (Boxing Day is a Saturday).
  assert.equal(countLeaveDays("2026-12-21", "2026-12-31", "working", dates(2026)), 8);
  // A weekend alone is zero days.
  assert.equal(countLeaveDays("2026-11-07", "2026-11-08", "working", dates(2026)), 0);
});

test("calendar days count everything (maternity, paternity)", () => {
  assert.equal(countLeaveDays("2026-09-01", "2026-09-14", "calendar", dates(2026)), 14);
  assert.equal(countLeaveDays("2026-09-14", "2026-09-01", "calendar", []), 0, "end before start");
});
