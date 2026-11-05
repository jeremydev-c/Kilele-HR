/**
 * The emails themselves: one plain layout (black header, white card, one
 * button) and a function per message. Pure functions: no database, so they
 * are easy to test. Everything that came from a person is escaped.
 */

export type Mail = { subject: string; html: string; text: string };

export function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Block = { heading: string; lines: string[]; details?: [string, string][]; button?: { label: string; url: string }; note?: string };

function layout(subject: string, b: Block): Mail {
  const details = b.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-collapse:collapse;background:#f5f5f7;border-radius:12px">${b.details
        .map(([k, v]) => `<tr><td style="padding:10px 16px;color:#6e6e73;font-size:14px;width:38%">${esc(k)}</td><td style="padding:10px 16px;color:#1d1d1f;font-size:14px;font-weight:600">${esc(v)}</td></tr>`)
        .join("")}</table>`
    : "";
  const button = b.button
    ? `<p style="margin:26px 0 8px"><a href="${esc(b.button.url)}" style="display:inline-block;background:#0b0b0c;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:999px">${esc(b.button.label)}</a></p>
       <p style="margin:0;color:#a1a1a6;font-size:12px;word-break:break-all">Or open: ${esc(b.button.url)}</p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#0b0b0c;padding:22px 28px"><span style="display:inline-block;width:26px;height:26px;border-radius:7px;background:#ffffff;vertical-align:middle"></span><span style="color:#ffffff;font-size:17px;font-weight:600;vertical-align:middle;margin-left:10px">Kilele Group</span></td></tr>
<tr><td style="padding:30px 28px 28px">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;letter-spacing:-0.02em">${esc(b.heading)}</h1>
${b.lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#3a3a3c">${l}</p>`).join("")}
${details}${button}
${b.note ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#6e6e73">${b.note}</p>` : ""}
</td></tr></table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#a1a1a6">Kilele Group Ltd · Nairobi. You're getting this because of your application or job at Kilele.</p>
</td></tr></table></body></html>`;
  // Plain-text version: same words, no markup.
  const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const text = [
    b.heading,
    "",
    ...b.lines.map(strip),
    ...(b.details ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(b.button ? ["", `${b.button.label}: ${b.button.url}`] : []),
    ...(b.note ? ["", strip(b.note)] : []),
    "",
    "Kilele Group Ltd · Nairobi",
  ].join("\n");
  return { subject, html, text };
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

// ---------------------------------------------------------------- applicants

export function applicationReceived(p: { name: string; job: string; number: string; link: string }) {
  return layout(`We got your application for ${p.job}`, {
    heading: `Thanks, ${first(p.name)}. We got your application.`,
    lines: [`You applied for <b>${esc(p.job)}</b>. Every application is read and scored against the same questions, and we'll email you at each step.`],
    details: [["Reference", p.number], ["Status", "Received"]],
    button: { label: "Track your application", url: p.link },
    note: "Keep this email: the link is private to you and shows where your application stands at any time.",
  });
}

export function shortlisted(p: { name: string; job: string; link?: string }) {
  return layout(`You've been shortlisted for ${p.job}`, {
    heading: `Good news, ${first(p.name)}: you're on the shortlist.`,
    lines: [`Your application for <b>${esc(p.job)}</b> has been shortlisted. We'll be in touch with an interview time soon.`],
    button: p.link ? { label: "See your application", url: p.link } : undefined,
  });
}

export function notSuccessful(p: { name: string; job: string }) {
  return layout(`Your application for ${p.job}`, {
    heading: `Thank you, ${first(p.name)}.`,
    lines: [
      `We've carefully considered your application for <b>${esc(p.job)}</b>, and we won't be taking it further this time.`,
      "This isn't a judgement on you: we often have more strong applicants than openings. Please do apply again for future roles.",
    ],
  });
}

export function interviewInvite(p: { name: string; job: string; when: string; minutes: number; how: string; where: string; link?: string }) {
  return layout(`Interview for ${p.job}: ${p.when}`, {
    heading: `You're invited to interview, ${first(p.name)}.`,
    lines: [`We'd like to meet you about the <b>${esc(p.job)}</b> role.`],
    details: [["When", `${p.when} (Nairobi time)`], ["Length", `${p.minutes} minutes`], ["How", p.how], ["Where", p.where]],
    button: p.link ? { label: "See the details", url: p.link } : undefined,
    note: "Can't make it? Reply to this email and we'll find another time.",
  });
}

export function offerMade(p: { name: string; job: string; salary: string; start: string; replyBy: string; link?: string }) {
  return layout(`Your offer for ${p.job}`, {
    heading: `Congratulations, ${first(p.name)}! We'd like to offer you the job.`,
    lines: [`We're delighted to offer you the role of <b>${esc(p.job)}</b>.`],
    details: [["Salary", p.salary], ["Start date", p.start], ["Please reply by", p.replyBy]],
    button: p.link ? { label: "Accept or decline", url: p.link } : undefined,
  });
}

export function welcome(p: { name: string; job: string; department: string; start: string; workEmail: string; link: string }) {
  return layout(`Welcome to Kilele, ${first(p.name)}`, {
    heading: `Welcome to the team, ${first(p.name)}!`,
    lines: [`You're joining <b>${esc(p.department)}</b> as <b>${esc(p.job)}</b>. Everything's ready for your first day.`],
    details: [["First day", p.start], ["Your work email", p.workEmail]],
    button: { label: "Kilele HR sign-in", url: p.link },
    note: "HR will give you a first-time password on your first day. You'll choose your own when you sign in.",
  });
}

// ---------------------------------------------------------------- staff

export function panelInvite(p: { name: string; candidate: string; job: string; when: string; how: string; where: string; link: string }) {
  return layout(`Interview panel: ${p.candidate}, ${p.when}`, {
    heading: `You're on an interview panel, ${first(p.name)}.`,
    lines: [`Please interview <b>${esc(p.candidate)}</b> for <b>${esc(p.job)}</b>. Score them on your own before you compare notes.`],
    details: [["When", `${p.when} (Nairobi time)`], ["How", p.how], ["Where", p.where]],
    button: { label: "Open the application", url: p.link },
  });
}

export function offerAnswered(p: { name: string; candidate: string; job: string; accepted: boolean; link: string }) {
  return layout(`${p.candidate} ${p.accepted ? "accepted" : "declined"} the offer`, {
    heading: p.accepted ? `${p.candidate} accepted the offer.` : `${p.candidate} declined the offer.`,
    lines: [p.accepted ? `They'll join as <b>${esc(p.job)}</b>. Hire them in Kilele HR to create their employee record.` : `The <b>${esc(p.job)}</b> role is still open.`],
    button: { label: "Open the application", url: p.link },
  });
}

export function approvalNeeded(p: { name: string; what: string; step: string; requestedBy: string; link: string }) {
  return layout(`Waiting for you: ${p.what}`, {
    heading: `${first(p.name)}, a request is waiting for you.`,
    lines: [`<b>${esc(p.what)}</b>`],
    details: [["Your step", p.step], ["Asked by", p.requestedBy]],
    button: { label: "Review and decide", url: p.link },
  });
}

export function decided(p: { name: string; what: string; outcome: "approved" | "rejected" | "next"; by: string; nextStep?: string; comment?: string; link: string }) {
  const heading = p.outcome === "approved" ? "Approved." : p.outcome === "rejected" ? "Not approved." : `Approved by ${p.by}, now with ${p.nextStep}.`;
  return layout(`${p.outcome === "approved" ? "Approved" : p.outcome === "rejected" ? "Not approved" : "Moving along"}: ${p.what}`, {
    heading,
    lines: [
      `<b>${esc(p.what)}</b>`,
      p.outcome === "next" ? "There's nothing for you to do; we'll email you when it's decided." : `Decided by ${esc(p.by)}.`,
      ...(p.comment ? [`“${esc(p.comment)}”`] : []),
    ],
    button: { label: "See the request", url: p.link },
  });
}

export function clearanceNeeded(p: { name: string; leaver: string; department: string; items: string[]; lastDay: string; link: string }) {
  return layout(`Exit clearance: ${p.leaver}`, {
    heading: `${first(p.name)}, ${p.department} has items to sign off.`,
    lines: [`<b>${esc(p.leaver)}</b> is leaving on ${esc(p.lastDay)}. Please check and sign:`, ...p.items.map((i) => `• ${esc(i)}`)],
    button: { label: "Open the exit", url: p.link },
  });
}

export function accountCreated(p: { name: string; email: string; link: string }) {
  return layout("Your Kilele HR account is ready", {
    heading: `Hi ${first(p.name)}, your account is ready.`,
    lines: ["You can now use Kilele HR for leave, approvals and your own records."],
    details: [["Sign in with", p.email]],
    button: { label: "Sign in", url: p.link },
    note: "For your safety we never email passwords. HR will give you a first-time password, and you'll choose your own when you sign in.",
  });
}

export function passwordReset(p: { name: string; by: string; link: string }) {
  return layout("Your Kilele HR password was reset", {
    heading: `${first(p.name)}, your password was reset.`,
    lines: [`${esc(p.by)} reset your password. They'll give you a temporary one, and you'll choose a new password when you sign in.`],
    button: { label: "Sign in", url: p.link },
    note: "Didn't expect this? Tell HR straight away.",
  });
}

// ---------------------------------------------------------------- announcements

export function announcement(p: { name: string; from: string; title: string; body: string; meeting?: { when: string; minutes: number; where: string }; link: string }) {
  // The sender's own words, paragraph by paragraph, escaped.
  const paragraphs = p.body.split(/\n{2,}/).map((para) => esc(para).replace(/\n/g, "<br>"));
  return layout(p.meeting ? `Meeting: ${p.title}, ${p.meeting.when}` : p.title, {
    heading: p.title,
    lines: [`<span style="color:#6e6e73">From ${esc(p.from)}</span>`, ...paragraphs],
    details: p.meeting ? [["When", `${p.meeting.when} (Nairobi time)`], ["Length", `${p.meeting.minutes} minutes`], ["Where", p.meeting.where]] : undefined,
    button: { label: p.meeting ? "See the meeting" : "Open in Kilele HR", url: p.link },
  });
}
