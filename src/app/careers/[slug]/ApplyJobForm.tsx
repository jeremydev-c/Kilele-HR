"use client";

import { ActionForm, FieldError } from "@/components/ActionForm";
import { applyAction } from "../actions";

type Q = { key: string; text: string; kind: "yesno" | "number" };

export function ApplyJobForm({ slug, questions }: { slug: string; questions: Q[] }) {
  return (
    <ActionForm action={applyAction.bind(null, slug)} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Full name</label>
        <input id="name" name="name" required autoComplete="name" className="input" />
        <FieldError name="name" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        <FieldError name="email" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="0712 345 678" className="input" />
          <FieldError name="phone" />
        </div>
        <div>
          <label className="label" htmlFor="location">Town</label>
          <input id="location" name="location" placeholder="e.g. Nairobi" className="input" />
        </div>
      </div>

      {questions.map((q) => (
        <div key={q.key}>
          <label className="label" htmlFor={q.key}>{q.text}</label>
          {q.kind === "yesno" ? (
            <select id={q.key} name={`answer_${q.key}`} required defaultValue="" className="input">
              <option value="" disabled>Choose…</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          ) : (
            <input id={q.key} name={`answer_${q.key}`} type="number" min={0} required className="input" />
          )}
        </div>
      ))}

      <div>
        <label className="label" htmlFor="cv">CV (PDF, up to 2 MB)</label>
        <input id="cv" name="cv" type="file" accept="application/pdf,.pdf" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
      </div>
      <div>
        <label className="label" htmlFor="coverLetter">Why you? (optional)</label>
        <textarea id="coverLetter" name="coverLetter" rows={4} maxLength={3000} className="input" />
        <FieldError name="coverLetter" />
      </div>

      {/* Honeypot: hidden from people, irresistible to bots. Anything typed here means "bot". */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="flex items-start gap-2 text-xs text-stone-600">
        <input type="checkbox" name="consent" required className="mt-0.5 accent-brand-600" />
        <span>
          I agree that Kilele Group may use these details to assess my application for this role. They are seen only by
          the recruiting team and interviewers, and unsuccessful applications are deleted after 12 months (Kenya Data
          Protection Act, 2019).
        </span>
      </label>
      <FieldError name="consent" />
      <button className="btn-primary w-full">Submit application</button>
    </ActionForm>
  );
}
