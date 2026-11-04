import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

/** An error whose message is safe to show the user. */
export class AppError extends Error {}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found.`);
  }
}

export type ActionResult = {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Shown once on the form, e.g. a temporary password. */
  secret?: string;
  /** Where to go next, e.g. the record that was just created. */
  href?: string;
};

/**
 * Wraps a Server Action body: known errors become a message on the form,
 * zod errors become per-field messages, and anything unexpected is logged
 * and shown as a generic error (no stack traces or internals to the browser).
 */
export async function runAction(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: "Saved." };
  } catch (err) {
    unstable_rethrow(err); // let Next.js redirect() / notFound() through
    if (err instanceof ForbiddenError) await recordDenied(err.message);
    if (err instanceof AppError) return { error: err.message };
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { error: "Please fix the highlighted fields.", fieldErrors };
    }
    console.error(err);
    return { error: "Something went wrong. Please try again." };
  }
}

/**
 * Refused attempts go in the audit trail too: someone repeatedly poking at
 * things they can't do is exactly what an auditor wants to see.
 * (Imported lazily: context and audit both depend on this file.)
 */
export async function recordDenied(detail: string, where?: string) {
  try {
    const [{ getCtx }, { record }] = await Promise.all([import("./context"), import("./audit")]);
    const ctx = await getCtx();
    if (!ctx) return;
    await record(ctx, {
      action: "access.denied",
      summary: where ? `Denied access to ${where}` : `Action refused: ${detail}`,
    });
  } catch (err) {
    console.error("Could not audit a denied action", err);
  }
}
