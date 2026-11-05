# Kilele HR

**The whole life of a job in one calm system:** hire, onboard, work, grow and leave, with access control and privacy built in from the first line.

**Live demo: [kilele-hr.vercel.app](https://kilele-hr.vercel.app)**. Tap any demo account on the sign-in page to explore as that role.

Built by **Jeremy Gachiki Nduati** for the iLabAfrica (Strathmore University) HR management challenge.

> Kilele Group Ltd is a made-up company. All names, ID numbers and records in the demo data are fake.

- **Design and decisions:** [docs/DESIGN.md](docs/DESIGN.md)
- **Demo-day script:** [docs/DEMO.md](docs/DEMO.md)

---

## What it does

| Area | Highlights |
|---|---|
| **Public website** | Company page, live open jobs, a careers site, and a private status page for every applicant |
| **Access control** | Roles built from scoped permissions (`own`, `team`, `department`, `all`). The menu, pages and every server action follow them. Admins edit roles without touching code |
| **People** | Directory, org chart and career history. Personal data (National ID, KRA PIN, bank) is encrypted, masked, and revealed only with a logged reason |
| **Leave** | Kenyan public holidays (Sunday → Monday rule), working-day counting, live balances, and a "who's away" calendar |
| **Approvals** | One shared engine for leave, hiring, promotions and exits. It routes each request to the nearest manager who may decide, then HR. No self-approval, and two people clicking at once can't both win |
| **Hiring** | Request → approve → **pre-filled advert** → apply with a PDF CV → automatic screening score → shortlist → interviews with **blind scorecards** → offer → hire, with nothing retyped. A filled job leaves the website by itself |
| **Workforce planning** | Suggests a replacement when someone resigns or nears retirement, and never suggests the same person twice |
| **Promotions** | Two-person approval, pay kept inside the grade band, takes effect on its date |
| **Exits** | Resignation, retirement or termination → department clearance checklists → an exit interview only HR sees → login disabled on the last day |
| **Email** | Through Resend: applicants hear at every stage, approvers when it's their turn, requesters when it's decided. Staff also get a copy at their personal email. HR can open, filter and resend every email |
| **Announcements** | HR messages the whole company, and managers their team, by department or by person. Meetings get a time and place. Each person gets it in the app and by email, with "seen by 12 of 20" for the sender |
| **Audit trail** | Every action, sign-in and denied attempt, in a SHA-256 hash chain: edit or delete one entry and **Verify chain** says so |

## Engineering decisions worth a look

- **One permission engine, everywhere.** `can()`, `authorize()` and `scopeFilter()` decide every access. A list query only ever fetches rows you may see, and hiding a button is never the security.
- **One serializer for personal data.** Every employee record leaves the server through `toEmployeeView`, which drops or masks fields by class. A new page can't leak PII by accident.
- **Field-level encryption with a blind index.** National IDs are AES-256-GCM encrypted, yet still searchable through an HMAC index without decrypting anything.
- **Balances are computed, never stored,** so they can't drift out of sync.
- **Every email is saved before it's sent.** If the email service fails, the approval or hire still completes, and the email waits to be resent.
- **Time zones done right.** Dates and times are Nairobi time on any server (Vercel runs on UTC), and impossible dates like 30 February are refused.
- **Tests can't touch real data.** Database tests run on their own `kilele_hr_test` database.

## Security

- **Passwords:** scrypt with a per-user salt. Five failed attempts lock the account for 15 minutes, and wrong-email and wrong-password answers look the same.
- **Sessions:** an httpOnly, SameSite, Secure cookie holding a signed JWT with only the user id and a session version. "Sign out everywhere" and disabling an account end every old session at once.
- **Server-side checks everywhere:** every page and server action re-checks permission, and denied attempts go to the audit trail. No privilege escalation: you can only grant what you hold yourself.
- **Data at rest:** personal data is encrypted, and the keys live in environment variables, never in the database or the repo.
- **Headers:** CSP, HSTS, `X-Frame-Options: DENY`, nosniff, a tight Permissions-Policy, and `Cache-Control: no-store` so shared computers don't keep HR pages.
- **Applicant forms:** PDF CVs are checked by their content, not their name; rate limits; a honeypot field; private status links stored hashed.
- **Email:** everything a person typed is escaped; email previews are sandboxed; made-up demo and test addresses are never sent to.
- **Background jobs:** the scheduled job needs a secret, compared in constant time.

## Tests

**74 automated tests.** 34 are fast unit tests: permissions, Kenyan holidays and working days, screening scores, advert templates, email contents and escaping, delivery rules, IP masking. The other 40 run against a real MongoDB: employees and PII, leave and approvals, recruitment end to end, promotions, exits, emails, announcements.

```bash
npm test          # unit tests, no database
npm run test:db   # seeds kilele_hr_test, then runs the database tests
```

## Run it locally

Needs Node.js 20+. No MongoDB install needed.

```bash
npm install
cp .env.example .env.local      # then fill in the secrets (see below)
```

Then, in three terminals:

```bash
npm run db      # 1. a local MongoDB replica set on port 27027 (leave it running)
npm run seed    # 2. load the demo company (WIPES the local database)
npm run dev     # 3. http://localhost:3000
```

With `DEMO_MODE=true`, the sign-in page lists one demo account per role. They all use `DEMO_PASSWORD`.

| Role | Account | Shows |
|---|---|---|
| Super Admin | Brian Otieno | Everything |
| HR Manager | Grace Wanjiru | All HR, pay and personal data, final approvals, emails, announcements |
| HR Officer | Kevin Mutua | Records and leave, no salaries |
| Recruiter | Faith Achieng | Hiring only |
| Line Manager | David Kiprop | His own team only |
| Employee | Mercy Njeri | Self-service |
| Auditor | Peter Kamau | Read-only audit trail, never personal data |

## Deploy (Vercel + MongoDB Atlas + Resend)

1. Create a MongoDB Atlas database and allow access from `0.0.0.0/0` (Vercel's addresses change).
2. Import the repository into Vercel and add the environment variables below.
3. Load the demo data into Atlas from your machine: put the same settings in `.env.production.local`, then run `npm run seed:prod`.
4. Vercel Cron runs the daily job (`vercel.json`).

| Variable | What it's for |
|---|---|
| `MONGODB_URI` | Database connection |
| `SESSION_SECRET` | Signs session cookies (32+ random characters) |
| `PII_KEY`, `PII_INDEX_KEY` | Encrypt personal data and its search index (32+ characters each; never change them later) |
| `DEMO_MODE`, `DEMO_PASSWORD` | One-tap demo accounts. **Turn off for real data** |
| `CRON_SECRET` | Protects the scheduled job |
| `RESEND_API_KEY` | Turns email sending on (`RESEND_API` also works) |
| `EMAIL_FROM` | Sender on a domain verified in Resend, e.g. `Kilele HR <hr@your-domain.com>` |
| `APP_URL` | Optional: the site address for email links (worked out automatically on Vercel) |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `npm run build` | Develop / production build |
| `npm run db` | Local MongoDB (data kept in `~/.kilele-hr/mongo-data`) |
| `npm run seed` | Wipe and load the demo company, dates shifted to this week |
| `npm run seed:prod` | The same, into the database in `.env.production.local` |
| `npm test` / `npm run test:db` | Unit / database tests |
| `npm run typecheck` / `npm run lint` | Static checks |

## Code map

```
src/
  app/                      pages (Server Components) and Server Actions
    careers/                public careers site and applicants' private status pages
    (app)/                  the signed-in app: home, approvals, people, leave, hiring,
                            promotions, exits, announcements, admin (users, roles, emails, audit)
  lib/permissions.ts        the permission catalogue: the single source of truth
  lib/crypto.ts             AES-256-GCM field encryption and the blind index
  lib/leaveDays.ts          Kenyan public holidays and working days (pure)
  server/context.ts         who is acting, rebuilt from the database on every request
  server/authz.ts           can() / authorize() / scopeFilter() / canGrant()
  server/audit.ts           the hash-chained audit trail
  server/employeeView.ts    the one serializer for employee records
  server/workflow.ts        the one approval engine
  server/email/             sending (Resend), templates, and who gets what
  server/services/          business logic; every function checks permission itself
  server/models/            Mongoose schemas
  server/jobs.ts            the scheduled job (promotions taking effect, exits closing)
scripts/                    local-db.ts, seed.ts
tests/                      *.test.ts (unit), *.db.test.ts (database)
```

## Known limits

- **Rate limits** (sign-in and applications) are counted per server instance; at scale they'd move to a shared store.
- **Demo mode** lets anyone sign in as any role, including Super Admin. That's right for a demo, wrong for real data.
- **Payroll** (PAYE, NSSF, SHA deductions) is out of scope.
