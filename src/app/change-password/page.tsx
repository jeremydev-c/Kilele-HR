import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { Logo } from "@/components/Logo";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const ctx = await requireCtx();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <Logo className="text-brand-900" />
        <h1 className="mt-6 text-xl font-semibold">{ctx.mustChangePassword ? "Choose your own password" : "Change password"}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {ctx.mustChangePassword
            ? "You signed in with a temporary password. Pick a new one to continue."
            : "Changing your password signs you out on your other devices."}
        </p>
        <ActionForm action={changePasswordAction} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="current">{ctx.mustChangePassword ? "Temporary password" : "Current password"}</label>
            <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
            <FieldError name="current" />
          </div>
          <div>
            <label className="label" htmlFor="next">New password</label>
            <input id="next" name="next" type="password" autoComplete="new-password" required className="input" />
            <p className="mt-1 text-xs text-stone-500">At least 10 characters, with letters and numbers.</p>
            <FieldError name="next" />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm new password</label>
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
            <FieldError name="confirm" />
          </div>
          <div className="flex items-center justify-between">
            {!ctx.mustChangePassword ? <Link href="/dashboard" className="text-sm text-stone-500 hover:underline">Cancel</Link> : <span />}
            <button type="submit" className="btn-primary">Save password</button>
          </div>
        </ActionForm>
      </div>
    </main>
  );
}
