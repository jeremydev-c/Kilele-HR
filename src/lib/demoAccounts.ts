/** The seeded demo logins, one per role, shown on the login page when DEMO_MODE=true. */
export const DEMO_ACCOUNTS = [
  { email: "brian.otieno@kilele.co.ke", name: "Brian Otieno", role: "Super Admin", blurb: "IT systems admin. Sees and configures everything." },
  { email: "grace.wanjiru@kilele.co.ke", name: "Grace Wanjiru", role: "HR Manager", blurb: "All HR data incl. PII and pay. Final approvals." },
  { email: "kevin.mutua@kilele.co.ke", name: "Kevin Mutua", role: "HR Officer", blurb: "Employee records and leave. No salaries." },
  { email: "faith.achieng@kilele.co.ke", name: "Faith Achieng", role: "Recruiter", blurb: "Vacancies, applicants and interviews." },
  { email: "david.kiprop@kilele.co.ke", name: "David Kiprop", role: "Line Manager", blurb: "Head of Engineering. Sees and approves for his team only." },
  { email: "mercy.njeri@kilele.co.ke", name: "Mercy Njeri", role: "Employee", blurb: "Software engineer. Self-service only." },
  { email: "peter.kamau@audit.kilele.co.ke", name: "Peter Kamau", role: "Auditor", blurb: "External auditor. Read-only, no PII." },
] as const;
