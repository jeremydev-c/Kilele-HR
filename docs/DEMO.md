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

## Demo day (early December): outline, about 10 minutes

To be filled in as the modules land. Planned story: "a year in the life of Kilele Group".
1. **Hire:** a requisition is approved → job advert on the public careers page → apply → shortlist → interview scorecards → offer → hire, which turns the applicant into an employee with no retyping.
2. **Work:** new hire applies for leave → the line manager approves from *My Approvals* → HR approves → balance updates.
3. **Grow:** a manager proposes a promotion → approved → it appears on the career timeline.
4. **Leave the company:** resignation → clearance checklist across departments → exit interview → login disabled automatically.
5. **Trust:** the audit trail shows every step, plus PII reveals with reasons. Verify the chain live.
