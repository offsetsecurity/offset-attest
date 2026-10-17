import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerRoutes } from "./register.js";
import { query } from "../db/pool.js";
import { canRead } from "../auth/rbac.js";
import { badRequest } from "../lib/errors.js";

/**
 * The GDPR registers.
 *
 * The data map, the impact assessments, the requests people make about their
 * own data, the breach log and the consent records. Each is a configuration of
 * the same CRUD routes as every other register, so each gets the same audit
 * rows, the same guards and the same attachments.
 *
 * Every row is written by a person. Nothing here reads other systems: the
 * product records what the organisation says it does, and reminds the owner
 * when that has not been looked at for a year.
 */

const text = (max: number) => z.string().max(max).default("");
const date = () => z.string().date().nullish();
const ids = () => z.array(z.string().uuid()).default([]);
/** Where reminders go when the record's date comes. Empty means nobody is chased. */
const email = () => z.union([z.literal(""), z.string().email("That is not an email address.")]).default("");
/** A local wall-clock time from the browser's date-and-time box, "2026-10-16T09:30". */
const when = () =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Give a date and a time.");
/**
 * Answers to a questionnaire on the screen, stored as JSON text. The column
 * ends in _json so the register routes hand it back parsed.
 */
const answers = () =>
  z.record(z.string(), z.unknown()).default({}).transform((v) => JSON.stringify(v));

const controlLink = (self: string, table: string) => ({
  table, self, other: "control_id", input: "controlIds", output: "control_ids",
});

// ── the data map ─────────────────────────────────────────────────────────────
export const LAWFUL_BASES = [
  "Consent", "Contract", "Legal obligation", "Vital interests", "Public task",
  "Legitimate interests", "Not decided yet",
] as const;

export const activityRoutes = registerRoutes({
  table: "processing_activities",
  label: "Processing activity",
  key: "activity",
  path: "activities",
  orderBy: "t.status = 'Retired', t.department, t.name",
  shape: {
    name: z.string().min(1).max(300),
    department: text(120),
    owner: text(200),
    ownerEmail: email(),
    purpose: text(4000),
    lawfulBasis: z.enum(LAWFUL_BASES).default("Not decided yet"),
    dataSubjects: text(1000),
    dataCategories: text(2000),
    specialData: z.enum(["No", "Yes"]).default("No"),
    specialCondition: text(1000),
    source: text(1000),
    storage: text(2000),
    recipients: text(2000),
    transfers: text(2000),
    retention: text(1000),
    security: text(4000),
    highRisk: z.enum(["Not assessed", "No", "Yes"]).default("Not assessed"),
    status: z.enum(["Draft", "Active", "Retired"]).default("Draft"),
    lastReviewed: date(),
    notes: text(10_000),
    vendorIds: ids(),
    controlIds: ids(),
  },
  columns: {
    name: "name", department: "department", owner: "owner", ownerEmail: "owner_email",
    purpose: "purpose", lawfulBasis: "lawful_basis", dataSubjects: "data_subjects",
    dataCategories: "data_categories", specialData: "special_data",
    specialCondition: "special_condition", source: "source", storage: "storage",
    recipients: "recipients", transfers: "transfers", retention: "retention",
    security: "security", highRisk: "high_risk", status: "status",
    lastReviewed: "last_reviewed", notes: "notes",
  },
  links: [
    { table: "activity_vendors", self: "activity_id", other: "vendor_id", input: "vendorIds", output: "vendor_ids" },
    controlLink("activity_id", "activity_controls"),
  ],
  // Whether an impact assessment exists for it, so the list can say when one is missing.
  extraSelect: `(select count(*) from dpias d
                  where d.activity_id = t.id and d.status <> 'Not needed') as dpia_count`,
});

// ── impact assessments ───────────────────────────────────────────────────────
export const dpiaRoutes = registerRoutes({
  table: "dpias",
  label: "DPIA",
  key: "dpia",
  path: "dpias",
  orderBy: "t.status in ('Approved', 'Rejected', 'Not needed'), t.seq desc",
  shape: {
    title: z.string().min(1).max(300),
    activityId: z.string().uuid().nullish(),
    owner: text(200),
    ownerEmail: email(),
    status: z.enum(["Screening", "Not needed", "In progress", "Approved", "Rejected"]).default("Screening"),
    description: text(4000),
    screening: answers(),
    risks: answers(),
    necessity: text(4000),
    minimisation: text(4000),
    rights: text(4000),
    residualRisk: z.enum(["Not assessed", "Low", "Medium", "High"]).default("Not assessed"),
    dpoAdvice: text(4000),
    decision: z.enum(["Not decided", "Go ahead", "Go ahead with changes", "Do not go ahead"]).default("Not decided"),
    consultRegulator: z.enum(["No", "Yes", "Done"]).default("No"),
    approvedBy: text(200),
    approvedDate: date(),
    reviewDate: date(),
    notes: text(10_000),
  },
  columns: {
    title: "title", activityId: "activity_id", owner: "owner", ownerEmail: "owner_email",
    status: "status", description: "description", screening: "screening_json",
    risks: "risks_json", necessity: "necessity", minimisation: "minimisation",
    rights: "rights", residualRisk: "residual_risk", dpoAdvice: "dpo_advice",
    decision: "decision", consultRegulator: "consult_regulator", approvedBy: "approved_by",
    approvedDate: "approved_date", reviewDate: "review_date", notes: "notes",
  },
  // The data map entry's name, so the list need not look it up.
  extraSelect: `(select a.name from processing_activities a where a.id = t.activity_id) as activity_name`,
});

// ── requests from individuals ────────────────────────────────────────────────
export const requestRoutes = registerRoutes({
  table: "subject_requests",
  label: "Request",
  key: "request",
  path: "requests",
  orderBy: "t.status in ('Done', 'Refused'), t.due_date, t.seq",
  shape: {
    requester: z.string().min(1).max(200),
    contact: text(300),
    requestType: z
      .enum(["Access", "Erasure", "Correction", "Objection", "Restriction", "Portability", "Stop marketing", "Other"])
      .default("Access"),
    channel: text(120),
    receivedDate: z.string().date("Give the date the request arrived."),
    identity: z.enum(["Not checked", "Checked", "Not needed"]).default("Not checked"),
    extended: z.enum(["No", "Yes"]).default("No"),
    extensionReason: text(2000),
    status: z.enum(["Open", "Waiting for ID", "In progress", "Done", "Refused"]).default("Open"),
    owner: text(200),
    ownerEmail: email(),
    completedDate: date(),
    outcome: text(4000),
    notes: text(10_000),
  },
  columns: {
    requester: "requester", contact: "contact", requestType: "request_type", channel: "channel",
    receivedDate: "received_date", identity: "identity", extended: "extended",
    extensionReason: "extension_reason", status: "status", owner: "owner",
    ownerEmail: "owner_email", completedDate: "completed_date", outcome: "outcome", notes: "notes",
  },
  validate(body, existing) {
    const status = body["status"] ?? existing?.["status"];
    const extended = body["extended"] ?? existing?.["extended"];
    const reason = String(body["extensionReason"] ?? existing?.["extension_reason"] ?? "").trim();
    if (extended === "Yes" && !reason) {
      throw badRequest("Say why the request needs more time. The person must be told the reason.");
    }
    if ((status === "Done" || status === "Refused") &&
        !String(body["outcome"] ?? existing?.["outcome"] ?? "").trim()) {
      throw badRequest("Write down what you did, or why you refused, before closing it.");
    }
  },
});

// ── breaches ─────────────────────────────────────────────────────────────────
export const breachRoutes = registerRoutes({
  table: "breaches",
  label: "Breach",
  key: "breach",
  path: "breaches",
  orderBy: "t.status = 'Closed', t.aware_at desc",
  shape: {
    title: z.string().min(1).max(300),
    awareAt: when(),
    occurredAt: when().nullish().or(z.literal("").transform(() => null)),
    description: text(4000),
    dataCategories: text(2000),
    peopleAffected: text(200),
    specialData: z.enum(["No", "Yes"]).default("No"),
    consequences: text(4000),
    riskLevel: z
      .enum(["Not assessed", "Unlikely to harm anyone", "Risk to people", "High risk to people"])
      .default("Not assessed"),
    notifyRegulator: z.enum(["Not decided", "Yes", "No"]).default("Not decided"),
    regulatorNotifiedAt: when().nullish().or(z.literal("").transform(() => null)),
    regulatorReference: text(200),
    lateReason: text(2000),
    notifyPeople: z.enum(["Not decided", "Yes", "No"]).default("Not decided"),
    peopleNotifiedDate: date(),
    decisionReason: text(4000),
    containment: text(4000),
    status: z.enum(["Open", "Contained", "Closed"]).default("Open"),
    owner: text(200),
    ownerEmail: email(),
    notes: text(10_000),
  },
  columns: {
    title: "title", awareAt: "aware_at", occurredAt: "occurred_at", description: "description",
    dataCategories: "data_categories", peopleAffected: "people_affected",
    specialData: "special_data", consequences: "consequences", riskLevel: "risk_level",
    notifyRegulator: "notify_regulator", regulatorNotifiedAt: "regulator_notified_at",
    regulatorReference: "regulator_reference", lateReason: "late_reason",
    notifyPeople: "notify_people", peopleNotifiedDate: "people_notified_date",
    decisionReason: "decision_reason", containment: "containment", status: "status",
    owner: "owner", ownerEmail: "owner_email", notes: "notes",
  },
  validate(body, existing) {
    const status = body["status"] ?? existing?.["status"];
    const reg = body["notifyRegulator"] ?? existing?.["notify_regulator"];
    const why = String(body["decisionReason"] ?? existing?.["decision_reason"] ?? "").trim();
    // Article 33(5): every breach is documented, including why it was not reported.
    if (status === "Closed" && (reg === "Not decided" || !why)) {
      throw badRequest("Before closing, decide whether to tell the regulator and write down why. GDPR asks for this on every breach.");
    }
  },
});

// ── consent records ──────────────────────────────────────────────────────────
export const consentRoutes = registerRoutes({
  table: "consents",
  label: "Consent record",
  key: "consent",
  path: "consents",
  orderBy: "t.status = 'Ended', t.purpose",
  shape: {
    purpose: z.string().min(1).max(300),
    activityId: z.string().uuid().nullish(),
    method: text(300),
    wording: text(4000),
    noticeVersion: text(120),
    evidenceLocation: text(500),
    withdrawMethod: text(1000),
    startedDate: date(),
    status: z.enum(["Active", "Paused", "Ended"]).default("Active"),
    owner: text(200),
    ownerEmail: email(),
    lastReviewed: date(),
    notes: text(10_000),
  },
  columns: {
    purpose: "purpose", activityId: "activity_id", method: "method", wording: "wording",
    noticeVersion: "notice_version", evidenceLocation: "evidence_location",
    withdrawMethod: "withdraw_method", startedDate: "started_date", status: "status",
    owner: "owner", ownerEmail: "owner_email", lastReviewed: "last_reviewed", notes: "notes",
  },
  extraSelect: `(select a.name from processing_activities a where a.id = t.activity_id) as activity_name`,
});

// ── what needs attention ─────────────────────────────────────────────────────

export interface AttentionItem {
  /** What sort of thing: "Request", "Breach", "Data map review". */
  kind: string;
  /** The screen it lives on. */
  screen: string;
  id: string;
  title: string;
  /** One short line saying what is wrong. */
  detail: string;
  /** The date, or date and time, it is due. Empty when it has none. */
  due: string;
  /** overdue: past its date. soon: within a week. gap: something is missing. */
  level: "overdue" | "soon" | "gap";
}

/** Everything in the GDPR records that is late, nearly late, or missing. */
export async function privacyAttention(today: string, now: string): Promise<AttentionItem[]> {
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const level = (due: string): AttentionItem["level"] =>
    due < today ? "overdue" : "soon";
  const items: AttentionItem[] = [];

  const requests = await query<{ id: string; seq: number; requester: string; request_type: string; due_date: string; status: string }>(
    `select id, seq, requester, request_type, due_date, status from subject_requests
      where status not in ('Done', 'Refused') and due_date <= $1`,
    [soon],
  );
  for (const r of requests.rows) {
    items.push({
      kind: "Individual request", screen: "requests", id: r.id,
      title: `${r.request_type} request from ${r.requester}`,
      detail: r.due_date < today ? "the answer is late" : "the answer is due within a week",
      due: r.due_date, level: level(r.due_date),
    });
  }

  const breaches = await query<{ id: string; title: string; regulator_deadline: string; notify_regulator: string }>(
    `select id, title, regulator_deadline, notify_regulator from breaches
      where status <> 'Closed' and notify_regulator <> 'No' and regulator_notified_at is null`,
  );
  for (const b of breaches.rows) {
    items.push({
      kind: "Breach", screen: "breaches", id: b.id, title: b.title,
      detail: b.notify_regulator === "Yes"
        ? "the regulator has not been told yet"
        : "decide whether to tell the regulator",
      due: b.regulator_deadline,
      level: b.regulator_deadline < now ? "overdue" : "soon",
    });
  }

  const unhappy = await query<{ id: string; title: string }>(
    `select id, title from breaches
      where status <> 'Closed' and risk_level = 'High risk to people' and notify_people = 'Not decided'`,
  );
  for (const b of unhappy.rows) {
    items.push({
      kind: "Breach", screen: "breaches", id: b.id, title: b.title,
      detail: "high risk: decide whether to tell the people affected", due: "", level: "gap",
    });
  }

  const stale = await query<{ id: string; name: string; next_review: string; owner: string }>(
    `select id, name, next_review, owner from processing_activities
      where status <> 'Retired' and next_review <= $1`,
    [soon],
  );
  for (const a of stale.rows) {
    items.push({
      kind: "Data map review", screen: "datamap", id: a.id, title: a.name,
      detail: a.next_review < today
        ? `not reviewed for over 12 months${a.owner ? `, ask ${a.owner}` : ""}`
        : "the yearly review is due within a week",
      due: a.next_review, level: level(a.next_review),
    });
  }

  const noDpia = await query<{ id: string; name: string }>(
    `select a.id, a.name from processing_activities a
      where a.status <> 'Retired' and a.high_risk = 'Yes'
        and not exists (select 1 from dpias d where d.activity_id = a.id and d.status <> 'Not needed')`,
  );
  for (const a of noDpia.rows) {
    items.push({
      kind: "DPIA missing", screen: "dpias", id: a.id, title: a.name,
      detail: "marked high risk, but has no impact assessment", due: "", level: "gap",
    });
  }

  const noBasis = await query<{ id: string; name: string }>(
    `select id, name from processing_activities
      where status = 'Active' and lawful_basis = 'Not decided yet'`,
  );
  for (const a of noBasis.rows) {
    items.push({
      kind: "Lawful basis", screen: "datamap", id: a.id, title: a.name,
      detail: "in use, but no lawful basis chosen", due: "", level: "gap",
    });
  }

  const noDpa = await query<{ id: string; name: string; dpa_status: string }>(
    `select id, name, dpa_status from vendors
      where status <> 'Exited'
        and privacy_role in ('Processor', 'Sub-processor', 'Joint controller')
        and dpa_status in ('Missing', 'In progress')`,
  );
  for (const v of noDpa.rows) {
    items.push({
      kind: "Contract (DPA)", screen: "vendors", id: v.id, title: v.name,
      detail: v.dpa_status === "Missing" ? "no data processing agreement" : "data processing agreement not signed yet",
      due: "", level: "gap",
    });
  }

  const uncovered = await query<{ id: string; name: string }>(
    `select id, name from vendors
      where status <> 'Exited' and transfer = 'Yes'
        and transfer_safeguard in ('None yet', 'Not applicable')`,
  );
  for (const v of uncovered.rows) {
    items.push({
      kind: "Transfer", screen: "vendors", id: v.id, title: v.name,
      detail: "sends data outside the EU with nothing to cover it", due: "", level: "gap",
    });
  }

  const dated: { kind: string; screen: string; sql: string }[] = [
    {
      kind: "Consent review", screen: "consents",
      sql: `select id, purpose as title, next_review as due from consents
             where status = 'Active' and next_review <= $1`,
    },
    {
      kind: "DPIA review", screen: "dpias",
      sql: `select id, title, review_date as due from dpias
             where status = 'Approved' and review_date is not null and review_date <= $1`,
    },
    {
      kind: "Notice review", screen: "policies",
      sql: `select id, name as title, review_date as due from policies
             where doc_type in ('Privacy notice', 'Cookie notice')
               and review_date is not null and review_date <= $1`,
    },
    {
      kind: "Supplier review", screen: "vendors",
      sql: `select id, name as title, review_date as due from vendors
             where status <> 'Exited' and review_date is not null and review_date <= $1`,
    },
  ];
  for (const d of dated) {
    const { rows } = await query<{ id: string; title: string; due: string }>(d.sql, [soon]);
    for (const r of rows) {
      items.push({
        kind: d.kind, screen: d.screen, id: r.id, title: r.title,
        detail: r.due < today ? "review is overdue" : "review is due within a week",
        due: r.due, level: level(r.due),
      });
    }
  }

  const rank = { overdue: 0, soon: 1, gap: 2 } as const;
  return items.sort((a, b) =>
    rank[a.level] - rank[b.level] || (a.due || "9").localeCompare(b.due || "9") || a.title.localeCompare(b.title));
}

/** How many of each record there are, for the dashboard. */
export async function privacyCounts(): Promise<Record<string, number>> {
  const one = async (sql: string): Promise<number> =>
    (await query<{ n: number }>(sql)).rows[0]?.n ?? 0;
  return {
    activities: await one("select count(*) as n from processing_activities where status <> 'Retired'"),
    highRisk: await one("select count(*) as n from processing_activities where status <> 'Retired' and high_risk = 'Yes'"),
    dpias: await one("select count(*) as n from dpias where status <> 'Not needed'"),
    dpiasApproved: await one("select count(*) as n from dpias where status = 'Approved'"),
    requestsOpen: await one("select count(*) as n from subject_requests where status not in ('Done', 'Refused')"),
    requestsYear: await one("select count(*) as n from subject_requests where received_date >= date('now', '-12 months')"),
    breachesOpen: await one("select count(*) as n from breaches where status <> 'Closed'"),
    breachesYear: await one("select count(*) as n from breaches where aware_at >= date('now', '-12 months')"),
    processors: await one(
      "select count(*) as n from vendors where status <> 'Exited' and privacy_role in ('Processor', 'Sub-processor', 'Joint controller')",
    ),
    processorsSigned: await one(
      "select count(*) as n from vendors where status <> 'Exited' and privacy_role in ('Processor', 'Sub-processor', 'Joint controller') and dpa_status = 'Signed'",
    ),
    consents: await one("select count(*) as n from consents where status = 'Active'"),
  };
}

/** Local date and time on this server, the way the screens write them. */
function localNow(): { today: string; now: string } {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { today, now: `${today}T${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export async function privacyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/privacy/overview", { preHandler: canRead }, async () => {
    const { today, now } = localNow();
    return { counts: await privacyCounts(), attention: await privacyAttention(today, now) };
  });
}
