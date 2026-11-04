import Link from "next/link";
import { ShieldX } from "lucide-react";

export default function NoAccessPage() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <ShieldX className="mx-auto size-12 text-stone-400" />
      <h1 className="mt-4 text-xl font-semibold">You don&apos;t have access to that page</h1>
      <p className="mt-2 text-sm text-stone-500">
        Your roles don&apos;t include the permission it needs. If you think you should have it, ask HR or your system administrator.
      </p>
      <Link href="/dashboard" className="btn-secondary mt-6">Back to dashboard</Link>
    </div>
  );
}
