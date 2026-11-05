"use client";

import { useRef } from "react";
import { ChevronRight } from "lucide-react";
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
      <ActionForm action={loginAction} className="card space-y-4 p-6">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input ref={email} id="email" name="email" type="email" autoComplete="username" required autoFocus className="input" />
          <FieldError name="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input ref={password} id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          <FieldError name="password" />
        </div>
        <button type="submit" className="btn-primary h-10 w-full">Sign in</button>
      </ActionForm>

      {demo && (
        <div className="mt-8">
          <p className="mb-2 px-1 text-[13px] font-medium text-white/55">Try a demo account</p>
          <ul className="card divide-y divide-stone-100 overflow-hidden">
            {demo.accounts.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => {
                    if (email.current) email.current.value = a.email;
                    if (password.current) password.current.value = demo.password;
                    password.current?.form?.requestSubmit();
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-stone-50"
                >
                  <span>
                    <span className="block text-sm font-medium">{a.role}</span>
                    <span className="block text-xs text-stone-500">{a.name}</span>
                  </span>
                  <ChevronRight className="size-4 text-stone-300" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
