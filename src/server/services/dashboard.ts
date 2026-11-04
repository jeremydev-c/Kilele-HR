import { connectDB } from "@/lib/db";
import { Employee } from "../models/Employee";
import { Department } from "../models/Department";
import { Vacancy } from "../models/Recruitment";
import { Separation } from "../models/Separation";
import { Movement } from "../models/Movement";
import { hasScope } from "../authz";
import type { Ctx } from "../context";

/**
 * The organisation at a glance, for people who can see everyone
 * (employee:read@all). Counts only: no names, no pay, no PII.
 */
export async function hrOverview(ctx: Ctx, now = new Date()) {
  if (!hasScope(ctx, "employee:read", "all")) return null;
  await connectDB();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const [byDept, depts, joiners, leavers, onProbation, vacancies, exits, moves] = await Promise.all([
    Employee.aggregate<{ _id: unknown; n: number }>([
      { $match: { status: { $ne: "separated" } } },
      { $group: { _id: "$departmentId", n: { $sum: 1 } } },
    ]),
    Department.find().select("name").lean(),
    Employee.countDocuments({ hireDate: { $gte: yearStart, $lte: now } }),
    Employee.countDocuments({ status: "separated", separationDate: { $gte: yearStart } }),
    Employee.countDocuments({ status: "probation" }),
    Vacancy.countDocuments({ status: "open" }),
    Separation.countDocuments({ "workflow.status": { $in: ["pending", "approved"] }, completedAt: null }),
    Movement.countDocuments({ $or: [{ "workflow.status": "pending" }, { "workflow.status": "approved", appliedAt: null }] }),
  ]);
  const name = new Map(depts.map((d) => [String(d._id), d.name]));
  const departments = byDept
    .map((d) => ({ name: name.get(String(d._id)) ?? "?", n: d.n }))
    .sort((a, b) => b.n - a.n);
  return {
    headcount: departments.reduce((s, d) => s + d.n, 0),
    departments,
    joiners,
    leavers,
    onProbation,
    vacancies,
    exits,
    moves,
  };
}
