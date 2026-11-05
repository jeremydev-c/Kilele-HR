/** Kilele ("peak"): two mountain peaks. `light` is for black backgrounds. */
export function Logo({ className = "", label = "Kilele HR", light = false }: { className?: string; label?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? "#fff" : "#0b0b0c"} />
        <path d="M6 23 L13.5 11 L18 18 L21 14 L26 23 Z" fill={light ? "#0b0b0c" : "#fff"} />
      </svg>
      <span className={`text-[17px] font-semibold tracking-tight ${light ? "text-white" : ""}`}>{label}</span>
    </span>
  );
}
