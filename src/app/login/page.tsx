import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx } from "@/server/context";
import { DEMO_ACCOUNTS } from "@/lib/demoAccounts";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCtx()) redirect("/dashboard");
  const { next } = await searchParams;
  const demo = process.env.DEMO_MODE === "true" && process.env.DEMO_PASSWORD
    ? { accounts: DEMO_ACCOUNTS.map((a) => ({ ...a })), password: process.env.DEMO_PASSWORD }
    : null;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col justify-between bg-brand-900 p-8 text-brand-50 lg:p-12">
        <Logo className="text-white" />
        <div className="my-10 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-white lg:text-4xl">People operations, from hire to retire.</h1>
          <p className="mt-4 text-brand-100">
            Employee records, leave, recruitment, promotions and exits in one place, with access that matches each
            person&apos;s job and a tamper-evident record of who saw or changed what.
          </p>
        </div>
        <p className="text-xs text-brand-300">Kilele Group Ltd is a fictional company. All demo data is made up.</p>
      </section>

      <section className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-stone-500">Use your work email.</p>
          <LoginForm next={next ?? ""} demo={demo} />
        </div>
      </section>
    </main>
  );
}
