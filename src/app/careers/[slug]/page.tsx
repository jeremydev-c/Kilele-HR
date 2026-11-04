import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { publicVacancy } from "@/server/services/recruitment";
import { NotFoundError } from "@/server/errors";
import { fmtDate } from "@/components/ui";
import { kes } from "@/components/people";
import { ApplyJobForm } from "./ApplyJobForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const job = await publicVacancy((await params).slug).catch(() => null);
  return { title: { absolute: job ? `${job.title} · Careers at Kilele Group` : "Careers at Kilele Group" }, description: job?.summary };
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

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await publicVacancy(slug).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

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
