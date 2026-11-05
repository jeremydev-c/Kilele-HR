import Link from "next/link";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7">
      {back && (
        <Link href={back.href} className="-ml-1 mb-3 inline-flex items-center text-[15px] text-stone-500 hover:text-stone-900">
          <ChevronLeft className="size-5" strokeWidth={2.25} /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[32px] leading-tight font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-stone-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

const TONES = {
  gray: "bg-stone-100 text-stone-600",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

/** An empty list: one calm line, and the obvious next step if there is one. */
export function Empty({ children, icon: Icon, action }: { children: React.ReactNode; icon?: LucideIcon; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 size-8 text-stone-300" strokeWidth={1.5} />}
      <p className="text-[15px] text-stone-500">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A tappable row in a grouped list, iOS Settings style. */
export function ListRow({ href, children, trailing }: { href: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-stone-50">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        <ChevronRight className="size-4 text-stone-300" />
      </div>
    </Link>
  );
}

/** Section heading inside a page. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-medium text-stone-500">{children}</h2>
      {action}
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });
const dateTimeFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

export function fmtDate(d?: Date | string | null) {
  return d ? dateFmt.format(new Date(d)) : "—";
}

export function fmtDateTime(d?: Date | string | null) {
  return d ? dateTimeFmt.format(new Date(d)) : "—";
}
