import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, Link2 } from "lucide-react";
import { candidateStatus } from "@/server/services/recruitment";
import { NotFoundError } from "@/server/errors";
import { ActionForm } from "@/components/ActionForm";
import { fmtDate, fmtDateTime } from "@/components/ui";
import { kes } from "@/components/people";
import { respondAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your application", robots: { index: false, follow: false } };

const STEPS = ["new", "shortlisted", "interview", "offer", "hired"] as const;
const STEP_LABEL = { new: "Received", shortlisted: "Shortlisted", interview: "Interview", offer: "Offer", hired: "Hired" };
const MODE = { in_person: "In person", video: "Video call", phone: "Phone call" } as Record<string, string>;

/**
 * The candidate's private page. The link itself is the key (like a shared
 * document link): we only store a hash of the token, so even someone with
 * the database can't rebuild the link.
 */
export default async function StatusPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { token } = await params;
  const { new: isNew } = await searchParams;
  const s = await candidateStatus(token).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const closed = ["rejected", "withdrawn", "declined"].includes(s.stage);
  const reached = s.stage === "accepted" ? 3 : STEPS.indexOf(s.stage as (typeof STEPS)[number]);

  return (
    <div className="mx-auto max-w-2xl">
      {isNew && (
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4" /> Application received ({s.number})</p>
          <p className="mt-1 flex items-start gap-2">
            <Link2 className="mt-0.5 size-4 shrink-0" />
            Bookmark this page: it&apos;s your private link to follow your application, see interview details and respond to an offer. Don&apos;t share it.
          </p>
        </div>
      )}

      <h1 className="text-2xl font-semibold">Hi {s.name.split(" ")[0]},</h1>
      <p className="mt-1 text-stone-600">Your application for <b>{s.job}</b> ({s.department}), sent {fmtDate(s.appliedAt)}.</p>

      <section className="card mt-6 p-5">
        <p className="text-sm text-stone-500">Status</p>
        <p className="text-xl font-semibold">{s.label}</p>
        {!closed && (
          <ol className="mt-4 flex gap-1">
            {STEPS.map((st, i) => (
              <li key={st} className="flex-1">
                <div className={`h-1.5 rounded-full ${i <= reached ? "bg-brand-500" : "bg-stone-200"}`} />
                <p className={`mt-1 text-xs ${i <= reached ? "text-brand-800" : "text-stone-400"}`}>{STEP_LABEL[st]}</p>
              </li>
            ))}
          </ol>
        )}
        {s.stage === "rejected" && (
          <p className="mt-3 text-sm text-stone-600">Thank you for your interest. We&apos;ve gone ahead with other candidates this time, and we&apos;d be glad to see you apply again.</p>
        )}
      </section>

      {s.interviews.map((i, idx) => (
        <section key={idx} className="card mt-4 flex gap-3 p-5">
          <CalendarClock className="mt-0.5 size-5 text-brand-700" />
          <div className="text-sm">
            <p className="font-semibold">Interview: {fmtDateTime(i.at)} ({i.durationMins} min)</p>
            <p className="text-stone-600">{MODE[i.mode] ?? i.mode} · {i.where}</p>
          </div>
        </section>
      ))}

      {s.offer && (
        <section className="card mt-4 border-brand-300 p-5">
          <h2 className="font-semibold">{s.stage === "accepted" ? "You accepted our offer 🎉" : "Our offer"}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-stone-500">Basic salary</dt><dd className="font-semibold">{kes(s.offer.basicSalary ?? 0)} / month</dd></div>
            <div><dt className="text-stone-500">Start date</dt><dd>{fmtDate(s.offer.startDate)}</dd></div>
            {s.stage === "offer" && <div><dt className="text-stone-500">Please reply by</dt><dd>{fmtDate(s.offer.expiresOn)}</dd></div>}
          </dl>
          {s.stage === "offer" && (
            <div className="mt-4 flex gap-2">
              <ActionForm action={respondAction.bind(null, token, "accept")}>
                <button className="btn-primary">Accept offer</button>
              </ActionForm>
              <ActionForm action={respondAction.bind(null, token, "decline")} confirm="Decline this offer? This can't be undone.">
                <button className="btn-secondary">Decline</button>
              </ActionForm>
            </div>
          )}
          {s.stage === "accepted" && <p className="mt-3 text-sm text-stone-600">HR will be in touch about your first day and the documents to bring (ID, KRA PIN, NSSF and SHA numbers).</p>}
        </section>
      )}

      {s.canWithdraw && (
        <ActionForm action={respondAction.bind(null, token, "withdraw")} confirm="Withdraw your application? This can't be undone." className="mt-8">
          <button className="text-sm text-stone-500 underline hover:text-red-700">Withdraw my application</button>
        </ActionForm>
      )}
    </div>
  );
}
