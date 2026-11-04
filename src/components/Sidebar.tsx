"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, ShieldCheck, ScrollText, LogOut, Menu, X, KeyRound,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";

const ICONS = {
  dashboard: LayoutDashboard,
  users: Users,
  shield: ShieldCheck,
  audit: ScrollText,
} satisfies Record<string, LucideIcon>;

export type NavSection = {
  title: string;
  items: { href: string; label: string; icon: keyof typeof ICONS }[];
};

export function Sidebar({
  sections,
  user,
  logout,
}: {
  sections: NavSection[];
  user: { name: string; email: string; roles: string[] };
  logout: () => Promise<void>;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Phone / tablet top bar */}
      <div className="flex items-center justify-between bg-brand-950 px-4 py-3 text-white lg:hidden">
        <Logo />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Menu" className="rounded-md p-1.5 hover:bg-white/10">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <aside
        className={`${open ? "block" : "hidden"} bg-brand-950 text-brand-100 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col`}
      >
        <div className="hidden px-5 pt-6 pb-4 text-white lg:block">
          <Logo />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {sections.map((s) => (
            <div key={s.title || "main"} className="mb-4">
              {s.title && <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-brand-400 uppercase">{s.title}</p>}
              <ul className="space-y-0.5">
                {s.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = path === item.href || path.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                          active ? "bg-brand-700 text-white" : "hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <Icon className="size-4" /> {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-brand-300">{user.roles.join(" · ") || "No role"}</p>
          <div className="mt-3 flex gap-2">
            <Link href="/change-password" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-white/10">
              <KeyRound className="size-3.5" /> Password
            </Link>
            <form action={logout}>
              <button type="submit" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-white/10">
                <LogOut className="size-3.5" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
