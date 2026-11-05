import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, Clock, MapPin, PackageCheck, Smartphone, Sparkles } from "lucide-react";
import { getCtx } from "@/server/context";
import { openVacancies } from "@/server/services/recruitment";
import { Logo } from "@/components/Logo";
import { fmtDate } from "@/components/ui";

export const metadata: Metadata = {
  title: { absolute: "Kilele Group" },
  description: "Kilele Group builds logistics and payments software for East African businesses. See open jobs or sign in as staff.",
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { permanent: "Permanent", contract: "Contract", intern: "Internship" };

const WORK = [
  { icon: PackageCheck, title: "Logistics", text: "Route planning and live delivery tracking for fleets, from one van in Thika to a hundred trucks on the Northern Corridor." },
  { icon: Smartphone, title: "Payments", text: "M-Pesa, cards and bank transfers in one place, so a small business sees every shilling that comes in and goes out." },
  { icon: Sparkles, title: "Made here", text: "Designed in Nairobi with the traders, shop owners and drivers who use it every day. Built for the way business works here." },
];

const TEAMS = [
  { name: "Engineering", text: "Builds and runs the apps our customers rely on every day." },
  { name: "Sales & Marketing", text: "Finds the businesses we can help and stays close to them." },
  { name: "Operations", text: "Keeps deliveries, devices and support moving on the ground." },
  { name: "Finance", text: "Looks after the money: ours and the systems that move our customers'." },
  { name: "Human Resources", text: "Hires well, pays fairly and looks after the people here." },
  { name: "Executive Office", text: "Sets the direction and makes the big calls." },
];

const STEPS = [
  { title: "Apply in a few minutes", text: "A short form and your CV as a PDF. No account needed." },
  { title: "We read every application", text: "Each one is scored against the same questions, so everyone gets a fair look." },
  { title: "Interviews", text: "Each interviewer scores you on their own before they compare notes." },
  { title: "An answer either way", text: "Your status link shows where you stand at every step, even if it's a no." },
];

export default async function SitePage() {
  const [ctx, jobs] = await Promise.all([getCtx(), openVacancies()]);
  const hiringIn = new Set(jobs.map((j) => j.departmentName));
  const staff = ctx ? { href: "/dashboard", label: "Open Kilele HR" } : { href: "/login", label: "Staff sign-in" };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="glitter sticky top-0 z-30 border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Kilele Group home"><Logo light label="Kilele Group" /></Link>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#about" className="hidden rounded-full px-3 py-1.5 text-white/70 hover:text-white sm:block">About</a>
            <a href="#teams" className="hidden rounded-full px-3 py-1.5 text-white/70 hover:text-white sm:block">Teams</a>
            <a href="#jobs" className="hidden rounded-full px-3 py-1.5 text-white/70 hover:text-white sm:block">Jobs</a>
            <Link href={staff.href} className="btn-light ml-2 h-8 rounded-full px-4">{staff.label}</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="glitter">
          <div className="mx-auto max-w-6xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32">
            <p className="text-[13px] font-medium tracking-[0.12em] text-white/50 uppercase">Kilele means peak</p>
            <h1 className="mt-4 max-w-3xl text-[44px] leading-[1.05] font-semibold text-balance sm:text-[64px]">
              Software that moves East Africa&apos;s goods and money.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/65">
              Kilele Group builds logistics and payments tools for the shops, traders and fleets that keep the region running.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="#jobs" className="btn-light h-11 rounded-full px-6 text-[15px]">
                See open jobs{jobs.length > 0 && <span className="rounded-full bg-stone-900 px-2 text-xs text-white tabular-nums">{jobs.length}</span>}
              </a>
              <Link href={staff.href} className="btn h-11 rounded-full px-6 text-[15px] text-white ring-1 ring-white/30 ring-inset hover:bg-white/10">
                {staff.label} <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="text-[13px] font-medium tracking-[0.12em] text-stone-400 uppercase">What we do</p>
            <h2 className="mt-3 max-w-2xl text-[32px] leading-tight font-semibold text-balance sm:text-[40px]">
              Two things, done properly: getting goods there, and getting paid.
            </h2>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {WORK.map((w) => (
                <div key={w.title} className="card p-6">
                  <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-b from-stone-700 to-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                    <w.icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{w.title}</h3>
                  <p className="mt-2 text-stone-600">{w.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Teams */}
        <section id="teams" className="scroll-mt-16 bg-stone-50">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-[13px] font-medium tracking-[0.12em] text-stone-400 uppercase">Our teams</p>
              <h2 className="mt-3 text-[32px] leading-tight font-semibold text-balance sm:text-[40px]">Six teams, one company.</h2>
              <p className="mt-4 max-w-md text-stone-600">
                We&apos;re small enough that everyone knows each other, and big enough to serve businesses across Kenya.
              </p>
            </div>
            <ul className="card divide-y divide-stone-100 overflow-hidden">
              {TEAMS.map((t) => (
                <li key={t.name} className="flex items-start justify-between gap-4 px-5 py-4">
                  <span className="min-w-0">
                    <span className="block font-semibold">{t.name}</span>
                    <span className="block text-sm text-stone-500">{t.text}</span>
                  </span>
                  {hiringIn.has(t.name) && (
                    <a href="#jobs" className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Hiring</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Jobs */}
        <section id="jobs" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium tracking-[0.12em] text-stone-400 uppercase">Open jobs</p>
                <h2 className="mt-3 text-[32px] leading-tight font-semibold sm:text-[40px]">
                  {jobs.length ? `${jobs.length} role${jobs.length === 1 ? "" : "s"} open right now.` : "No roles open right now."}
                </h2>
              </div>
              <Link href="/careers" className="btn-secondary h-10 rounded-full px-5">All jobs <ArrowRight className="size-4" /></Link>
            </div>

            {jobs.length > 0 ? (
              <ul className="mt-10 grid gap-4 md:grid-cols-2">
                {jobs.map((j) => (
                  <li key={j.slug}>
                    <Link href={`/careers/${j.slug}`} className="card group flex h-full flex-col p-6 transition hover:-translate-y-0.5">
                      <span className="text-xs font-medium text-stone-500">{j.departmentName} · {TYPES[j.employmentType] ?? j.employmentType}</span>
                      <span className="mt-1 text-xl font-semibold">{j.title}</span>
                      <span className="mt-2 line-clamp-2 flex-1 text-stone-600">{j.summary}</span>
                      <span className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                        <span className="flex items-center gap-1"><MapPin className="size-3.5" />{j.location}</span>
                        <span className="flex items-center gap-1"><Clock className="size-3.5" />Closes {fmtDate(j.closesOn)}</span>
                        <span className="ml-auto flex items-center gap-1 font-medium text-stone-900">
                          Apply <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="card mt-10 flex items-center gap-3 p-6 text-stone-500">
                <Briefcase className="size-5 text-stone-300" /> Nothing open today. New roles appear here as soon as they&apos;re approved.
              </p>
            )}

            <h3 className="mt-20 text-lg font-semibold">How we hire</h3>
            <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="border-t-2 border-stone-900 pt-4">
                  <span className="text-sm font-semibold text-stone-400 tabular-nums">Step {i + 1}</span>
                  <p className="mt-1 font-semibold">{s.title}</p>
                  <p className="mt-1 text-sm text-stone-600">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Staff */}
        <section className="px-4 pb-20 sm:px-6 sm:pb-28">
          <div className="glitter mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 overflow-hidden rounded-[28px] px-6 py-10 sm:flex-row sm:items-center sm:px-10 sm:py-12">
            <div>
              <h2 className="text-[28px] leading-tight font-semibold sm:text-[32px]">Already at Kilele?</h2>
              <p className="mt-2 max-w-md text-white/65">Sign in to Kilele HR for your leave, approvals, profile and team.</p>
            </div>
            <Link href={staff.href} className="btn-light h-11 rounded-full px-6 text-[15px]">{staff.label} <ArrowRight className="size-4" /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-stone-500 sm:px-6">
          <span>© Kilele Group Ltd · Nairobi</span>
          <span>A made-up company for a demo. Please don&apos;t send real personal data.</span>
        </div>
      </footer>
    </div>
  );
}
