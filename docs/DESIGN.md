# Kilele HR: design

A web-based, ERP-style HR management system built for the iLabAfrica (Strathmore University) coding challenge set by Charles Wambugu on 4 Nov 2026.

> **Kilele Group Ltd** is a made-up Nairobi company used for the demo data. "Kilele" means "peak" in Swahili.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript | One codebase for UI and server. Server Components read data straight from the database, so no API layer to keep in sync. |
| Styling | Tailwind CSS 4 + lucide-react icons | Quick to build, consistent look. |
| Database | MongoDB + Mongoose 9 | HR records nest naturally (history, contacts, approval steps). Runs on a replica set, so multi-document transactions work. |
| Validation | zod 4 | One schema validates each form on the server and gives typed data. |
| Auth | Own implementation: scrypt password hashes, signed JWT (jose) in an httpOnly cookie | Small, fully explainable, no third-party login service. |
| Local DB | `mongodb-memory-server` replica set, saved to `.mongo-data/` | `npm run db` gives a real MongoDB with no install and no internet, so demo day works even if the Wi-Fi doesn't. Atlas works by changing `MONGODB_URI`. |

## 2. Architecture: three rules

```
Browser ─► Page (Server Component) ─► service function(ctx, input) ─► Mongoose model ─► MongoDB
       └─► Form ─► Server Action ───┘          │
                                               ├─ authorize(ctx, permission, target)
                                               ├─ zod validation
                                               └─ audit.record(...)
```

1. **The UI hides, the server enforces.** Buttons are hidden when you lack a permission, but every read and write goes through a service function in `src/server/services/` that checks permissions itself. Calling a Server Action by hand doesn't get around this.
2. **Every service function takes `ctx`** (who is acting: user, employee record, effective permissions). No hidden globals, so each function is easy to test and audit.
3. **Permissions are never trusted from the cookie.** The cookie holds only the user id and a session version. Roles and permissions are reloaded from the database on every request, so disabling an account or removing a role takes effect immediately.

## 3. Access control: roles plus granular, scoped permissions

### Permissions
A permission is `resource:action`, defined once in `src/lib/permissions.ts`, which is the single source of truth. Examples:

| Area | Permissions |
|---|---|
| Users and roles | `user:read`, `user:manage`, `role:manage` |
| Audit | `audit:read` |
| Employees | `employee:read`, `employee:create`, `employee:update`, `employee.contact:read`, `employee.pii:read`, `employee.pay:read` |
| Organisation | `org:manage` (departments, job grades) |
| Leave | `leave:apply`, `leave:read`, `leave:approve`, `leave:manage` |
| Recruitment | `recruitment:manage`, `application:review`, `interview:score` |
| Movements | `promotion:initiate`, `promotion:approve` |
| Separation | `separation:initiate`, `separation:approve`, `clearance:signoff` |

### Scopes: the "smarter" part
Plain RBAC says *what* you can do. HR also needs to say *to whom*. A line manager can approve leave for their own team, not the whole company. So scoped permissions carry a scope:

| Scope | Covers |
|---|---|
| `own` | Only your own employee record |
| `team` | Everyone who reports to you, directly or indirectly |
| `department` | Everyone in your department |
| `all` | Everyone |

A grant is written `leave:approve@team`. One check, `can(ctx, "leave:approve", employee)`, handles all four scopes. For lists, `scopeFilter(ctx, "employee:read")` turns the same grants into a MongoDB filter, so a manager's employee list query only ever *fetches* their team. It isn't fetched and then hidden.

"Everyone below me" has to be fast, so each employee stores a **materialised path** of their managers (`managerPath: [ceo, cto, teamLead]`). "Is X in my team?" becomes the single indexed query `{ managerPath: myId }`. Changing someone's manager rewrites the path for them and everyone under them.

### Roles
A role is a named bundle of grants, stored in the database and editable by admins through a permission matrix. A user can hold several roles, and their effective permissions are the union. Seeded roles:

| Role | Gist |
|---|---|
| Super Admin | Everything. Can't be deleted. Only a Super Admin can make another one. |
| HR Manager | All HR data including PII and pay; final approvals |
| HR Officer | Employee data and leave processing; no pay; can't edit roles |
| Recruiter | Job requisitions, vacancies, applicants, interviews |
| Line Manager | Team-scoped read, leave approval, initiates promotions and separations |
| Employee | Own record, own leave, self-service |
| Auditor | Read-only audit log and records, no PII |

### Built-in safeguards (separation of duties)
- Nobody approves their own request: the workflow engine refuses it even for a Super Admin.
- You can't grant permissions you don't have yourself, so no privilege escalation via the role editor.
- The last Super Admin can't be disabled or demoted.
- Accounts lock for 15 minutes after 5 failed logins. New accounts get a temporary password that must be changed at first login.

## 4. Employee records and PII protection

### Data classes
Each employee field belongs to a sensitivity class, and each class has a read permission:

| Class | Fields | Needed to see it |
|---|---|---|
| Directory | name, staff no., job title, department, work email, manager, photo | `employee:read` (scoped) |
| Contact | personal phone and email, home address, next of kin, emergency contact | `employee.contact:read` |
| PII | National ID, KRA PIN, NSSF no., SHA no., date of birth, bank details | `employee.pii:read` |
| Pay | basic salary, job grade, pay history | `employee.pay:read` |

Seeing your own record is not a special case in code: the Employee role grants `employee.contact:read@own`, `employee.pii:read@own` and `employee.pay:read@own`, so it shows up in the permission matrix like everything else.

### How it's enforced
1. **One serializer.** Every employee record leaving the server goes through `toEmployeeView(record, ctx)`, which drops or masks fields by class. A masked National ID shows as `••••4821`.
2. **Reveal with a reason.** Even with PII access, sensitive fields start masked. Clicking *Reveal* asks for a reason ("Preparing NSSF returns") and logs it to the audit trail. This follows the Kenya Data Protection Act 2019 principle of purpose limitation: you can show *why* each person viewed each record.
3. **Encrypted at rest.** National ID, KRA PIN, NSSF, SHA, date of birth and bank account are encrypted with AES-256-GCM before they reach MongoDB, so a leaked database dump shows ciphertext. The key comes from the environment, never the database.
4. **Blind index.** Encrypted values can't be searched or kept unique, so we also store an HMAC of the National ID. This catches duplicate IDs and allows exact-match search without decrypting anything. Typing an 8-digit number in the directory search finds that person, but only for users with PII access.
5. **Who looked at what.** Opening someone's profile logs which classes you were shown ("directory, contact, PII (masked), pay"). Opening the PII edit form counts as a view too, because it prefills the real values. Repeat views of the same record within 10 minutes count once, so refreshes don't bury the trail. Reveals with a reason are always logged.
6. **Edits need both rights.** Editing contact details needs `employee:update` *and* `employee.contact:read` for that person, and PII edits need `employee.pii:read`. You can't change what you can't see. Audit entries for contact, PII and pay changes name the fields but never copy the values.
7. **Pay separately.** An HR Officer can add a new hire but not set their salary: the grade's starting pay is used. Salary changes need `employee.pay:update`, must stay inside the grade's band, and can't be made to your own pay. Grade changes only happen through an approved promotion or demotion (M4).

### Employment history as events
Hires, promotions, demotions, transfers, manager changes, salary changes and separations are each saved as an **effective-dated employment event**. The employee's current title, grade and department are a snapshot of the latest event. So the career timeline on the profile is always complete, and nothing is overwritten. Salary figures in the timeline are hidden from anyone without pay access to that person.

### Changing someone's manager
The new `managerPath` is the new manager's path plus the new manager. Everyone below the person inherits it, all in one transaction. Making someone report to a person who is below them would create a loop, so it's refused.

## 5. One approval engine for every module

Leave, promotions/demotions, job requisitions and separations all need "submit → someone approves → maybe someone else approves". Instead of writing that four times, there's **one workflow engine** (`src/server/workflow.ts`). Each request type declares its steps:

```ts
leave:      [ manager, hr(leave:approve) ]
promotion:  [ manager, hr(promotion:approve) ]
requisition:[ hr(recruitment:manage) ]
separation: [ manager, hr(separation:approve) ]   // then clearance
```

```mermaid
stateDiagram-v2
  [*] --> Pending: submit
  Pending --> Pending: approve (more steps left)
  Pending --> Approved: approve (last step)
  Pending --> Rejected: reject
  Pending --> Cancelled: requester cancels
  Approved --> [*]
  Rejected --> [*]
```

- A "manager" step goes to the subject's line manager. If there's no manager (e.g. the CEO), it's skipped.
- A "permission" step goes to anyone holding that permission with a scope covering the subject.
- Each decision is saved on the request (who, when, comment) and in the audit log.
- One **My Approvals** inbox lists everything waiting for you, across all modules.
- When the last step approves, the module's `onApproved` hook runs, e.g. deduct leave days or write the promotion's employment event.

## 6. Modules

| # | Module | What it does |
|---|---|---|
| 1 | **Access control** | Users, roles, permission matrix with scopes, account lock and unlock, forced password change, session revocation |
| 2 | **Employee records** | Directory with search and filters, profile tabs (overview, contact, PII, pay, history, documents), create and edit wizard, org chart |
| 3 | **Recruitment** | Job requisition (approved) → vacancy → public careers page → online application with CV → knockout questions and scoring → shortlist → interview panel scorecards → offer → **hire converts the applicant into an employee**, no retyping |
| 4 | **Leave** | Kenyan Employment Act defaults: annual 21 days, maternity 90 days, paternity 14 days, sick leave, compassionate leave. Counts working days only (skips weekends and Kenyan public holidays), blocks overlapping requests, shows live balances, team leave calendar |
| 5 | **Promotions and demotions** | Manager proposes new title, grade and salary with a justification → approval → employment event on the effective date |
| 6 | **Separation** | Retirement, resignation, termination. Upcoming retirements flagged (age 60). Approval → clearance checklist where each department signs off (IT gets the laptop back, Finance settles dues) → exit interview → on completion the login is disabled automatically |
| + | **Audit trail** | Every change and every PII view, hash-chained so tampering shows up |
| + | **Dashboard** | Headcount, leave today, open vacancies, pending approvals, upcoming retirements |

## 7. Audit trail

Every write, every PII reveal, every sign-in (and failed sign-in) and every refused attempt (`access.denied`) appends an entry: who, what, which record, which fields changed, the reason, IP address, and time. Changed **values** of PII fields are never copied into the log, only the field names, so the log doesn't become a second copy of the sensitive data.

Entries are **hash-chained**, the same idea as the E-ELECTIONS ballot ledger: each entry stores `hash = SHA-256(previous hash + entry contents)`. The *Verify chain* button recomputes the chain and points to the first entry that was edited or deleted. A unique index on the sequence number stops two simultaneous writes from forking the chain.

## 8. Data model (collections)

| Collection | Key fields |
|---|---|
| `users` | email, passwordHash, roleIds[], extraGrants[], employeeId?, status, sessionVersion, failedLogins, lockedUntil, mustChangePassword |
| `roles` | name, description, grants[] (e.g. `leave:approve@team`), system |
| `departments` | name, code, headId |
| `employees` | staffNo, names, workEmail, jobTitle, grade (G1–G8, salary bands in `lib/grades.ts`), departmentId, managerId, managerPath[], status, hireDate, contact{}, pii{ encrypted }, nationalIdHash, pay{}, retirementDate |
| `employmentEvents` | employeeId, type (hire/promotion/demotion/transfer/salary/separation), effectiveDate, from{}, to{}, requestId |
| `leaveTypes` | code, name, daysPerYear, paid, gender rule, needs attachment |
| `leaveRequests` | employeeId, type, start, end, days, reason, workflow{} |
| `requisitions`, `vacancies`, `applications`, `interviews` | recruitment pipeline |
| `movementRequests` | employeeId, kind (promotion/demotion), from{}, to{}, justification, workflow{} |
| `separations` | employeeId, kind, lastDay, workflow{}, clearance[], exitInterview{} |
| `auditLogs` | seq (unique), at, actor, action, entity, entityId, changes[], reason, ip, prevHash, hash |

## 9. Milestones to demo day

Weekly check-ins with Charles (proposed Fri 5pm). Each milestone ends with the app running on seeded demo data.

| Check-in | Milestone | Shows |
|---|---|---|
| Fri 6 Nov | **M0: Foundation** ✅ built 4 Nov | This design, login, roles, permission matrix, users, audit log with hash chain |
| Fri 13 Nov | **M1: People** ✅ built 4 Nov | Employee directory, profiles, PII masking and reveal, encryption at rest, org chart, employment history |
| Fri 20 Nov | **M2: Leave and approvals** | Workflow engine, My Approvals inbox, leave types, balances, calendar |
| Fri 27 Nov | **M3: Recruitment** | Requisition → careers page → apply → shortlist → interview → hire |
| Fri 4 Dec | **M4: Movements and exits** | Promotions/demotions, separation with clearance and exit interview, dashboard, polish, demo script rehearsal |
| Early Dec | **Demo day at Strathmore** | 10-minute live demo (`docs/DEMO.md`) |

## 10. Out of scope (would come next)
Payroll calculation (PAYE, NSSF, SHIF, Housing Levy), email and SMS notifications, two-factor login, performance reviews, a mobile app. The auth, audit and encryption pieces are reusable for the second challenge, the Whistleblower Protection App.
