import Link from "next/link";
import { Briefcase, MapPin, Clock } from "lucide-react";
import { openVacancies } from "@/server/services/recruitment";
import { fmtDate } from "@/components/ui";

// A layout's title template only applies to its child pages, so this page sets its own.
export const metadata = { title: { absolute: "Careers at Kilele Group" } };
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { permanent: "Permanent", contract: "Contract", intern: "Internship" };

export default async function CareersPage() {
  const jobs = await openVacancies();
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Work with us</h1>
      <p className="mt-2 max-w-2xl text-stone-600">
        Kilele Group builds logistics and payments software for East African businesses. We hire for skill and
        attitude, and we tell every applicant where they stand.
      </p>

      <h2 className="mt-10 mb-3 text-sm font-semibold tracking-wide text-stone-500 uppercase">
        {jobs.length} open position{jobs.length === 1 ? "" : "s"}
      </h2>
      <ul className="space-y-3">
        {jobs.map((j) => (
          <li key={j.slug}>
            <Link href={`/careers/${j.slug}`} className="card block p-5 transition-colors hover:border-brand-400">
              <p className="text-lg font-semibold text-brand-800">{j.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-stone-600">{j.summary}</p>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                <span className="flex items-center gap-1"><Briefcase className="size-3.5" />{j.departmentName} · {TYPES[j.employmentType] ?? j.employmentType}</span>
                <span className="flex items-center gap-1"><MapPin className="size-3.5" />{j.location}</span>
                <span className="flex items-center gap-1"><Clock className="size-3.5" />Closes {fmtDate(j.closesOn)}</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {!jobs.length && <p className="card p-8 text-center text-stone-500">No open positions right now. Check back soon.</p>}
    </>
  );
}
