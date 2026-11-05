import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: { default: "Careers at Kilele Group", template: "%s · Careers at Kilele Group" }, robots: { index: true, follow: true } };

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glitter">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo light label="Kilele Group" />
            <span className="hidden text-sm text-white/55 sm:inline">· Careers</span>
          </Link>
          <Link href="/login" className="text-sm text-white/60 hover:text-white">Staff sign-in</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500">
        Kilele Group Ltd is a fictional company used for a demo. Please don&apos;t send real personal data.
      </footer>
    </div>
  );
}
