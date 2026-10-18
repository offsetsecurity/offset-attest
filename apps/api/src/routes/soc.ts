import { z } from "zod";
import { registerRoutes } from "./register.js";
import { badRequest } from "../lib/errors.js";

/**
 * SOC reports: the SOC 1, SOC 2 and SOC 3 reports the company is working
 * towards or holds.
 *
 * The product exists to get to one of these, so the report itself is a record
 * with an owner and dates: when the observation period ends, when the report
 * was issued, and when the next one is due. Customers ask "is your SOC 2
 * current?", and the answer is a date in this register.
 */

const text = (max: number) => z.string().max(max).default("");
const date = () => z.string().date().nullish();
const ids = () => z.array(z.string().uuid()).default([]);
const email = () => z.union([z.literal(""), z.string().email("That is not an email address.")]).default("");

export const SOC_CATEGORIES = ["Security", "Availability", "Processing integrity", "Confidentiality", "Privacy"] as const;

export const engagementRoutes = registerRoutes({
  table: "engagements",
  label: "SOC report",
  key: "engagement",
  path: "engagements",
  // Work in progress first, then issued reports newest first.
  orderBy: "t.status in ('Report issued', 'Cancelled'), t.period_end is null, t.period_end desc, t.seq desc",
  shape: {
    title: z.string().min(1).max(300),
    report: z.enum(["SOC 1", "SOC 2", "SOC 3"]).default("SOC 2"),
    reportType: z.enum(["Type I", "Type II", "Not applicable"]).default("Type II"),
    status: z
      .enum(["Planning", "Readiness", "Observation period", "Fieldwork", "Report issued", "Cancelled"])
      .default("Planning"),
    auditor: text(300),
    categories: text(300).default("Security"),
    periodStart: date(),
    periodEnd: date(),
    reportDate: date(),
    opinion: z
      .enum(["Not yet issued", "Unmodified", "Qualified", "Adverse", "Disclaimer"])
      .default("Not yet issued"),
    exceptions: text(10_000),
    nextDue: date(),
    owner: text(200),
    ownerEmail: email(),
    notes: text(10_000),
    controlIds: ids(),
  },
  columns: {
    title: "title", report: "report", reportType: "report_type", status: "status", auditor: "auditor",
    categories: "categories", periodStart: "period_start", periodEnd: "period_end",
    reportDate: "report_date", opinion: "opinion", exceptions: "exceptions", nextDue: "next_due",
    owner: "owner", ownerEmail: "owner_email", notes: "notes",
  },
  links: [{ table: "engagement_controls", self: "engagement_id", other: "control_id", input: "controlIds", output: "control_ids" }],

  /**
   * The rules a CPA firm applies, checked where a person would otherwise get
   * them wrong: a Type II covers a period, a Type I is as of a date, and an
   * issued report has an opinion and a date.
   */
  validate(body, existing) {
    const get = (k: string, col: string): unknown => (k in body ? body[k] : existing?.[col]);
    const report = get("report", "report");
    const type = get("reportType", "report_type");
    const status = get("status", "status");
    const start = get("periodStart", "period_start");
    const end = get("periodEnd", "period_end");

    if (report === "SOC 3" && type === "Type I") {
      throw badRequest("A SOC 3 report is issued from a Type II examination. Choose Type II or Not applicable.");
    }
    if (type === "Type II" && start && end && String(start) >= String(end)) {
      throw badRequest("The observation period has to end after it starts.");
    }
    if (status === "Report issued") {
      if (!get("reportDate", "report_date")) throw badRequest("An issued report needs the date it was issued.");
      if (get("opinion", "opinion") === "Not yet issued") throw badRequest("An issued report needs the auditor's opinion.");
    }
  },
});
