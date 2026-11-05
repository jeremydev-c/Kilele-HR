import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { inboxCount } from "@/server/services/approvals";
import { unreadAnnouncements } from "@/server/services/announcements";
import { Sidebar, type NavSection } from "@/components/Sidebar";
import { logoutAction } from "../actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (ctx.mustChangePassword) redirect("/change-password");

  // The menu only shows what this person can use. (The pages and actions
  // check again on the server: hiding a link is not security.)
  const [waiting, unread] = await Promise.all([inboxCount(ctx), unreadAnnouncements(ctx)]);
  const approver = (["leave:approve", "promotion:approve", "separation:approve", "recruitment:manage"] as const).some((p) => has(ctx, p));
  const leaveScopes = ctx.grants.get("leave:read");
  const seesOthersLeave = !!leaveScopes && [...leaveScopes].some((s) => s !== "own");
  // Everyone may resign (separation:initiate@own, via "Resign" on their profile); the Exits menu is for people who handle others' exits.
  const exitScopes = ctx.grants.get("separation:initiate");
  const managesExits = !!exitScopes && [...exitScopes].some((s) => s !== "own");

  type Item = NavSection["items"][number];
  const only = (allowed: boolean, item: Item) => (allowed ? [item] : []);
  // Your own things first, then the company, then admin.
  const all: NavSection[] = [
    {
      title: "",
      items: [
        { href: "/dashboard", label: "Home", icon: "home" },
        ...only(approver || waiting > 0, { href: "/approvals", label: "Approvals", icon: "inbox", badge: waiting }),
        ...only(!!ctx.employee || has(ctx, "announcement:send"), { href: "/announcements", label: "Announcements", icon: "megaphone", badge: unread }),
        ...only(!!ctx.employee && has(ctx, "leave:apply"), { href: "/leave", label: "My leave", icon: "leave", exact: true }),
        ...only(!!ctx.employee, { href: `/people/${ctx.employee?.id}`, label: "My profile", icon: "person" }),
      ],
    },
    {
      title: "People",
      items: [
        ...only(has(ctx, "employee:read"), { href: "/people", label: "Directory", icon: "people" }),
        ...only(has(ctx, "employee:read"), { href: "/org-chart", label: "Org chart", icon: "org" }),
        ...only(seesOthersLeave, { href: "/leave/calendar", label: "Who's away", icon: "calendar" }),
      ],
    },
    {
      title: "Workforce",
      items: [
        ...only(
          (["requisition:create", "recruitment:manage", "application:review", "interview:score"] as const).some((p) => has(ctx, p)),
          { href: "/recruitment", label: "Hiring", icon: "hiring" },
        ),
        ...only(has(ctx, "promotion:initiate") || has(ctx, "promotion:approve"), { href: "/promotions", label: "Promotions", icon: "promotion" }),
        ...only(managesExits || has(ctx, "separation:approve") || has(ctx, "clearance:signoff"), { href: "/separations", label: "Exits", icon: "exit" }),
      ],
    },
    {
      title: "Admin",
      items: [
        ...only(has(ctx, "user:read"), { href: "/admin/users", label: "Users", icon: "users" }),
        ...only(has(ctx, "role:manage"), { href: "/admin/roles", label: "Roles", icon: "shield" }),
        ...only(has(ctx, "leave:manage"), { href: "/admin/leave-settings", label: "Leave policy", icon: "settings" }),
        ...only(has(ctx, "email:read"), { href: "/admin/emails", label: "Emails", icon: "mail" }),
        ...only(has(ctx, "audit:read"), { href: "/admin/audit", label: "Audit log", icon: "audit" }),
      ],
    },
  ];
  const sections = all.filter((s) => s.items.length > 0);

  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[15.5rem_1fr]">
      <Sidebar
        sections={sections}
        canSearch={has(ctx, "employee:read")}
        user={{ name: ctx.name, roles: ctx.roleNames }}
        logout={logoutAction}
      />
      <main className="min-w-0 px-4 pt-6 pb-16 sm:px-8 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
