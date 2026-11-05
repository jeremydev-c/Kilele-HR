/**
 * Announcements against the seeded test database: who can send to whom,
 * who can read what, "seen by", and one email per person.
 * Needs `npm run db`. `npm run test:db` seeds kilele_hr_test first.
 */
import "./testDbSetup";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Employee } from "@/server/models/Employee";
import { Email } from "@/server/models/Email";
import { Announcement } from "@/server/models/Announcement";
import { ctxForUser, type Ctx } from "@/server/context";
import { getAnnouncement, listAnnouncements, sendAnnouncement, unreadAnnouncements } from "@/server/services/announcements";
import { ForbiddenError, NotFoundError } from "@/server/errors";

const NOW = new Date("2026-11-04T09:00:00+03:00");
const as = async (first: string): Promise<Ctx> => {
  const e = await Employee.findOne({ firstName: first }).lean();
  return ctxForUser((await User.findOne({ employeeId: e!._id }).lean())!, "test");
};
const idOf = async (first: string) => String((await Employee.findOne({ firstName: first }).lean())!._id);

before(() => connectDB());
after(() => mongoose.disconnect());

test("HR's town hall reaches every current employee but the sender, each by email", async () => {
  const hall = (await Announcement.findOne({ title: /^Town hall/ }).lean())!;
  const current = await Employee.countDocuments({ status: { $ne: "separated" } });
  assert.equal(hall.recipientIds.length, current - 1, "everyone except Grace");
  assert.ok(!hall.recipientIds.some((r) => String(r) === hall.authorEmployeeId?.toString()));
  const sent = await Email.find({ entity: "announcement", entityId: String(hall._id) }).lean();
  assert.equal(sent.filter((m) => m.to.endsWith("@kilele.co.ke")).length, hall.recipientIds.length, "one to each work email");
  assert.equal(sent.length, hall.recipientIds.length * 2, "and a copy to each personal email");
  assert.equal(hall.meeting!.at.toISOString(), "2026-11-13T12:00:00.000Z", "15:00 in Nairobi");
});

test("a line manager's 'everyone' is his team only, and he can't pick anyone else", async () => {
  const freeze = (await Announcement.findOne({ title: /^Code freeze/ }).lean())!;
  const david = await idOf("David");
  const team = await Employee.find({ managerPath: new mongoose.Types.ObjectId(david), status: { $ne: "separated" } }).lean();
  assert.equal(freeze.recipientIds.length, team.length);
  assert.ok(!freeze.recipientIds.map(String).includes(await idOf("Esther")), "not Finance");

  const base = { kind: "announcement", title: "Hello", body: "Just checking", audience: "people" };
  await assert.rejects(sendAnnouncement(await as("David"), { ...base, employeeIds: [await idOf("Esther")] }), ForbiddenError);
  await assert.rejects(sendAnnouncement(await as("Mercy"), { ...base, employeeIds: [await idOf("Ian")] }), ForbiddenError, "employees only read");
  await assert.rejects(sendAnnouncement(await as("David"), { ...base, employeeIds: [] }), /Pick at least one person/);
});

test("meetings need a future time and a place", async () => {
  const base = { kind: "meeting", title: "Standup", body: "Quick sync", audience: "everyone", time: "09:00", where: "Room 2" };
  await assert.rejects(sendAnnouncement(await as("Grace"), { ...base, date: "2026-11-01" }, NOW), /in the future/);
  await assert.rejects(sendAnnouncement(await as("Grace"), { ...base, date: "2026-11-20", where: "" }, NOW), /Say where/);
});

test("reading: only recipients and the sender; opening marks it read; only the sender sees who read it", async () => {
  const mercy = await as("Mercy");
  const before = await unreadAnnouncements(mercy);
  const mine = await listAnnouncements(mercy);
  const hall = mine.find((a) => a.title.startsWith("Town hall"))!;
  assert.ok(hall.unread);

  const opened = await getAnnouncement(mercy, hall.id);
  assert.equal(opened.mine, false);
  assert.deepEqual(opened.readers, [], "recipients don't see who else read it");
  assert.equal(await unreadAnnouncements(mercy), before - 1);

  const asGrace = await getAnnouncement(await as("Grace"), hall.id);
  assert.ok(asGrace.mine);
  assert.ok(asGrace.readers.find((r) => r.name === "Mercy Njeri")?.seen, "Grace sees that Mercy read it");

  const freeze = (await Announcement.findOne({ title: /^Code freeze/ }).lean())!;
  await assert.rejects(getAnnouncement(await as("Esther"), String(freeze._id)), NotFoundError, "not sent to Finance");
});
