import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { getRequisition } from "@/server/services/recruitment";
import { PageHeader } from "@/components/ui";
import { VacancyForm } from "./VacancyForm";

export const metadata: Metadata = { title: "New job advert" };

function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

export default async function NewVacancyPage({ searchParams }: { searchParams: Promise<{ req?: string }> }) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "recruitment:manage");
  const { req: reqId = "" } = await searchParams;
  const { req, departmentName } = await load(getRequisition(ctx, reqId));

  return (
    <>
      <PageHeader
        title={`Advert: ${req.title}`}
        subtitle={`${departmentName} · ${req.openings} opening${req.openings === 1 ? "" : "s"} · ${req.number}`}
        back={{ href: `/recruitment/requisitions/${reqId}`, label: req.number }}
      />
      <div className="max-w-4xl">
        <VacancyForm requisitionId={reqId} closesDefault={inDays(21)} />
      </div>
    </>
  );
}
