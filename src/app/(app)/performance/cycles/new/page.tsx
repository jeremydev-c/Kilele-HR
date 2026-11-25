import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { requirePermission } from "@/server/page";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { Input } from "../../../people/fields";
import { startCycleAction } from "../../actions";

export const metadata: Metadata = { title: "Start a review cycle" };

function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

export default async function NewCyclePage() {
  const ctx = await requireCtx();
  await requirePermission(ctx, "performance:manage");
  const year = new Date().getFullYear();

  return (
    <>
      <PageHeader
        title="Start a review cycle"
        subtitle="Everyone with a manager gets a review. Their manager sets goals first, then the employee rates themselves, the manager rates them, and the employee signs it off."
        back={{ href: "/performance", label: "Performance" }}
      />
      <ActionForm action={startCycleAction} className="card max-w-2xl space-y-5 p-6" confirm="Start the cycle? Every manager will be emailed straight away.">
        <Input name="name" label="Name" required defaultValue={`${year} Annual review`} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="periodStart" label="Period from" type="date" required defaultValue={`${year}-01-01`} />
          <Input name="periodEnd" label="Period to" type="date" required defaultValue={`${year}-12-31`} />
        </div>
        <Input name="dueOn" label="Finish by" type="date" required defaultValue={inDays(30)} hint="Reviews still open after this date show as late on the cycle page." />
        <p className="text-sm text-stone-500">People who joined after the period ended, and anyone without a manager, are left out. The cycle page lists who was left out and why.</p>
        <button className="btn-primary">Start the cycle</button>
      </ActionForm>
    </>
  );
}
