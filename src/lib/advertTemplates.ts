/**
 * Starting text for job adverts, so HR edits rather than writes from scratch.
 * Plain rules: the department decides the topic, the grade decides the level.
 */

export type DraftQuestion = {
  text: string;
  kind: "yesno" | "number";
  weight: number;
  knockout: boolean;
  target: number | null;
  knockoutBelow: number | null;
};

type DeptTemplate = {
  about: string;
  duties: string[];
  skills: string[];
  question?: DraftQuestion;
};

const TEMPLATES: Record<string, DeptTemplate> = {
  ENG: {
    about: "build and run the software our customers rely on every day",
    duties: ["Build, test and ship features with the rest of the team", "Review code and keep quality high", "Fix production issues and learn from them"],
    skills: ["Solid programming skills in a modern language", "Comfortable with Git and code review", "Clear written communication"],
    question: { text: "Have you shipped software used by real customers?", kind: "yesno", weight: 2, knockout: false, target: null, knockoutBelow: null },
  },
  FIN: {
    about: "keep Kilele's money accurate, on time and compliant",
    duties: ["Process payables, receivables and reconciliations", "Prepare monthly reports and support the month-end close", "Keep records ready for audit and KRA filings"],
    skills: ["Strong attention to detail with numbers", "Good Excel skills", "Knowledge of Kenyan tax basics (PAYE, VAT)"],
    question: { text: "Do you hold, or are you studying for, CPA (K)?", kind: "yesno", weight: 2, knockout: false, target: null, knockoutBelow: null },
  },
  HR: {
    about: "look after our people, from their first day to their last",
    duties: ["Run day-to-day HR processes: records, leave, onboarding", "Answer staff questions quickly and kindly", "Keep employee data accurate and confidential"],
    skills: ["Good knowledge of the Employment Act 2007", "Discretion with personal information", "Organised and calm under pressure"],
    question: { text: "Are you a member of IHRM?", kind: "yesno", weight: 1, knockout: false, target: null, knockoutBelow: null },
  },
  OPS: {
    about: "keep deliveries, suppliers and operations running smoothly",
    duties: ["Plan and track daily operations", "Work with suppliers and transport partners", "Spot problems early and fix them"],
    skills: ["Strong planning and follow-through", "Comfortable with spreadsheets and simple reporting", "Good with people across teams"],
    question: { text: "Do you hold a valid Kenyan driving licence?", kind: "yesno", weight: 1, knockout: false, target: null, knockoutBelow: null },
  },
  SAL: {
    about: "win and grow relationships with businesses across East Africa",
    duties: ["Find and win new customers", "Run demos and follow up until the deal is signed", "Keep the CRM up to date"],
    skills: ["Confident talking to business owners", "Organised follow-up", "Results you can show"],
    question: { text: "Do you hold a valid Kenyan driving licence?", kind: "yesno", weight: 1, knockout: true, target: null, knockoutBelow: null },
  },
  EXEC: {
    about: "support the leadership team in running the company",
    duties: ["Coordinate priorities across departments", "Prepare reports and board papers", "Follow up on decisions until they're done"],
    skills: ["Excellent organisation", "Strong writing", "Trusted with confidential information"],
  },
};

/** Grade → level wording, years of experience expected, and the minimum before it's a knock-out. */
function level(grade: string) {
  const n = Number(grade.replace(/\D/g, "")) || 3;
  if (n <= 2) return { word: "an entry-level", years: 1, min: 0 };
  if (n <= 4) return { word: "a", years: n === 3 ? 3 : 5, min: n === 3 ? 1 : 3 };
  if (n === 5) return { word: "a senior", years: 7, min: 5 };
  return { word: "a leadership", years: 10, min: 7 };
}

export function advertFromTemplate(opts: { title: string; deptCode: string; deptName: string; grade: string; justification: string }) {
  const t = TEMPLATES[opts.deptCode] ?? TEMPLATES.EXEC;
  const l = level(opts.grade);
  const summary =
    `We're hiring ${l.word} ${opts.title} to join our ${opts.deptName} team and help us ${t.about}. ` +
    opts.justification.trim();
  const questions: DraftQuestion[] = [
    { text: "Are you legally allowed to work in Kenya?", kind: "yesno", weight: 1, knockout: true, target: null, knockoutBelow: null },
    { text: "Years of relevant work experience", kind: "number", weight: 3, knockout: false, target: l.years, knockoutBelow: l.min || null },
    ...(t.question ? [t.question] : []),
    { text: "Expected monthly salary (KES)", kind: "number", weight: 0, knockout: false, target: null, knockoutBelow: null },
  ];
  return {
    summary,
    responsibilities: t.duties.map((d) => `- ${d}`).join("\n"),
    requirements: [`${l.years}+ year${l.years === 1 ? "" : "s"} of relevant experience`, ...t.skills].map((s) => `- ${s}`).join("\n"),
    questions,
    criteria: ["Skills for the role", "Problem solving", "Communication", "Team fit"],
  };
}
