import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { advertDraft, getRequisition } from "@/server/services/recruitment";
import { PageHeader } from "@/components/ui";
import { VacancyForm } from "./VacancyForm";

export const metadata: Metadata = { title: "New job advert" };

export default async function NewVacancyPage({ searchParams }: { searchParams: Promise<{ req?: string }> }) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "recruitment:manage");
  const { req: reqId = "" } = await searchParams;
  const [{ req, departmentName }, draft] = await Promise.all([load(getRequisition(ctx, reqId)), load(advertDraft(ctx, reqId))]);

  return (
    <>
      <PageHeader
        title={`Advert: ${req.title}`}
        subtitle={`${departmentName} · ${req.openings} opening${req.openings === 1 ? "" : "s"} · ${req.number}`}
        back={{ href: `/recruitment/requisitions/${reqId}`, label: req.number }}
      />
      <div className="max-w-4xl">
        <VacancyForm requisitionId={reqId} draft={draft} />
      </div>
    </>
  );
}
