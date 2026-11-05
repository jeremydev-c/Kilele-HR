import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { audienceOptions } from "@/server/services/announcements";
import { PageHeader } from "@/components/ui";
import { AnnouncementForm } from "./AnnouncementForm";

export const metadata: Metadata = { title: "New announcement" };

/** The earliest meeting date: today in Nairobi (the server may run on UTC). */
function todayInNairobi() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
}

export default async function NewAnnouncementPage() {
  const ctx = await requireCtx();
  await requirePermission(ctx, "announcement:send");
  const options = await load(audienceOptions(ctx));

  return (
    <>
      <PageHeader
        title="New announcement"
        subtitle="It appears on each person's Announcements page and goes to their email."
        back={{ href: "/announcements", label: "Announcements" }}
      />
      <AnnouncementForm options={options} today={todayInNairobi()} />
    </>
  );
}
