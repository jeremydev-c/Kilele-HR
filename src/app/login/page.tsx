import type { Metadata } from "next";
import Link from "next/link";
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
    <main className="glitter flex min-h-screen flex-col items-center px-4 pt-[12vh] pb-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" aria-label="Kilele Group home"><Logo light /></Link>
          <h1 className="mt-8 text-[34px] font-semibold">Sign in</h1>
          <p className="mt-1 text-white/60">Use your Kilele work email.</p>
        </div>
        <LoginForm next={next ?? ""} demo={demo} />
        <p className="mt-10 text-center text-sm text-white/55">
          Looking for a job? <Link href="/careers" className="text-white underline-offset-4 hover:underline">See open positions</Link>
        </p>
      </div>
    </main>
  );
}
