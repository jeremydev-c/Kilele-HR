/** Kilele ("peak"): two mountain peaks. */
export function Logo({ className = "", label = "Kilele HR" }: { className?: string; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-brand-500" />
        <path d="M5 24 L13 10 L18 18 L21 14 L27 24 Z" fill="white" />
        <path d="M13 10 L15.5 14.4 L13 13.4 L10.6 14.2 Z" className="fill-brand-200" />
      </svg>
      <span className="text-lg">{label}</span>
    </span>
  );
}
