"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Users, ShieldCheck, ScrollText, LogOut, Menu, X, KeyRound, UserRound, Contact, Network,
  CalendarDays, CalendarRange, Inbox, Settings2, Briefcase, TrendingUp, DoorOpen, Search, BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";

const ICONS = {
  home: Home,
  users: Users,
  shield: ShieldCheck,
  audit: ScrollText,
  person: UserRound,
  people: Contact,
  org: Network,
  leave: CalendarDays,
  calendar: CalendarRange,
  inbox: Inbox,
  settings: Settings2,
  hiring: Briefcase,
  promotion: TrendingUp,
  exit: DoorOpen,
} satisfies Record<string, LucideIcon>;

export type NavSection = {
  title: string;
  items: { href: string; label: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean }[];
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function Sidebar({
  sections,
  canSearch,
  user,
  logout,
}: {
  sections: NavSection[];
  canSearch: boolean;
  user: { name: string; roles: string[] };
  logout: () => Promise<void>;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Highlight the most specific match: on /leave/calendar, "Who's away", not "My leave".
  const activeHref = sections
    .flatMap((s) => s.items)
    .filter((i) => path === i.href || (!i.exact && path.startsWith(i.href + "/")))
    .map((i) => i.href)
    .sort((a, b) => b.length - a.length)[0];

  const nav = (
    <>
      {canSearch && (
        <form action="/people" className="relative mb-4 px-3" onSubmit={() => setOpen(false)}>
          <Search className="pointer-events-none absolute top-2.5 left-6 size-4 text-stone-400" />
          <input
            name="q"
            placeholder="Search people"
            aria-label="Search people"
            className="h-9 w-full rounded-[10px] bg-stone-200/60 pr-3 pl-9 text-sm placeholder:text-stone-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
          />
        </form>
      )}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((s) => (
          <div key={s.title || "me"} className="mb-5">
            {s.title && <p className="px-3 pb-1 text-xs font-medium text-stone-400">{s.title}</p>}
            <ul className="space-y-px">
              {s.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-[7px] text-[14px] transition-colors ${
                        active ? "bg-brand-600/10 font-medium text-brand-800" : "text-stone-700 hover:bg-stone-200/60"
                      }`}
                    >
                      <Icon className={`size-[18px] ${active ? "text-brand-700" : "text-stone-500"}`} strokeWidth={1.75} />
                      <span className="flex-1">{item.label}</span>
                      {!!item.badge && (
                        <span className="min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-xs font-semibold text-white tabular-nums">{item.badge}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-stone-200 p-3">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{initials(user.name)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-stone-500">{user.roles[0] ?? "No role"}</span>
          </span>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
          <Link href="/me/access" onClick={() => setOpen(false)} className="flex flex-col items-center gap-1 rounded-lg py-2 text-stone-600 hover:bg-stone-200/60">
            <BadgeCheck className="size-4" strokeWidth={1.75} /> Access
          </Link>
          <Link href="/change-password" className="flex flex-col items-center gap-1 rounded-lg py-2 text-stone-600 hover:bg-stone-200/60">
            <KeyRound className="size-4" strokeWidth={1.75} /> Password
          </Link>
          <form action={logout} className="contents">
            <button type="submit" className="flex flex-col items-center gap-1 rounded-lg py-2 text-stone-600 hover:bg-stone-200/60">
              <LogOut className="size-4" strokeWidth={1.75} /> Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Phone and tablet: a slim top bar; the menu opens as a full-screen sheet. */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-stone-50/85 px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <Link href="/dashboard"><Logo /></Link>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-stone-200/60">
          <Menu className="size-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-stone-50 lg:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <Logo />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-stone-200/60">
              <X className="size-5" />
            </button>
          </div>
          {nav}
        </div>
      )}

      <aside className="hidden border-r border-stone-200 bg-stone-100/70 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link href="/dashboard" className="px-6 pt-6 pb-5"><Logo /></Link>
        {nav}
      </aside>
    </>
  );
}
