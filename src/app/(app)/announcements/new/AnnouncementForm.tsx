"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Megaphone, Search, Send } from "lucide-react";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { sendAnnouncementAction } from "../actions";

type Options = {
  everyoneLabel: string;
  departments: { id: string; name: string; count: number }[];
  people: { id: string; name: string; jobTitle: string; departmentId: string }[];
};

/** Meeting start times: 07:00 to 19:00, every 15 minutes. */
const TIMES = Array.from({ length: 49 }, (_, i) => `${String(7 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

export function AnnouncementForm({ options, today }: { options: Options; today: string }) {
  const [kind, setKind] = useState<"announcement" | "meeting">("announcement");
  const [audience, setAudience] = useState<"everyone" | "departments" | "people">("everyone");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const deptName = useMemo(() => new Map(options.departments.map((d) => [d.id, d.name])), [options.departments]);
  const shown = options.people.filter((p) => `${p.name} ${p.jobTitle} ${deptName.get(p.departmentId)}`.toLowerCase().includes(query.toLowerCase()));

  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const pill = (active: boolean) => `flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${active ? "bg-stone-900 text-white shadow" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`;

  return (
    <ActionForm action={sendAnnouncementAction} className="max-w-3xl space-y-6">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="audience" value={audience} />

      <section className="card space-y-5 p-6">
        <div className="flex gap-2">
          <button type="button" onClick={() => setKind("announcement")} className={pill(kind === "announcement")}><Megaphone className="size-4" /> Announcement</button>
          <button type="button" onClick={() => setKind("meeting")} className={pill(kind === "meeting")}><CalendarClock className="size-4" /> Meeting</button>
        </div>

        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" required maxLength={120} className="input" placeholder={kind === "meeting" ? "e.g. Town hall: Q4 results" : "e.g. Office closed on Friday"} />
          <FieldError name="title" />
        </div>
        <div>
          <label className="label" htmlFor="body">Message</label>
          <textarea id="body" name="body" required rows={6} maxLength={5000} className="input" placeholder="Write it the way you'd say it. Line breaks are kept." />
          <FieldError name="body" />
        </div>

        {kind === "meeting" && (
          <div className="grid gap-4 rounded-2xl bg-stone-50 p-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="date">Date</label>
              <input id="date" name="date" type="date" required min={today} className="input" />
              <FieldError name="date" />
            </div>
            <div>
              <label className="label" htmlFor="time">Time (Nairobi)</label>
              <select id="time" name="time" required defaultValue="10:00" className="input">
                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="durationMins">Minutes</label>
              <input id="durationMins" name="durationMins" type="number" min={15} max={480} step={15} defaultValue={60} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="where">Where</label>
              <input id="where" name="where" required className="input" placeholder="Boardroom, 4th floor / video link" />
              <FieldError name="where" />
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Send to</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAudience("everyone")} className={pill(audience === "everyone")}>{options.everyoneLabel}</button>
          {options.departments.length > 1 && (
            <button type="button" onClick={() => setAudience("departments")} className={pill(audience === "departments")}>Departments</button>
          )}
          <button type="button" onClick={() => setAudience("people")} className={pill(audience === "people")}>Specific people</button>
        </div>

        {audience === "everyone" && (
          <p className="text-sm text-stone-500">{options.people.length} {options.people.length === 1 ? "person" : "people"} will get it on their Announcements page and by email.</p>
        )}

        {audience === "departments" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.departments.map((d) => (
              <label key={d.id} className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm">
                <input type="checkbox" name="departmentIds" value={d.id} className="accent-brand-600" />
                <span className="flex-1 font-medium">{d.name}</span>
                <span className="text-stone-400 tabular-nums">{d.count}</span>
              </label>
            ))}
          </div>
        )}

        {audience === "people" && (
          <div>
            <div className="relative mb-3">
              <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, job or department" className="input pl-9" aria-label="Search people" />
            </div>
            <p className="mb-2 text-sm text-stone-500">{picked.size} picked</p>
            <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
              {options.people.map((p) => (
                <li key={p.id} hidden={!shown.includes(p)}>
                  <label className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <input type="checkbox" name="employeeIds" value={p.id} checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="accent-brand-600" />
                    <span className="flex-1"><span className="font-medium">{p.name}</span> <span className="text-stone-500">· {p.jobTitle}</span></span>
                    <span className="text-xs text-stone-400">{deptName.get(p.departmentId)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <button className="btn-primary h-11 px-6"><Send className="size-4" /> {kind === "meeting" ? "Send the invite" : "Send announcement"}</button>
    </ActionForm>
  );
}
