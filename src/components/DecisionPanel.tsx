import { ActionForm, FieldError } from "./ActionForm";
import type { ActionResult } from "@/server/errors";

/** The approve / decline box, the same on every kind of request. */
export function DecisionPanel({
  action,
  step,
  approveLabel = "Approve",
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  step: string;
  approveLabel?: string;
}) {
  return (
    <section className="card p-5 ring-2 ring-brand-500/25">
      <p className="text-[13px] font-medium text-brand-700">Waiting for you · {step}</p>
      <ActionForm action={action} className="mt-3 space-y-3">
        <div>
          <label className="sr-only" htmlFor="comment">Note</label>
          <textarea id="comment" name="comment" rows={2} placeholder="Add a note (required if you decline)" className="input" />
          <FieldError name="comment" />
        </div>
        <div className="flex gap-2">
          <button name="decision" value="approve" className="btn-primary h-10 flex-1 sm:flex-none sm:px-6">{approveLabel}</button>
          <button name="decision" value="reject" className="btn-danger h-10 flex-1 sm:flex-none">Decline</button>
        </div>
      </ActionForm>
    </section>
  );
}

/** Shown instead, when the request is waiting for someone else. */
export function WaitingNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600">{children}</p>;
}
