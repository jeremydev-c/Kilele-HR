import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, PartyPopper } from "lucide-react";
import { endedVacancy, publicVacancy } from "@/server/services/recruitment";
import { NotFoundError } from "@/server/errors";
import { fmtDate } from "@/components/ui";
import { kes } from "@/components/people";
import { ApplyJobForm } from "./ApplyJobForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await publicVacancy(slug).catch(() => null);
  if (job) return { title: { absolute: `${job.title} · Careers at Kilele Group` }, description: job.summary };
  const ended = await endedVacancy(slug).catch(() => null);
  return { title: { absolute: ended ? `${ended.title} (${ended.reason}) · Careers at Kilele Group` : "Careers at Kilele Group" } };
}

const TYPES: Record<string, string> = { permanent: "Permanent", contract: "Contract", intern: "Internship" };

function Paragraphs({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.every((l) => l.startsWith("-"));
  return bullets ? (
    <ul className="list-disc space-y-1 pl-5">{lines.map((l, i) => <li key={i}>{l.replace(/^-\s*/, "")}</li>)}</ul>
  ) : (
    <>{lines.map((l, i) => <p key={i} className="mb-2">{l}</p>)}</>
  );
}

/** An old link to a job that's no longer open: say so kindly, and point to what is open. */
function JobEnded({ ended }: { ended: NonNullable<Awaited<ReturnType<typeof endedVacancy>>> }) {
  const filled = ended.reason === "filled";
  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-gradient-to-b from-stone-700 to-black text-white">
        <PartyPopper className="size-6" />
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">{filled ? "This position has been filled" : "Applications for this job have closed"}</h1>
      <p className="mt-3 text-stone-600">
        {filled
          ? <>The <b>{ended.title}</b> role in {ended.departmentName} now has its new team member. Thank you to everyone who applied.</>
          : <>We&apos;re no longer taking applications for <b>{ended.title}</b> in {ended.departmentName}. Thank you for your interest.</>}
      </p>
      <p className="mt-1 text-sm text-stone-500">Already applied? Your private status link still shows where your application stands.</p>

      {ended.openCount > 0 ? (
        <div className="mt-10 text-left">
          <p className="mb-3 text-sm font-semibold tracking-wide text-stone-500 uppercase">Still open</p>
          <ul className="space-y-2">
            {ended.otherJobs.map((j) => (
              <li key={j.slug}>
                <Link href={`/careers/${j.slug}`} className="card flex items-center justify-between gap-3 p-4 transition hover:-translate-y-0.5">
                  <span>
                    <span className="block font-semibold">{j.title}</span>
                    <span className="block text-sm text-stone-500">{j.departmentName}</span>
                  </span>
                  <ArrowRight className="size-4 text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/careers" className="btn-primary mt-6 h-11 w-full rounded-full">
            See all {ended.openCount} open job{ended.openCount === 1 ? "" : "s"}
          </Link>
        </div>
      ) : (
        <Link href="/careers" className="btn-primary mt-8 h-11 rounded-full px-6">Check back for new jobs</Link>
      )}
    </div>
  );
}

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await publicVacancy(slug).catch(async (e) => {
    if (!(e instanceof NotFoundError)) throw e;
    return null;
  });
  if (!job) {
    const ended = await endedVacancy(slug);
    if (!ended) notFound();
    return <JobEnded ended={ended} />;
  }

  return (
    <>
      <Link href="/careers" className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
        <ChevronLeft className="size-4" /> All positions
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{job.title}</h1>
      <p className="mt-2 text-stone-600">
        {job.departmentName} · {TYPES[job.employmentType] ?? job.employmentType} · {job.location} · Closes {fmtDate(job.closesOn)}
      </p>
      {job.salary && (
        <p className="mt-1 text-sm font-medium text-brand-800">{kes(job.salary.min)} – {kes(job.salary.max)} per month</p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <article className="space-y-6 text-stone-700">
          <section><Paragraphs text={job.summary} /></section>
          {job.responsibilities && (
            <section>
              <h2 className="mb-2 font-semibold text-stone-900">What you&apos;ll do</h2>
              <Paragraphs text={job.responsibilities} />
            </section>
          )}
          {job.requirements && (
            <section>
              <h2 className="mb-2 font-semibold text-stone-900">What we&apos;re looking for</h2>
              <Paragraphs text={job.requirements} />
            </section>
          )}
        </article>

        <aside className="card self-start p-5">
          <h2 className="mb-4 font-semibold">Apply now</h2>
          <ApplyJobForm slug={job.slug} questions={job.questions} />
        </aside>
      </div>
    </>
  );
}
