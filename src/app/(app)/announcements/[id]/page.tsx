import type { Metadata } from "next";
import { CalendarClock, CheckCircle2, Circle, MapPin, Timer } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getAnnouncement } from "@/server/services/announcements";
import { PageHeader, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Announcement" };

export default async function AnnouncementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const ctx = await requireCtx();
  const [{ id }, { sent }] = await Promise.all([params, searchParams]);
  const a = await load(getAnnouncement(ctx, id));

  return (
    <>
      <PageHeader
        title={a.title}
        subtitle={`${a.kind === "meeting" ? "Meeting" : "Announcement"} from ${a.authorName} · ${fmtDateTime(a.createdAt)}`}
        back={{ href: "/announcements", label: "Announcements" }}
      />

      {sent && (
        <p role="status" className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="size-4 text-emerald-600" /> Sent to {a.total} {a.total === 1 ? "person" : "people"}: it&apos;s on their Announcements page and in their email.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {a.meeting && (
            <section className="glitter overflow-hidden rounded-[20px] p-6">
              <p className="flex items-center gap-2 text-sm text-white/60"><CalendarClock className="size-4" /> Meeting</p>
              <p className="mt-2 text-2xl font-semibold">{fmtDateTime(a.meeting.at)}</p>
              <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/75">
                <span className="flex items-center gap-1.5"><Timer className="size-4" /> {a.meeting.durationMins} minutes</span>
                <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {a.meeting.where}</span>
              </p>
            </section>
          )}
          <article className="card p-6">
            {/* The sender's own words; React escapes them, and line breaks are kept. */}
            <p className="text-[16px] leading-relaxed whitespace-pre-line text-stone-800">{a.body}</p>
          </article>
        </div>

        <aside className="card h-fit p-5 text-sm">
          <p className="text-stone-500">Sent to</p>
          <p className="font-medium">{a.audienceLabel} · {a.total} {a.total === 1 ? "person" : "people"}</p>
          {a.mine && (
            <>
              <p className="mt-4 text-stone-500">Seen by {a.seen} of {a.total}</p>
              <div className="mt-2 h-2 rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-gradient-to-r from-stone-500 to-black" style={{ width: `${a.total ? (a.seen / a.total) * 100 : 0}%` }} />
              </div>
              <ul className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
                {a.readers.map((r) => (
                  <li key={r.name} className="flex items-center gap-2">
                    {r.seen ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-stone-300" />}
                    <span className={r.seen ? "" : "text-stone-500"}>{r.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
