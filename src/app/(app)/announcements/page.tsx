import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Megaphone, Plus } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { listAnnouncements } from "@/server/services/announcements";
import { Empty, ListRow, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const ctx = await requireCtx();
  const items = await listAnnouncements(ctx);
  const canSend = has(ctx, "announcement:send");

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="News and meetings from HR and your managers."
        actions={canSend && <Link href="/announcements/new" className="btn-primary"><Plus className="size-4" /> New announcement</Link>}
      />
      <div className="card divide-y divide-stone-100 overflow-hidden">
        {items.map((a) => {
          const Icon = a.kind === "meeting" ? CalendarClock : Megaphone;
          return (
            <ListRow
              key={a.id}
              href={`/announcements/${a.id}`}
              trailing={<span className="hidden text-xs text-stone-400 sm:inline">{fmtDate(a.createdAt)}</span>}
            >
              <span className="flex items-start gap-3">
                <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${a.unread ? "bg-gradient-to-b from-stone-700 to-black text-white" : "bg-stone-100 text-stone-500"}`}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    {a.unread && <span className="size-2 shrink-0 rounded-full bg-sky-500" aria-label="New" />}
                    <span className={`truncate ${a.unread ? "font-semibold" : "font-medium"}`}>{a.title}</span>
                  </span>
                  <span className="block truncate text-sm text-stone-500">
                    {a.mine ? `You · to ${a.audienceLabel} · seen by ${a.seen} of ${a.total}` : `From ${a.authorName}`}
                    {a.meeting && ` · ${fmtDateTime(a.meeting.at)}`}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-sm text-stone-400">{a.excerpt}</span>
                </span>
              </span>
            </ListRow>
          );
        })}
        {!items.length && (
          <Empty icon={Megaphone} action={canSend && <Link href="/announcements/new" className="btn-secondary">Write the first one</Link>}>
            No announcements yet.
          </Empty>
        )}
      </div>
    </>
  );
}
