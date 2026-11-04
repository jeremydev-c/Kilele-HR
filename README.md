# Kilele HR

An ERP-style HR management system: access control, employee records, recruitment, leave, promotions and separation. Built by Jeremy Gachiki Nduati for the iLabAfrica (Strathmore University) coding challenge.

- **Design and decisions:** [docs/DESIGN.md](docs/DESIGN.md)
- **Demo script for check-ins and demo day:** [docs/DEMO.md](docs/DEMO.md)

> Kilele Group Ltd is a made-up company. All names, ID numbers and records in the demo data are fake.

## Status

| Milestone | Status |
|---|---|
| M0 Foundation: login, roles, scoped permissions, users, hash-chained audit trail | ✅ Done (4 Nov) |
| M1 People: employee directory and profiles, field-level PII access, reveal with reason, encryption, org chart, career history | ✅ Done (4 Nov) |
| M2 Leave and the shared approval engine: My Approvals inbox, Kenyan leave rules, live balances, team calendar | ✅ Done (4 Nov) |
| M3 Recruitment | Next (27 Nov) |
| M4 Promotions/demotions, separation, dashboard | 4 Dec |

## Run it

Needs Node.js 20+. No MongoDB install needed.

```bash
npm install
cp .env.example .env.local      # then fill in SESSION_SECRET, PII keys and DEMO_PASSWORD
```

Three terminals:

```bash
npm run db      # 1. local MongoDB on port 27027 (leave it running)
npm run seed    # 2. load the demo company (wipes the database)
npm run dev     # 3. http://localhost:3000
```

`npm run db` starts a real MongoDB replica set (so transactions work) and keeps its data in `~/.kilele-hr/mongo-data`, outside OneDrive. The first run downloads the MongoDB binary; after that it works offline. To use Atlas instead, put your Atlas string in `MONGODB_URI` and run `npm run seed -- --force`.

With `DEMO_MODE=true`, the login page lists one demo account per role. Tap one to fill the form. They all use `DEMO_PASSWORD`.

| Role | Account | What to show with it |
|---|---|---|
| Super Admin | Brian Otieno | Everything, including the Super Admin-only safeguards |
| HR Manager | Grace Wanjiru | Full HR access, but can't touch the Super Admin |
| HR Officer | Kevin Mutua | Records and leave, no salaries |
| Recruiter | Faith Achieng | Hiring only |
| Line Manager | David Kiprop | Head of Engineering: sees only his team (direct and indirect) |
| Employee | Mercy Njeri | Self-service |
| Auditor | Peter Kamau | Read-only audit trail, no PII; no employee record |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run db` | Local MongoDB |
| `npm run seed` | Wipe and load demo data (refuses non-local databases without `--force`) |
| `npm test` | Unit tests: permission engine, Kenyan holidays and working days (no database needed) |
| `npm run test:db` | Employee and leave/approval tests against the seeded local database (run `npm run seed` after) |
| `npm run typecheck` / `npm run lint` | Static checks |

## Code map

```
src/
  lib/permissions.ts      the permission catalogue and grant parsing (single source of truth)
  lib/crypto.ts           AES-256-GCM field encryption + blind index for PII
  server/context.ts       who is acting (Ctx), rebuilt from the database on every request
  server/authz.ts         can() / authorize() / scopeFilter() / canGrant(): every access decision
  server/audit.ts         hash-chained audit log: record() and verifyChain()
  server/employeeView.ts  the ONE serializer for employee records: drops or masks fields by class
  server/workflow.ts      the ONE approval engine: routing, who may decide, the inbox
  lib/leaveDays.ts        Kenyan public holidays and working-day counting (pure, shared with the browser)
  server/services/        business logic; every function takes ctx and checks permissions itself
  server/models/          Mongoose schemas
  app/                    pages (Server Components) and Server Actions
  proxy.ts                optimistic redirect to /login (not the security boundary)
scripts/                  local-db.ts, seed.ts
tests/                    *.test.ts (unit), *.db.test.ts (integration)
```

## Security notes

- Passwords: scrypt with a per-user salt. 5 failed attempts lock the account for 15 minutes. Wrong-email and wrong-password take the same time and show the same message.
- Sessions: an httpOnly, SameSite cookie with a signed JWT holding only the user id and a session version. Disabling a user or "sign out everywhere" bumps the version, which kills every old cookie at once.
- Every page and Server Action re-checks permissions on the server. Denied attempts are written to the audit trail.
- No privilege escalation: you can only assign roles, or edit grants, that you hold yourself.
- PII is encrypted at rest. Keys live in `.env.local`, never in the database. `.env*` is gitignored.
- Security headers: CSP, frame-ancestors none, nosniff, and `Cache-Control: no-store` on every page so shared computers don't cache HR data.
