import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { inboxCount } from "@/server/services/approvals";
import { Sidebar, type NavSection } from "@/components/Sidebar";
import { logoutAction } from "../actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (ctx.mustChangePassword) redirect("/change-password");

  // The menu only shows what this person can use. (The pages and actions
  // check again on the server: hiding a link is not security.)
  const waiting = await inboxCount(ctx);
  const approver = (["leave:approve", "promotion:approve", "separation:approve", "recruitment:manage"] as const).some((p) => has(ctx, p));
  const leaveScopes = ctx.grants.get("leave:read");
  const seesOthersLeave = !!leaveScopes && [...leaveScopes].some((s) => s !== "own");

  type Item = NavSection["items"][number];
  const only = (allowed: boolean, item: Item) => (allowed ? [item] : []);
  const all: NavSection[] = [
    {
      title: "",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
        ...only(!!ctx.employee, { href: `/people/${ctx.employee?.id}`, label: "My profile", icon: "person" }),
      ],
    },
    {
      title: "People",
      items: [
        ...only(has(ctx, "employee:read"), { href: "/people", label: "Directory", icon: "people" }),
        ...only(has(ctx, "employee:read"), { href: "/org-chart", label: "Org chart", icon: "org" }),
      ],
    },
    {
      title: "Leave",
      items: [
        ...only(!!ctx.employee && has(ctx, "leave:apply"), { href: "/leave", label: "My leave", icon: "leave" }),
        ...only(approver || waiting > 0, { href: "/approvals", label: "Approvals", icon: "inbox", badge: waiting }),
        ...only(seesOthersLeave, { href: "/leave/calendar", label: "Leave calendar", icon: "calendar" }),
      ],
    },
    {
      title: "Hiring",
      items: [
        ...only(
          (["requisition:create", "recruitment:manage", "application:review", "interview:score"] as const).some((p) => has(ctx, p)),
          { href: "/recruitment", label: "Recruitment", icon: "hiring" },
        ),
      ],
    },
    {
      title: "Administration",
      items: [
        ...only(has(ctx, "leave:manage"), { href: "/admin/leave-settings", label: "Leave settings", icon: "settings" }),
        ...only(has(ctx, "user:read"), { href: "/admin/users", label: "Users", icon: "users" }),
        ...only(has(ctx, "role:manage"), { href: "/admin/roles", label: "Roles & permissions", icon: "shield" }),
        ...only(has(ctx, "audit:read"), { href: "/admin/audit", label: "Audit trail", icon: "audit" }),
      ],
    },
  ];
  const sections = all.filter((s) => s.items.length > 0);

  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[16rem_1fr]">
      <Sidebar
        sections={sections}
        user={{ name: ctx.name, email: ctx.email, roles: ctx.roleNames }}
        logout={logoutAction}
      />
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">{children}</main>
    </div>
  );
}
