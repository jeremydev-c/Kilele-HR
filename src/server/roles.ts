/**
 * The built-in roles. `npm run seed` creates them; admins can then edit them
 * (except Super Admin) or add their own in Roles & permissions.
 */
export const SYSTEM_ROLES = [
  {
    name: "Super Admin",
    description: "Every permission. For the system administrator only.",
    grants: ["*"],
  },
  {
    name: "HR Manager",
    description: "All HR data including PII and pay. Gives the final HR approval.",
    grants: [
      "user:read", "user:manage", "role:manage", "audit:read", "email:read", "org:manage",
      "employee:read@all", "employee:create", "employee:update@all",
      "employee.contact:read@all", "employee.pii:read@all", "employee.pay:read@all", "employee.pay:update",
      "leave:apply", "leave:read@all", "leave:approve@all", "leave:manage",
      "requisition:create", "recruitment:manage", "application:review", "interview:score",
      "promotion:initiate@all", "promotion:approve@all",
      "separation:initiate@all", "separation:approve@all", "clearance:signoff",
    ],
  },
  {
    name: "HR Officer",
    description: "Day-to-day employee records and leave processing. No salaries, can't change access.",
    grants: [
      "user:read",
      "employee:read@all", "employee:create", "employee:update@all",
      "employee.contact:read@all", "employee.pii:read@all",
      "leave:apply", "leave:read@all", "leave:approve@all",
      "application:review", "interview:score",
      "separation:initiate@all", "clearance:signoff",
    ],
  },
  {
    name: "Recruiter",
    description: "Runs hiring: requisitions, vacancies, applicants, interviews and offers.",
    grants: ["employee:read@all", "requisition:create", "recruitment:manage", "application:review", "interview:score"],
  },
  {
    name: "Line Manager",
    description: "Sees and acts on their own team only: leave approval, hiring requests, promotions, exits; signs off their department's exit clearance.",
    grants: [
      "employee:read@team", "employee.contact:read@team",
      "leave:read@team", "leave:approve@team",
      "requisition:create", "interview:score",
      "promotion:initiate@team", "separation:initiate@team",
      "clearance:signoff",
    ],
  },
  {
    name: "Employee",
    description: "Self-service: own record, own leave, colleagues in the same department.",
    grants: [
      "employee:read@own", "employee:read@department",
      "employee.contact:read@own", "employee.pii:read@own", "employee.pay:read@own",
      "leave:apply", "leave:read@own",
      "separation:initiate@own",
    ],
  },
  {
    name: "Auditor",
    description: "Read-only: the audit trail, accounts, records and leave. Never PII or pay.",
    grants: ["audit:read", "user:read", "employee:read@all", "leave:read@all"],
  },
] as const;

/** An example of a custom (non-built-in) role, to show roles are data, not code. */
export const EXAMPLE_CUSTOM_ROLES = [
  {
    name: "Payroll Officer",
    description: "Reads pay and statutory numbers (KRA, NSSF, SHA, bank) for everyone, to run payroll.",
    grants: ["employee:read@all", "employee.pii:read@all", "employee.pay:read@all"],
  },
] as const;
