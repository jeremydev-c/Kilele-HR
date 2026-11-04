import { Badge } from "./ui";

const COLORS = ["bg-brand-100 text-brand-800", "bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const color = COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const sz = size === "lg" ? "size-16 text-xl" : size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sz} ${color}`}>{initials}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge tone="green">Active</Badge>;
    case "probation":
      return <Badge tone="blue">Probation</Badge>;
    case "on_leave":
      return <Badge tone="amber">On leave</Badge>;
    case "separated":
      return <Badge tone="red">Left</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export const EMPLOYMENT_TYPES = { permanent: "Permanent", contract: "Contract", intern: "Intern" } as const;

export function kes(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}
