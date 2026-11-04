import { notFound, redirect } from "next/navigation";
import type { Permission } from "@/lib/permissions";
import { has } from "./authz";
import type { Ctx } from "./context";
import { ForbiddenError, NotFoundError, recordDenied } from "./errors";

/** Helpers for pages: turn service errors into a 404 or the "no access" page (and audit the refusal). */

export async function requirePermission(ctx: Ctx, perm: Permission) {
  if (has(ctx, perm)) return;
  await recordDenied(perm, `a page that needs ${perm}`);
  redirect("/no-access");
}

export async function load<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError) {
      await recordDenied(err.message, "a record outside their access");
      redirect("/no-access");
    }
    throw err;
  }
}
