import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { listRequisitions, listVacancies, myInterviews } from "@/server/services/recruitment";
import { Badge, Empty, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { WorkflowBadge } from "@/components/workflow";

export const metadata: Metadata = { title: "Hiring" };

const VACANCY_TONE = { open: "green", draft: "gray", closed: "amber", filled: "blue" } as const;

export default async function RecruitmentPage() {
  const ctx = await requireCtx();
  const recruiter = has(ctx, "recruitment:manage") || has(ctx, "application:review");
  const canRequest = has(ctx, "requisition:create") && !!ctx.employee;
  const [interviews, vacancies, requisitions] = await Promise.all([
    myInterviews(ctx),
    listVacancies(ctx).catch(() => []),
    canRequest || recruiter ? listRequisitions(ctx) : Promise.resolve([]),
  ]);
  const todo = interviews.filter((i) => i.needsScorecard);

  return (
    <>
      <PageHeader
        title="Hiring"
        actions={
          <>
            <Link href="/careers" target="_blank" className="btn-secondary"><ExternalLink className="size-4" /> Careers site</Link>
            {canRequest && <Link href="/recruitment/requisitions/new" className="btn-primary"><Plus className="size-4" /> Request a hire</Link>}
          </>
        }
      />

      {interviews.length > 0 && (
        <section className="card mb-6 overflow-hidden">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
            My interviews {todo.length > 0 && <Badge tone="amber">{todo.length} scorecard{todo.length === 1 ? "" : "s"} to submit</Badge>}
          </h2>
          <ul className="divide-y divide-stone-100">
            {interviews.map((i, idx) => (
              <li key={idx}>
                <Link href={`/recruitment/applications/${i.applicationId}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
                  <span>
                    <span className="block font-medium">{i.candidate} · {i.job}</span>
                    <span className="block text-xs text-stone-500">{fmtDateTime(i.at)} · {i.where}</span>
                  </span>
                  {i.needsScorecard ? <Badge tone="amber">Scorecard needed</Badge> : <Badge tone="green">Scored</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(recruiter || vacancies.length > 0) && (
        <section className="card mb-6 overflow-x-auto">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">Job adverts</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th className="text-center">New</th>
                <th className="text-center">Shortlisted</th>
                <th className="text-center">Interview</th>
                <th className="text-center">Offer</th>
                <th className="text-center">Hired</th>
                <th className="hidden md:table-cell">Closes</th>
              </tr>
            </thead>
            <tbody>
              {vacancies.map((v) => (
                <tr key={String(v._id)} className="hover:bg-stone-50">
                  <td>
                    <Link href={`/recruitment/vacancies/${v._id}`} className="font-medium text-brand-800 hover:underline">{v.title}</Link>
                    <p className="text-xs text-stone-500">{v.departmentName} · {v.total} applicant{v.total === 1 ? "" : "s"}</p>
                  </td>
                  <td><Badge tone={VACANCY_TONE[v.status as keyof typeof VACANCY_TONE]}>{v.status.charAt(0).toUpperCase() + v.status.slice(1)}</Badge></td>
                  {(["new", "shortlisted", "interview"] as const).map((s) => <td key={s} className="text-center">{v.byStage[s] ?? 0}</td>)}
                  <td className="text-center">{(v.byStage.offer ?? 0) + (v.byStage.accepted ?? 0)}</td>
                  <td className="text-center">{v.byStage.hired ?? 0} / {v.openings}</td>
                  <td className="hidden text-stone-500 md:table-cell">{fmtDate(v.closesOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!vacancies.length && <Empty>No job adverts yet.</Empty>}
        </section>
      )}

      {requisitions.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">{has(ctx, "recruitment:manage") ? "Hiring requests" : "My hiring requests"}</h2>
          <ul className="divide-y divide-stone-100">
            {requisitions.map((r) => (
              <li key={String(r._id)}>
                <Link href={`/recruitment/requisitions/${r._id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
                  <span>
                    <span className="block font-medium">{r.openings} × {r.title}</span>
                    <span className="block text-xs text-stone-500">{r.number} · {r.departmentName} · grade {r.grade} · by {r.hiringManagerName}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {r.vacancyId && <Badge tone="blue">Advertised</Badge>}
                    <WorkflowBadge wf={r.workflow} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!interviews.length && !vacancies.length && !requisitions.length && !recruiter && (
        <p className="card p-8 text-center text-sm text-stone-500">Interviews you&apos;re invited to will appear here.</p>
      )}
    </>
  );
}
