/** Job grades with monthly basic-salary bands in KES. */
export const GRADES = [
  { code: "G1", name: "Support", min: 25_000, max: 40_000 },
  { code: "G2", name: "Assistant", min: 40_000, max: 65_000 },
  { code: "G3", name: "Officer", min: 65_000, max: 110_000 },
  { code: "G4", name: "Senior Officer", min: 110_000, max: 170_000 },
  { code: "G5", name: "Lead", min: 170_000, max: 250_000 },
  { code: "G6", name: "Manager", min: 250_000, max: 380_000 },
  { code: "G7", name: "Head", min: 380_000, max: 550_000 },
  { code: "G8", name: "Executive", min: 550_000, max: 900_000 },
] as const;

export type GradeCode = (typeof GRADES)[number]["code"];

export function gradeLabel(code: string) {
  const g = GRADES.find((x) => x.code === code);
  return g ? `${g.code} · ${g.name}` : code;
}

/** Kenya's mandatory retirement age in the public service; most private employers follow it. */
export const RETIREMENT_AGE = 60;
