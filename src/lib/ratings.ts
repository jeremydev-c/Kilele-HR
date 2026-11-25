/**
 * The 1–5 performance scale and the overall score. Pure, so pages, emails and
 * tests share one definition.
 */

export const RATING_LABELS: Record<number, string> = {
  1: "Below expectations",
  2: "Partly meets expectations",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};

/** The band an overall score falls in: 3.5 and above reads "Exceeds", and so on. */
export function ratingLabel(score: number | null | undefined) {
  if (score == null) return "Not rated yet";
  return RATING_LABELS[Math.min(5, Math.max(1, Math.round(score)))];
}

/** Weighted average of the ratings, to one decimal. Null until every goal is rated. */
export function overallScore(goals: { weight: number; rating: number | null | undefined }[]) {
  if (!goals.length || goals.some((g) => g.rating == null)) return null;
  const weights = goals.reduce((s, g) => s + g.weight, 0);
  if (!weights) return null;
  const total = goals.reduce((s, g) => s + g.weight * (g.rating as number), 0);
  return Math.round((total / weights) * 10) / 10;
}

export const STAGE_LABELS = {
  goals: "Manager setting goals",
  self: "Self-review",
  manager: "Manager review",
  acknowledge: "Waiting for sign-off",
  done: "Complete",
} as const;
