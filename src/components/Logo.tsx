/** Kilele ("peak"): two mountain peaks. */
export function Logo({ className = "", label = "Kilele HR" }: { className?: string; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-brand-600" />
        <path d="M6 23 L13.5 11 L18 18 L21 14 L26 23 Z" fill="white" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">{label}</span>
    </span>
  );
}
