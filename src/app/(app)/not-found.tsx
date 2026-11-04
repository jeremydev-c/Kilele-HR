import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-5xl font-semibold text-stone-300">404</p>
      <h1 className="mt-4 text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-stone-500">That record doesn&apos;t exist, or it was removed.</p>
      <Link href="/dashboard" className="btn-secondary mt-6">Back to dashboard</Link>
    </div>
  );
}
