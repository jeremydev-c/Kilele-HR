# Demo script

Short scripts for the weekly check-ins with Charles, building up to the demo day script. Before each one: `npm run db`, `npm run seed`, `npm run dev`, then open http://localhost:3000.

---

## Check-in 1 (Fri 6 Nov): Foundation, about 10 minutes

**Open with the design (2 min).** Show `docs/DESIGN.md` §2–3. Three lines to say:
1. "The UI hides buttons, but the server enforces. Every action goes through a service function that checks permissions itself."
2. "Plain roles say *what* you can do. I added **scopes** to say *to whom*: own, team, department or all. So 'approve leave' for a line manager means only his team."
3. "Everything that changes, plus every look at personal data, goes into a hash-chained audit log, like a blockchain without the mining."

**1. Login security (1 min)**
- On the login page, enter `mercy.njeri@kilele.co.ke` with a wrong password. You get a generic error that doesn't say whether the email exists.
- "Five wrong tries locks the account for 15 minutes, and every attempt is logged."

**2. Access depends on who you are (2 min)**
- Sign in as **Mercy (Employee)**. The dashboard's *Your access* table shows only `own` and `department` scopes. The menu has only Dashboard.
- Type `/admin/audit` in the address bar. You land on *No access*. "Hiding the link isn't the security; the server refused it, and that refusal is now in the audit log."

**3. Roles and the permission matrix (2 min)**
- Sign in as **Brian (Super Admin)** → *Roles & permissions* → *Line Manager*.
- Point at the matrix: rows are permissions, columns are scopes. "A role is just data. HR can make a new one without touching code." Show the custom *Payroll Officer* role as proof.
- Open *Super Admin*: it's locked. "There's always someone who can fix access, and the last Super Admin can't be removed."

**4. No privilege escalation (2 min)**
- Sign in as **Grace (HR Manager)** → *Users* → *Brian Otieno*. The manage buttons are gone and a note explains why.
- "Grace can manage accounts, but only ones whose access she could have granted herself. So HR can't lock out IT, and nobody can sneak themselves extra rights through someone else." Also: nobody can change their own roles.
- In *Users* → *New account*, roles she doesn't fully hold (Super Admin) are greyed out.

**5. Tamper-evident audit trail (2 min)**
- As Grace → *Audit trail* → **Verify chain** → green: "Chain intact".
- In a terminal, play the attacker covering their tracks:
  ```bash
  mongosh "mongodb://127.0.0.1:27027/kilele_hr?replicaSet=kilele" --eval 'db.auditlogs.updateOne({seq:2},{$set:{summary:"Signed in"}})'
  ```
- Click **Verify chain** again → red: "Tampering detected at entry #2". "Each entry's hash includes the previous one, so you can't quietly edit history." Run `npm run seed` afterwards to reset.

**Close (1 min):** "Next week: employee records. National ID, KRA PIN and bank details are encrypted in the database, masked on screen, and revealing them asks for a reason that goes into this same audit trail."

**Questions Charles might ask**

| Question | Answer |
|---|---|
| Why not put permissions in the JWT? | They'd be stale until the token expires. I reload them each request, so revoking access is instant. It's one indexed lookup. |
| How is "my team" fast for deep org charts? | Each employee stores the list of all their managers (a materialised path). "Is X in my team" is one indexed query, no recursion. |
| What if two audit writes happen at once? | The sequence number has a unique index. The second writer gets a duplicate-key error, re-reads the chain head and retries, so the chain never forks. |
| Why MongoDB? | HR records nest naturally (history, contacts, approval steps), and I run it as a replica set, so multi-document transactions work for things like "approve leave + deduct balance". |
| Could someone just call the Server Action directly? | Yes, and it would still fail: the action calls the service, the service calls `authorize()`. The UI is only a convenience. |
| Is it tested? | `npm test` covers the permission engine: every scope, the wildcard, unknown grants and the no-escalation rule. |

---

## Check-in 2 (Fri 13 Nov): People and PII, about 10 minutes

**Open (1 min):** "Same employee, four different people looking at it. Each one gets exactly the fields their job needs, and the rest never leaves the server."

**1. Same record, different eyes (4 min).** Open **Mercy Njeri**'s profile as each of these:
- **Grace (HR Manager):** everything. Personal & statutory details are *masked* (`••••723`) even for her.
- **David (Line Manager, Mercy's boss's boss):** employment and contact details, but *Personal & statutory* and *Pay* show a padlock. "That's not CSS hiding it. The server never sent it." Open DevTools → Network → the page response to prove there's no salary in it. His career-history view shows the promotion but not the salary.
- **Mercy herself:** her whole record, with *Show my details* (no reason needed for your own).
- **Peter (Auditor):** directory details only, never PII or pay.

**2. Reveal with a reason (2 min).** As Grace on Mercy's profile → *Reveal full details*. Try "abc": refused (too short). Type "Checking KRA PIN for the November PAYE return" → values appear and hide again after 60 seconds. Then *Audit trail*: the entry shows Grace's name, the time and her exact reason. "Kenya's Data Protection Act asks you to justify access. This is that, built in."

**3. Encrypted at rest (1 min).** In a terminal:
```bash
mongosh "mongodb://127.0.0.1:27027/kilele_hr?replicaSet=kilele" --eval 'db.employees.findOne({firstName:"Mercy"},{pii:1})'
```
Only `enc:v1:…` ciphertext. "If someone steals the database, they get gibberish. The key lives in the server's environment, not in the database."

**4. Search an encrypted field (1 min).** Reveal Mercy's National ID, then type it into the People search: it finds her. "I can't search ciphertext, so I keep a keyed hash of the ID, a blind index. It also stops two employees sharing an ID." As David, the same search finds nothing, because he has no PII access.

**5. Add a person, and the reporting tree (1 min).** As Grace → *Add employee* (staff number assigned automatically). As Kevin (HR Officer), point out he can add people but can't set salaries. Open *Org chart* as David: only his part of the company.

**Close:** "Next week: leave, built on one approval engine that promotions, hiring and exits will reuse."

**Questions Charles might ask**

| Question | Answer |
|---|---|
| Why mask PII even for HR? | Most HR work doesn't need the full ID number. Masking by default plus a reason to reveal means fewer casual views, and the views that happen are explained. |
| Why log *views*, not just changes? | The spec asks for "who viewed or changed". A leak usually starts with someone looking, not editing. Repeat views within 10 minutes count once so the log stays readable. |
| What if the encryption key leaks? | Rotate it: decrypt with the old key and re-encrypt with the new one (a one-off script). The `enc:v1:` prefix leaves room for a v2 format. Keys live in env or a secrets manager, never in the repo or the database. |
| How do you stop a manager changing someone's salary? | Pay is its own permission (`employee.pay:update`), changes must stay inside the grade's band, you can't change your own, and grade changes only happen via an approved promotion. |
| What's tested? | `npm test` checks the permission engine. `npm run test:db` signs in as each role against the real database and checks what comes back: scopes, masking, ID search, and that moving a manager rewrites the whole subtree. |

---

## Check-in 3 (Fri 20 Nov): Leave and the approval engine, about 10 minutes

**Open (1 min):** "Leave, promotions, hiring and exits all need approvals. I built that once, as an engine, and leave is the first thing using it." Show `LEAVE_WORKFLOW` in `src/server/services/leave.ts`: two steps, eight lines. That's all leave says about approvals.

**1. Apply (2 min).** Sign in as **Mercy** → *My leave*. Balances: 7 annual days left, with *5 carried over* from 2025. First try **9 – 30 November**: 16 working days, *only 7 available*, and the button disables. Then pick **25 – 31 December**: *4 working days · 3 left after this*, "Christmas Day not counted". "Same function in the browser and the server, so the preview can't disagree with the decision." Submit → "It's now with Collins Waweru".

**2. Routing (2 min).** Sign in as **David** → dashboard says *1 waiting for your approval* → open **Brian's** request.
- *Before you decide*: balance after this, and whether anyone else in Engineering is away then.
- Click **Reject** with no comment: refused ("the employee will see this").
- Approve with a comment → it moves to **HR**. David's *Waiting for HR* note: he holds `leave:approve@team`, the HR step needs `@all`. "Same permission, different scope, different job."

**3. HR and the trail (2 min).** Sign in as **Grace** → *Approvals* shows Brian (HR step) and Daniel (already approved by Esther). Approve Brian. The trail shows submitted → David → Grace, with times and comments. *Audit trail* → filter *Leave*.

**4. The rules people try to break (2 min).**
- Grace's own December leave is in the **CEO's** inbox, never her own: nobody approves their own request, not even a Super Admin.
- Kevin reports to Grace and Grace is HR: one click covers both steps, and the trail says so.
- Two HR people clicking *Approve* on the same request at the same moment: only one wins (`npm run test:db` proves it).

**5. Calendar and settings (1 min).** *Leave calendar*, December: who's away, weekends and holidays left blank. *Leave settings*: change annual leave to 22 and every balance updates at once ("balances are worked out fresh, never stored"). Add a gazetted holiday and the working-day counts include it.

**Questions Charles might ask**

| Question | Answer |
|---|---|
| Why not store a balance number? | A stored total drifts the moment a cancel or an edit misses an update. Working it out from the requests means it's always right, and the "why" is visible: entitlement, carry-over, adjustments, taken, pending. For one employee it's a handful of documents. |
| What stops two requests spending the same days? | Pending days count against the balance, and each application takes a per-employee lock inside a transaction. The second of two simultaneous requests sees the first. |
| What if the line manager doesn't have approval rights, or has left? | The manager step walks up the reporting line to the nearest active manager who holds `leave:approve` for this person. With nobody, it's skipped and the trail says why. |
| How will promotions reuse this? | Declare the steps, set `distinctApprovers: true` (so a manager can't approve a promotion at both steps), and register the collection in the approvals inbox. The engine, the inbox and the trail come for free. |
| Kenyan public holidays move. How do you handle that? | The fixed ones and Easter are calculated, with the Sunday→Monday rule from the Public Holidays Act. Eid and one-off gazetted days are data HR adds in Leave settings. |

---

## Check-in 4 (Fri 27 Nov): Recruitment, about 10 minutes

Before you start: `npm run seed`, then open `.demo-links.txt` (each candidate's private status link).

**Open (1 min):** "Hiring starts with an approved need and ends with an employee record. Nobody retypes the candidate's details."

**1. The request (1 min).** Sign in as **Grace** → *Approvals*: Esther's request for an Accounts Assistant ("Francis retires in February"). Approve it. "Same approval engine as leave: I only registered requisitions in the inbox."

**2. The public side (2 min).** Open http://localhost:3000/careers in a fresh window (no login). Open *Sales Executive* and apply with a test PDF. You land on your **private status page**. "The link is the key; we store only a hash of it. Candidates always know where they stand." Then mention the defences: rate limit, honeypot field, PDF checked by its bytes, one application per email, and a consent statement with a retention period (Data Protection Act).

**3. Screening (2 min).** As Grace → *Recruitment* → *Senior Frontend Engineer*. Columns by stage, sorted by score. Point at **Fatuma** (score 83 but ⚠: "Allowed to work in Kenya? No") and **Otieno** (⚠: under 2 years). "Flagged, not auto-rejected. The machine sorts, a person decides." Open Fatuma: answers, CV (*Open CV* opens a real PDF; that view is audited).

**4. Blind scorecards (2 min).** Sign in as **David** → *Recruitment* → *My interviews* → **Kipchirchir**. "1 colleague scorecard hidden until you submit yours." Submit a scorecard → now he sees Collins' scores and the averages. "If the boss speaks first, everyone agrees with the boss. This stops that." Try to submit again: refused, scorecards are final.

**5. Offer → accept → hire (2 min).**
- Open Achieng's status link from `.demo-links.txt`: *Offer accepted*, KES 165,000, starts 1 Dec. No scores or interviewer names on the candidate's side.
- As **Grace** → Achieng's application → *Hire*: only first-day details (gender, ID, KRA PIN, date of birth). Submit → you land on her **employee profile**: Senior Frontend Engineer, G4, reports to David, KES 165,000, career history "hired through APP-2026-0001". The advert is now *filled*.
- "Even Kevin, an HR Officer with no pay rights, can onboard her: the salary was approved in the offer, not typed by him."

**Questions Charles might ask**

| Question | Answer |
|---|---|
| Why not auto-reject knock-outs? | Edge cases: someone with a work permit in progress, or 1.5 years of brilliant experience. Auto-rejection silently loses them. Flagging keeps the speed and keeps a human accountable. |
| How are CVs stored? | In MongoDB GridFS: nothing extra to run, backed up with the data, works offline. PDF only, because a PDF can't carry Word macros. Every view is audited. |
| How does the candidate log in? | They don't. A long random link is their key (like a shared Google Doc). We store a SHA-256 of it, so a database leak can't recreate anyone's link. |
| What stops spam? | Per-IP rate limit, a hidden honeypot field bots fill in, one application per email per job, and a size and type check on the CV. In production I'd add a CAPTCHA and move the rate limit to Redis or MongoDB. |
| What happens to rejected candidates' data? | The consent text promises deletion after 12 months. The next step is a scheduled job that purges old applications and their CVs. |

---

## Check-in 5 (Fri 4 Dec): Promotions, exits and the dashboard, about 10 minutes

**1. Promotion (3 min).** As **David** → *Approvals*: one inbox holding a promotion *and* a leave request. Open **Mercy's promotion**, proposed by Collins. "It skipped Collins, who proposed it, and came to me, his manager." David sees no salaries: "line managers can't see pay, so they can't set it. Pay moves into the new band automatically." Approve. As **Grace**: she sees KES 145,000 → 170,000 (the G5 minimum). Approve → *Applied*. Open Mercy's profile: G5, Senior Software Engineer, new line in her career history. Also show **Victor** in *Promotions*: approved but *Scheduled* for a date next month. "The scheduled job applies it on the day."

**2. Exit (4 min).** As **Brian** → *Exits*: "Clearance for your department to sign" and *Retiring in the next 12 months* (John Maina, with *Start retirement*). Open **Patrick**: approved resignation, 6/7 cleared, "27 annual leave days unused: to be paid in the final dues". Point out that each department signs only its own items (Joseph can't sign IT's). Sign *Email and system access switched off* → "record closed, login disabled". Then sign in as `patrick.mwenda@kilele.co.ke` → "This account has been disabled."

**3. Exit interview privacy (1 min).** Grace sees Patrick's exit interview answers ("pay for logistics officers is behind the market"). Joseph, his manager, sees only that it was submitted. "If the manager could read it, nobody would be honest about the manager."

**4. Dashboard (1 min).** As Grace: headcount by department, joiners, leavers, open vacancies, exits in progress, who's away today.

---

## Demo day (early December): the full story, about 12 minutes

**The story:** a year in the life of Kilele Group: *hire → work → grow → leave*, with **trust** underneath all of it.

### Before you go on (the morning of)
- [ ] `npm run db`, `npm run seed` (shifts every demo date to *this* week), `npm run dev`. It all runs offline, so the venue Wi-Fi doesn't matter.
- [ ] Two browser windows side by side: **A** (normal) for staff, **B** (private/incognito) for the candidate and a second staff login. No signing in and out in front of the panel.
- [ ] Open `.demo-links.txt` (Achieng's status link) and a test PDF CV in a folder ready to attach.
- [ ] Browser zoom at 125%, notifications off, laptop on charge.
- [ ] Backup: screenshots of each step in a folder, in case the projector or laptop misbehaves.

### 0. Open (45 s)
"HR systems hold the most sensitive data in a company, and every action needs the right person's approval. I built Kilele HR around three ideas: **access by scope** (*what* you can do *and to whom*), **one approval engine** for leave, hiring, promotions and exits, and **everything audited**, in a log you can prove nobody has edited."

### 1. Trust first: same record, different eyes (2 min)
- **A, as Grace (HR Manager)** → Mercy's profile: everything, but ID and KRA PIN are masked. *Reveal* → asks why → type "Checking KRA PIN for PAYE" → values show for 60 s.
- **B, as David (Line Manager)** → same profile: padlocks on PII and pay. "Not hidden by CSS: the server never sent it."

### 2. Hire (3 min)
- **B** → http://localhost:3000/careers → *Sales Executive* → apply with the PDF → the private status page. "A long random link is the candidate's key; we store only its hash."
- **A, Grace** → *Recruitment* → *Senior Frontend Engineer*: candidates sorted by score, knock-outs flagged ⚠ "but a human decides". Open Achieng: two interviewers' scorecards, averages. "Interviewers can't see each other's scores until they've scored, so the boss's opinion can't anchor everyone."
- Achieng has accepted (show her status link in **B**). **A** → *Hire*: only first-day details (ID, KRA PIN, date of birth) → lands on her **employee profile**: G4, KES 165,000 from the offer, reports to David, history says "hired through APP-…". "Nobody retyped anything."

### 3. Work: leave (1.5 min)
- **B, as Mercy** → *My leave*: pick Christmas week → "4 working days · Christmas Day not counted". "Kenyan holidays, Easter and the Sunday-to-Monday rule are calculated; Eid is added by HR." Send.
- **A, as David** → *Approvals*: Mercy's leave sits next to her promotion. "One inbox for every kind of request."

### 4. Grow: promotion (1.5 min)
- **A, David** → Mercy's promotion (proposed by Collins, so it skipped Collins) → Approve. **B, Grace** → Approve → *Applied* → Mercy's profile shows G5 and the new history line. "Two different people must approve a career move, and the proposer never sees or sets the pay."

### 5. Leave the company (1.5 min)
- **A, as Brian (IT)** → *Exits* → Patrick → 6/7 cleared → sign "Email and system access switched off" → **record closed, login disabled**.
- **B** → sign in as Patrick → "This account has been disabled." "On the last day, offboarding happens by itself once every department has cleared."

### 6. Prove it (1 min)
- **A** → *Audit trail* → filter *Employees*: Grace's reveal *with her reason*, the hire, the promotion, the exit. **Verify chain** → green.
- *(If time allows: change one entry in `mongosh`, verify again → red, pointing at the exact entry.)*

### 7. Close (30 s)
"Six modules, one approval engine, field-level privacy, a tamper-evident audit log, and 44 automated tests. What I'd build next: payroll on top of this pay data, SMS notifications through Africa's Talking, and two-factor login for HR."

### Questions to expect
| Question | Short answer |
|---|---|
| Why build your own auth and not use a service? | To control and explain every part: scrypt hashes, short signed sessions, permissions reloaded on each request so revoking access is instant. In production I'd add 2FA and might use a provider for SSO. |
| How does it scale? | Every list query is filtered by scope *inside MongoDB* using indexes (e.g. `managerPath` for "my team"). Nothing loads everyone and then filters. |
| What if two people approve at once? | The save only succeeds if the step hasn't changed (`workflow.current` in the filter). The second click gets "someone else just decided". Tested. |
| What if the server is down on a promotion's effective date? | The job is idempotent and catches up on its next run. Each change is claimed once with a conditional update. |
| Is the PII really safe? | Encrypted at rest (AES-256-GCM) with keys outside the database, masked by default, revealed only with a logged reason, never sent to people without access, and every view audited. |
| How do you know it works? | 17 unit tests and 27 database tests: permissions, holidays, screening scores, approval rules, concurrency, hiring, promotions and exits. `npm test` and `npm run test:db`. |
