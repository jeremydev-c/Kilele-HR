"use client";

import { useRef } from "react";
import { LogIn } from "lucide-react";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { loginAction } from "./actions";

type Demo = {
  accounts: { email: string; name: string; role: string; blurb: string }[];
  password: string;
} | null;

export function LoginForm({ next, demo }: { next: string; demo: Demo }) {
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  return (
    <>
      <ActionForm action={loginAction} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input ref={email} id="email" name="email" type="email" autoComplete="username" required className="input" />
          <FieldError name="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input ref={password} id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          <FieldError name="password" />
        </div>
        <button type="submit" className="btn-primary w-full">
          <LogIn className="size-4" /> Sign in
        </button>
      </ActionForm>

      {demo && (
        <div className="mt-8">
          <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Demo accounts: tap one to fill the form</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {demo.accounts.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => {
                    if (email.current) email.current.value = a.email;
                    if (password.current) password.current.value = demo.password;
                  }}
                  className="w-full rounded-lg border border-stone-200 bg-white p-3 text-left text-sm hover:border-brand-400 hover:bg-brand-50"
                >
                  <span className="block font-medium">{a.role}</span>
                  <span className="block text-xs text-stone-500">{a.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
