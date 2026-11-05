"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * A page opened before a new version of the site went live points at form
 * handlers that no longer exist, and the submit fails without a word. When
 * that happens, say so plainly and offer a reload instead of failing silently.
 */
export function StaleDeployGuard() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const isStale = (e: unknown) => {
      const err = e as { name?: string; message?: string } | null;
      return err?.name === "UnrecognizedActionError" || /Server Action .* was not found|failed-to-find-server-action/i.test(err?.message ?? "");
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      if (isStale(ev.reason)) {
        ev.preventDefault();
        setStale(true);
      }
    };
    const onError = (ev: ErrorEvent) => {
      if (isStale(ev.error) || isStale({ message: ev.message })) {
        ev.preventDefault();
        setStale(true);
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (!stale) return null;
  return (
    <div role="alert" className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom,0px))]">
      <div className="flex max-w-xl flex-wrap items-center gap-3 rounded-2xl bg-stone-900 px-5 py-4 text-sm text-white shadow-2xl">
        <p className="min-w-0 flex-1">
          <b>We just updated Kilele, so this page is out of date</b> and that wasn&apos;t sent. Copy anything long you typed, then reload and try again.
        </p>
        <button type="button" onClick={() => window.location.reload()} className="btn-light h-9 rounded-full px-4">
          <RefreshCw className="size-4" /> Reload
        </button>
      </div>
    </div>
  );
}
