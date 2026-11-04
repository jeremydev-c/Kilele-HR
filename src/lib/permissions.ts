/**
 * The permission catalogue: the single source of truth for what can be
 * granted. Roles store grants as strings:
 *
 *   "user:manage"          an unscoped permission
 *   "leave:approve@team"   a scoped permission: approve leave for my reports
 *   "*"                    every permission at every scope (Super Admin only)
 *
 * This file has no server imports, so the role editor UI can use it too.
 */

export const SCOPES = ["own", "team", "department", "all"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  own: "Own record",
  team: "My team (everyone reporting to me)",
  department: "My department",
  all: "Everyone",
};

type PermissionDef = {
  key: string;
  group: string;
  label: string;
  /** Scoped permissions say *whose* records the holder can act on. */
  scoped: boolean;
};

export const PERMISSIONS = [
  // Access control
  { key: "user:read", group: "Access control", label: "View user accounts", scoped: false },
  { key: "user:manage", group: "Access control", label: "Create, lock, disable accounts and assign roles", scoped: false },
  { key: "role:manage", group: "Access control", label: "Create and edit roles and their permissions", scoped: false },
  { key: "audit:read", group: "Access control", label: "View the audit trail", scoped: false },

  // Organisation and employees
  { key: "org:manage", group: "Employees", label: "Manage departments and job grades", scoped: false },
  { key: "employee:read", group: "Employees", label: "View employee directory details", scoped: true },
  { key: "employee:create", group: "Employees", label: "Add new employees", scoped: false },
  { key: "employee:update", group: "Employees", label: "Edit employee details", scoped: true },
  { key: "employee.contact:read", group: "Employees", label: "View contact details and next of kin", scoped: true },
  { key: "employee.pii:read", group: "Employees", label: "View PII (National ID, KRA PIN, NSSF, SHA, bank)", scoped: true },
  { key: "employee.pay:read", group: "Employees", label: "View salary and pay history", scoped: true },
  { key: "employee.pay:update", group: "Employees", label: "Change salary outside a promotion", scoped: false },

  // Leave
  { key: "leave:apply", group: "Leave", label: "Apply for own leave", scoped: false },
  { key: "leave:read", group: "Leave", label: "View leave requests and balances", scoped: true },
  { key: "leave:approve", group: "Leave", label: "Approve or reject leave", scoped: true },
  { key: "leave:manage", group: "Leave", label: "Manage leave types and adjust balances", scoped: false },

  // Recruitment
  { key: "requisition:create", group: "Recruitment", label: "Request a new hire (job requisition)", scoped: false },
  { key: "recruitment:manage", group: "Recruitment", label: "Approve requisitions, publish vacancies, make offers", scoped: false },
  { key: "application:review", group: "Recruitment", label: "Review and shortlist applications", scoped: false },
  { key: "interview:score", group: "Recruitment", label: "Sit on interview panels and score candidates", scoped: false },

  // Promotions and demotions
  { key: "promotion:initiate", group: "Promotions", label: "Propose a promotion or demotion", scoped: true },
  { key: "promotion:approve", group: "Promotions", label: "Approve promotions and demotions", scoped: true },

  // Separation
  { key: "separation:initiate", group: "Separation", label: "Start a resignation, retirement or termination", scoped: true },
  { key: "separation:approve", group: "Separation", label: "Approve separations", scoped: true },
  { key: "clearance:signoff", group: "Separation", label: "Sign off exit clearance for own department", scoped: false },
] as const satisfies readonly PermissionDef[];

export type Permission = (typeof PERMISSIONS)[number]["key"];

const BY_KEY = new Map<string, PermissionDef>(PERMISSIONS.map((p) => [p.key, p]));

export function isScoped(perm: Permission): boolean {
  return BY_KEY.get(perm)?.scoped ?? false;
}

export const WILDCARD = "*";

export type Grant = { perm: Permission; scope: Scope };

/** Parse "leave:approve@team". Returns null for anything not in the catalogue. */
export function parseGrant(raw: string): Grant | null {
  const [key, scope] = raw.split("@");
  const def = BY_KEY.get(key);
  if (!def) return null;
  if (!def.scoped) return scope === undefined ? { perm: def.key as Permission, scope: "all" } : null;
  if (!SCOPES.includes(scope as Scope)) return null;
  return { perm: def.key as Permission, scope: scope as Scope };
}

export function formatGrant(g: Grant): string {
  return isScoped(g.perm) ? `${g.perm}@${g.scope}` : g.perm;
}

/** Effective permissions: for each permission, the scopes held. Unscoped ones hold "all". */
export type GrantMap = Map<Permission, Set<Scope>>;

export function buildGrantMap(grants: Iterable<string>): GrantMap {
  const map: GrantMap = new Map();
  for (const raw of grants) {
    if (raw === WILDCARD) {
      for (const p of PERMISSIONS) map.set(p.key, new Set(SCOPES));
      continue;
    }
    const g = parseGrant(raw);
    if (!g) continue; // unknown grants (e.g. a removed permission) are ignored, never trusted
    if (!map.has(g.perm)) map.set(g.perm, new Set());
    map.get(g.perm)!.add(g.scope);
  }
  return map;
}

/** Every grant string that exists, in catalogue order (used for the role matrix). */
export function allGrantStrings(): string[] {
  return PERMISSIONS.flatMap((p) => (p.scoped ? SCOPES.map((s) => `${p.key}@${s}`) : [p.key]));
}

export function groupedPermissions() {
  const groups = new Map<string, PermissionDef[]>();
  for (const p of PERMISSIONS) {
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group)!.push(p);
  }
  return [...groups.entries()].map(([group, perms]) => ({ group, perms }));
}

export function permissionLabel(perm: string): string {
  return BY_KEY.get(perm)?.label ?? perm;
}
