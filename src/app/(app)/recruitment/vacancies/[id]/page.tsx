import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getVacancyBoard } from "@/server/services/recruitment";
import { ActionForm } from "@/components/ActionForm";
import { Badge, PageHeader, fmtDate } from "@/components/ui";
import { setVacancyStatusAction } from "../../actions";

export const metadata: Metadata = { title: "Applicants" };

const COLUMNS = [
  { key: "new", label: "New" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer", also: ["accepted"] },
  { key: "hired", label: "Hired" },
] as const;

function scoreTone(n: number) {
  return n >= 75 ? "green" : n >= 50 ? "blue" : n >= 25 ? "amber" : "red";
}

export default async function VacancyBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { vacancy: v, applications, canManage } = await load(getVacancyBoard(ctx, id));
  const closed = applications.filter((a) => ["rejected", "withdrawn", "declined"].includes(a.stage));

  return (
    <>
      <PageHeader
        title={v.title}
        subtitle={`${v.departmentName} · ${v.hired} of ${v.openings} hired · closes ${fmtDate(v.closesOn)}`}
        back={{ href: "/recruitment", label: "Hiring" }}
        actions={
          <>
            <Badge tone={v.status === "open" ? "green" : "gray"}>{v.status.charAt(0).toUpperCase() + v.status.slice(1)}</Badge>
            {v.status === "open" && (
              <Link href={`/careers/${v.slug}`} target="_blank" className="btn-secondary"><ExternalLink className="size-4" /> Public advert</Link>
            )}
            {canManage && (v.status === "open" || v.status === "closed" || v.status === "draft") && (
              <ActionForm action={setVacancyStatusAction.bind(null, id, v.status === "open" ? "closed" : "open")}>
                <button className="btn-secondary">{v.status === "open" ? "Close applications" : "Publish"}</button>
              </ActionForm>
            )}
          </>
        }
      />

      <p className="mb-4 text-sm text-stone-500">Best match first.</p>
      <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const stages: string[] = [col.key, ...("also" in col ? col.also : [])];
          const cards = applications.filter((a) => stages.includes(a.stage));
          return (
            <section key={col.key} className="min-w-56 rounded-xl xl:min-w-0 bg-stone-100/70 p-2">
              <h2 className="flex items-center justify-between px-2 py-1 text-sm font-semibold text-stone-600">
                {col.label} <span className="rounded-full bg-white px-2 text-xs">{cards.length}</span>
              </h2>
              <ul className="mt-1 space-y-2">
                {cards.map((a) => (
                  <li key={String(a._id)}>
                    <Link href={`/recruitment/applications/${a._id}`} className="card block p-3 hover:border-brand-400">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{a.candidate.name}</span>
                        <Badge tone={scoreTone(a.score)}>{a.score}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500">{a.number}{a.candidate.location ? ` · ${a.candidate.location}` : ""}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {a.knockouts.length > 0 && <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="size-3" />{a.knockouts.length} must-have missed</span>}
                        {a.stage === "accepted" && <Badge tone="green">Accepted: ready to hire</Badge>}
                        {a.interviews.length > 0 && a.stage === "interview" && (
                          <span className="text-xs text-stone-500">{a.interviews.reduce((n, i) => n + i.scorecards.length, 0)} scorecard(s)</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {closed.length > 0 && (
        <details className="card mt-6 p-4">
          <summary className="cursor-pointer text-sm font-medium">Not progressing ({closed.length})</summary>
          <ul className="mt-3 space-y-1 text-sm">
            {closed.map((a) => (
              <li key={String(a._id)}>
                <Link href={`/recruitment/applications/${a._id}`} className="hover:underline">{a.candidate.name}</Link>{" "}
                <span className="text-stone-500">· {a.stage}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
