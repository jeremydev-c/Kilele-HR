/**
 * Scoring screening answers. Pure, so it's easy to test and to explain:
 *
 *   yesno   "yes" = 1 point, "no" = 0
 *   number  value / target, capped at 1 (no target: any answer = 1)
 *   score   weighted average × 100, so 0–100
 *
 * Knock-outs don't hide anyone. The candidate is flagged ("doesn't meet a
 * minimum requirement") and a person still makes the call. Auto-rejecting
 * would silently throw away edge cases.
 */

export type Question = {
  key: string;
  text: string;
  kind: "yesno" | "number";
  weight: number;
  knockout: boolean;
  target: number | null;
  knockoutBelow: number | null;
};

export function scoreAnswers(questions: Question[], answers: Record<string, string>) {
  let total = 0;
  let weights = 0;
  const knockouts: string[] = [];

  for (const q of questions) {
    const raw = (answers[q.key] ?? "").trim();
    let points = 0;
    if (q.kind === "yesno") {
      points = raw === "yes" ? 1 : 0;
      if (q.knockout && raw !== "yes") knockouts.push(q.text);
    } else {
      const n = Number(raw);
      const valid = raw !== "" && Number.isFinite(n) && n >= 0;
      points = !valid ? 0 : q.target ? Math.min(n / q.target, 1) : 1;
      if (q.knockoutBelow != null && (!valid || n < q.knockoutBelow)) knockouts.push(q.text);
    }
    total += points * q.weight;
    weights += q.weight;
  }
  return { score: weights ? Math.round((total / weights) * 100) : 0, knockouts };
}
