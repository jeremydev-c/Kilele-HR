import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";
import { WorkflowSchema, type WorkflowState } from "../workflow";

/**
 * Leave is data, not code: HR can change entitlements in Leave settings.
 * Balances are never stored. They're worked out from these documents every
 * time (entitlement + carry-over + adjustments − approved − pending), so
 * there's no running total that can drift out of sync.
 */

const LeaveTypeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    daysPerYear: { type: Number, required: true, min: 0 },
    /** "working": skip weekends and public holidays. "calendar": count every day (maternity, paternity). */
    dayCount: { type: String, enum: ["working", "calendar"], default: "working" },
    paid: { type: Boolean, default: true },
    gender: { type: String, enum: ["any", "female", "male"], default: "any" },
    /** Months of service before it can be taken (e.g. sick leave after 2 months). */
    minServiceMonths: { type: Number, default: 0 },
    /** New joiners get a share of the year's days, by months left in the year. */
    proRata: { type: Boolean, default: false },
    /** Unused days that roll into next year, at most. */
    carryOverMax: { type: Number, default: 0 },
    /** How many days back a request may start (e.g. sick leave reported late). */
    backdateDays: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type LeaveTypeRecord = InferSchemaType<typeof LeaveTypeSchema>;
export const LeaveType = defineModel<LeaveTypeRecord>("LeaveType", LeaveTypeSchema);

/** Eid al-Fitr, Eid al-Adha and one-off gazetted holidays (fixed holidays are in lib/leaveDays.ts). */
const PublicHolidaySchema = new Schema({
  date: { type: String, required: true, unique: true }, // "2027-03-10"
  name: { type: String, required: true },
});
export const PublicHoliday =
  defineModel<InferSchemaType<typeof PublicHolidaySchema>>("PublicHoliday", PublicHolidaySchema);

const LeaveRequestSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // LV-2026-0042
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    employeeName: { type: String, required: true },
    typeCode: { type: String, required: true },
    typeName: { type: String, required: true },
    start: { type: String, required: true }, // ISO dates, inclusive
    end: { type: String, required: true },
    days: { type: Number, required: true },
    /** The leave year the days come out of (the start date's year). */
    year: { type: Number, required: true },
    reason: { type: String, default: "" },
    /** Who covers their work: shown to approvers. */
    handoverTo: { type: String, default: "" },
    workflow: { type: WorkflowSchema, required: true },
  },
  { timestamps: true },
);

LeaveRequestSchema.index({ employeeId: 1, year: 1, typeCode: 1 });
LeaveRequestSchema.index({ start: 1, end: 1 });

export type LeaveRequestRecord = Omit<InferSchemaType<typeof LeaveRequestSchema>, "workflow"> & { workflow: WorkflowState };
export const LeaveRequest =
  defineModel<LeaveRequestRecord>("LeaveRequest", LeaveRequestSchema);

/** HR corrections to a balance (e.g. +2 days in lieu for working on a holiday). Always with a reason. */
const LeaveAdjustmentSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    typeCode: { type: String, required: true },
    year: { type: Number, required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: true },
    byName: { type: String, required: true },
  },
  { timestamps: true },
);
export const LeaveAdjustment =
  defineModel<InferSchemaType<typeof LeaveAdjustmentSchema>>("LeaveAdjustment", LeaveAdjustmentSchema);
