"use client";

import { createContext, startTransition, useActionState, useContext, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { ActionResult } from "@/server/errors";

type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const FormState = createContext<ActionResult>({});

/**
 * A form wired to a Server Action. Shows the action's success or error
 * message, and lets <FieldError> show per-field validation messages.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  /** Ask "are you sure?" before submitting. */
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <FormState.Provider value={state}>
      <form
        // Submitted by hand rather than via <form action>: React resets a form
        // after an action, which would wipe a long form on a single typo.
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {/* Layout classes go on the fieldset, so spacing utilities reach the fields. */}
        <fieldset disabled={pending} className={`min-w-0 ${className ?? ""}`}>
          {children}
          <FormMessage state={state} />
        </fieldset>
      </form>
    </FormState.Provider>
  );
}

function FormMessage({ state }: { state: ActionResult }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <div role="status" className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
        <p className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {state.ok}
        </p>
        {state.secret && (
          <p className="mt-2 rounded-md border border-brand-200 bg-white px-3 py-2 font-mono text-base tracking-wider select-all">
            {state.secret}
          </p>
        )}
        {state.href && (
          <Link href={state.href} className="mt-2 inline-block font-medium text-brand-700 hover:underline">
            Continue →
          </Link>
        )}
      </div>
    );
  }
  return null;
}

export function FieldError({ name }: { name: string }) {
  const msg = useContext(FormState).fieldErrors?.[name];
  return msg ? <p className="mt-1 text-xs text-red-700">{msg}</p> : null;
}
