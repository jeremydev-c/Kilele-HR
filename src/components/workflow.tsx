import { Check, Clock, MinusCircle, Send, X } from "lucide-react";
import type { WorkflowState } from "@/server/workflow";
import { Badge, fmtDateTime } from "./ui";

/** Status badge and step-by-step timeline for any request that goes through the approval engine. */

export function WorkflowBadge({ wf }: { wf: Pick<WorkflowState, "status" | "steps" | "current"> }) {
  switch (wf.status) {
    case "approved":
      return <Badge tone="green">Approved</Badge>;
    case "rejected":
      return <Badge tone="red">Rejected</Badge>;
    case "cancelled":
      return <Badge>Cancelled</Badge>;
    default:
      return <Badge tone="amber">Waiting: {wf.steps[wf.current]?.label ?? "approval"}</Badge>;
  }
}

const ICON = {
  approved: { Icon: Check, cls: "bg-brand-600 text-white" },
  rejected: { Icon: X, cls: "bg-red-600 text-white" },
  pending: { Icon: Clock, cls: "bg-amber-100 text-amber-700 ring-2 ring-amber-300" },
  waiting: { Icon: Clock, cls: "bg-stone-100 text-stone-400" },
  skipped: { Icon: MinusCircle, cls: "bg-stone-100 text-stone-400" },
};

export function WorkflowTimeline({ wf }: { wf: WorkflowState }) {
  return (
    <ol className="space-y-4">
      <li className="flex gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"><Send className="size-3.5" /></span>
        <div className="text-sm">
          <p className="font-medium">Submitted by {wf.requestedByName}</p>
          <p className="text-xs text-stone-500">{fmtDateTime(wf.requestedAt)}</p>
        </div>
      </li>
      {wf.steps.map((s, i) => {
        const { Icon, cls } = ICON[s.status];
        const who =
          s.status === "approved" || s.status === "rejected"
            ? `${s.status === "approved" ? "Approved" : "Rejected"} by ${s.decidedByName}`
            : s.status === "pending"
              ? `Waiting for ${s.assigneeName ?? s.label}`
              : s.status === "skipped"
                ? "Skipped"
                : `Next: ${s.assigneeName ?? s.label}`;
        return (
          <li key={i} className="flex gap-3">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${cls}`}><Icon className="size-3.5" /></span>
            <div className="text-sm">
              <p className="font-medium">{s.label}: <span className="font-normal">{who}</span></p>
              {s.decidedAt && <p className="text-xs text-stone-500">{fmtDateTime(s.decidedAt)}</p>}
              {s.comment && <p className="mt-1 rounded-md bg-stone-50 px-2 py-1 text-xs text-stone-700">“{s.comment}”</p>}
            </div>
          </li>
        );
      })}
      {wf.status === "cancelled" && (
        <li className="flex gap-3 text-sm text-stone-500">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-100"><MinusCircle className="size-3.5" /></span>
          Cancelled {fmtDateTime(wf.closedAt)}
        </li>
      )}
    </ol>
  );
}
