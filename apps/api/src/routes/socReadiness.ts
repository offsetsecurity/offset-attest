import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../db/pool.js";
import { canRead, canWrite, requireAuth, assertCanWrite } from "../auth/rbac.js";
import { audit } from "../audit/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { hasFeature, readPack, themeOrder } from "../lib/pack.js";

/**
 * "If the auditor came today": what a CPA firm would most likely write up as
 * an exception, worked out from the records as they stand.
 *
 * It is a forecast, not an audit. Each rule is one a SOC examination really
 * applies - a control that failed its own test, a control claimed in place with
 * nothing to prove it, evidence older than the period, an overdue exception, a
 * subservice organisation nobody reviewed - so the list reads the way an
 * auditor's would, and each item says what to do about it.
 */

export type ExceptionLabel = "Fail" | "Gap" | "Stale" | "Partial";

export interface LikelyException {
  id: string;
  ref: string;
  title: string;
  label: ExceptionLabel;
  /** What the auditor would write. */
  says: string;
  /** What to do about it. */
  fix: string;
  action: { label: string; route: string };
  /** How many exceptions fixing this one removes. Drives "Fix these first". */
  weight: number;
  /** For a failed test: the control, so a passing retest can be recorded in place. */
  controlId?: string;
}

export interface QuickWin {
  id: string;
  title: string;
  count: number;
  minutes: number;
  route: string;
}

interface ControlRow {
  id: string; ref: string; title: string; theme: string; status: string; owner: string;
  evidence: number; fresh: number; last_result: string | null; last_test: string | null;
}

const DAY = 86_400_000;
const today = (): string => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

async function guideRecords(): Promise<Record<string, string>> {
  try {
    const g = await readPack<Record<string, { r?: string }>>("guide.json");
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.r ?? ""]));
  } catch {
    return {};
  }
}

async function themeNames(): Promise<Record<string, string>> {
  try {
    return await readPack<Record<string, string>>("themes.json");
  } catch {
    return {};
  }
}

export async function likelyExceptions(): Promise<LikelyException[]> {
  const [records, names, order] = await Promise.all([guideRecords(), themeNames(), themeOrder()]);
  const yearAgo = daysAgo(365);
  const { rows: controls } = await query<ControlRow>(
    `select c.id, c.ref, c.title, c.theme, c.status, c.owner,
            (select count(*) from evidence_controls ec where ec.control_id = c.id) as evidence,
            (select count(*) from evidence_controls ec join evidence e on e.id = ec.evidence_id
              where ec.control_id = c.id and e.collected_date >= $1) as fresh,
            (select t.result from control_tests t where t.control_id = c.id order by t.tested_on desc, t.created_at desc limit 1) as last_result,
            (select t.tested_on from control_tests t where t.control_id = c.id order by t.tested_on desc, t.created_at desc limit 1) as last_test
       from controls c where c.status <> 'not_applicable'`,
    [yearAgo],
  );
  const out: LikelyException[] = [];

  // A control that failed its own test: the auditor's sample would fail too.
  for (const c of controls) {
    if (c.last_result === "Fail" || c.last_result === "Partial") {
      out.push({
        id: `test:${c.ref}`, ref: c.ref, title: `${c.title}: last test ${c.last_result === "Fail" ? "failed" : "partly passed"} on ${c.last_test}`,
        label: c.last_result === "Fail" ? "Fail" : "Partial",
        says: `Your own test on ${c.last_test} found this was not fully working. An auditor sampling the same thing would find the same.`,
        fix: "Fix the cause, then test it again and record the result.",
        action: { label: "Record a new test", route: "controls" }, weight: 1, controlId: c.id,
      });
    }
  }

  // Claimed in place with nothing to prove it, or only old proof.
  for (const c of controls.filter((x) => x.status === "implemented")) {
    if (c.evidence === 0) {
      out.push({
        id: `noev:${c.ref}`, ref: c.ref, title: `${c.title}: marked in place, but nothing proves it`, label: "Gap",
        says: "The control is described as working, but there is no evidence an auditor could sample.",
        fix: records[c.ref] ? `Attach the records an auditor asks for: ${records[c.ref]}` : "Attach evidence that shows it working.",
        action: { label: "Attach evidence", route: "evidence" }, weight: 1,
      });
    } else if (c.fresh === 0) {
      out.push({
        id: `stale:${c.ref}`, ref: c.ref, title: `${c.title}: all its evidence is over a year old or undated`, label: "Stale",
        says: "The evidence does not fall inside the period, so it does not show the control working now.",
        fix: "Add evidence produced in the last year, with the date it was produced.",
        action: { label: "Add recent evidence", route: "evidence" }, weight: 1,
      });
    }
  }

  // Criteria not in place yet, one line per category so the list stays readable.
  const notYet = new Map<string, ControlRow[]>();
  for (const c of controls.filter((x) => x.status === "not_started" || x.status === "in_progress")) {
    notYet.set(c.theme, [...(notYet.get(c.theme) ?? []), c]);
  }
  for (const theme of [...notYet.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))) {
    const list = notYet.get(theme)!;
    out.push({
      id: `notyet:${theme}`, ref: theme,
      title: `${plural(list.length, "criterion", "criteria")} in ${names[theme] ?? theme} not in place yet`,
      label: "Gap",
      says: `There is no working control yet for ${list.map((c) => c.ref).join(", ")}.`,
      fix: "Open each criterion: it says what to do and which records to keep. Mark it in progress when work starts.",
      action: { label: "Open the criteria", route: "controls" }, weight: list.length,
    });
  }

  // Exceptions already raised and left past their date.
  const { rows: overdue } = await query<{ seq: number; title: string; clause: string; due_date: string; owner: string }>(
    `select seq, title, clause, due_date, owner from findings
      where status <> 'Closed' and due_date is not null and due_date < $1 order by due_date`,
    [today()],
  );
  for (const f of overdue) {
    out.push({
      id: `finding:${f.seq}`, ref: f.clause || "CC4.2", title: `${f.title}: past its due date (${f.due_date})`, label: "Fail",
      says: "A known weakness was not fixed by the date set for it. CC4.2 is tested by checking exactly this.",
      fix: `Fix it, or agree a new date with ${f.owner || "its owner"} and record why it moved.`,
      action: { label: "Open the exception", route: "findings" }, weight: 1,
    });
  }

  // Subservice organisations and other critical vendors nobody has reviewed.
  const { rows: vendors } = await query<{ seq: number; name: string; assurance: string; assessed_date: string | null }>(
    `select seq, name, assurance, assessed_date from vendors
      where status <> 'Exited' and criticality = 'High'
        and (trim(assurance) = '' or assessed_date is null or assessed_date < $1) order by name`,
    [yearAgo],
  );
  for (const v of vendors) {
    out.push({
      id: `vendor:${v.seq}`, ref: "CC9.2", title: `${v.name}: ${v.assurance.trim() ? "not reviewed in the last 12 months" : "no SOC report or other assurance recorded"}`,
      label: "Stale",
      says: "A critical vendor's assurance was not reviewed in the period. Having their report is not the same as reviewing it.",
      fix: "Read their latest SOC report, note any exceptions and the controls they expect from you, and set the date you assessed them.",
      action: { label: "Review the vendor", route: "vendors" }, weight: 1,
    });
  }

  // Policies that are not approved, or are past their review date.
  const { rows: policies } = await query<{ seq: number; name: string; status: string; review_date: string | null }>(
    `select seq, name, status, review_date from policies
      where status <> 'Approved' or (review_date is not null and review_date < $1) order by name`,
    [today()],
  );
  for (const p of policies) {
    const late = p.status === "Approved";
    out.push({
      id: `policy:${p.seq}`, ref: "CC5.3", title: late ? `${p.name}: past its review date` : `${p.name}: not approved`,
      label: late ? "Stale" : "Gap",
      says: late ? "The policy was not reviewed when it said it would be." : "Controls must be put in place through approved policies.",
      fix: late ? "Review it, update the version if anything changed, and set the next review date." : "Send it to the approver and record the approval date.",
      action: { label: "Open the policy", route: "policies" }, weight: 1,
    });
  }

  const rank: Record<ExceptionLabel, number> = { Fail: 0, Gap: 1, Partial: 2, Stale: 3 };
  return out.sort((a, b) => rank[a.label] - rank[b.label] || b.weight - a.weight);
}

async function quickWins(): Promise<QuickWin[]> {
  const n = async (sql: string, params: unknown[] = []): Promise<number> =>
    (await query<{ n: number }>(sql, params)).rows[0]?.n ?? 0;
  const wins: QuickWin[] = [
    { id: "owners", title: "Set an owner on criteria that have none", minutes: 1,
      count: await n("select count(*) as n from controls where status <> 'not_applicable' and trim(owner) = ''"), route: "controls" },
    { id: "policyDates", title: "Add a review date to policies that have none", minutes: 1,
      count: await n("select count(*) as n from policies where review_date is null"), route: "policies" },
    { id: "evidenceDates", title: "Date evidence that has no date", minutes: 1,
      count: await n("select count(*) as n from evidence where collected_date is null"), route: "evidence" },
    { id: "vendorDates", title: "Record when you last assessed critical vendors", minutes: 2,
      count: await n("select count(*) as n from vendors where status <> 'Exited' and criticality = 'High' and assessed_date is null"), route: "vendors" },
    { id: "findingOwners", title: "Give open exceptions an owner and a due date", minutes: 1,
      count: await n("select count(*) as n from findings where status <> 'Closed' and (trim(owner) = '' or due_date is null)"), route: "findings" },
  ];
  return wins.filter((w) => w.count > 0);
}

/** The report being worked towards: the soonest unfinished one with a period. */
async function activeEngagement(): Promise<{ title: string; report: string; reportType: string; periodStart: string | null; periodEnd: string | null; daysToEnd: number | null } | null> {
  const { rows } = await query<{ title: string; report: string; report_type: string; period_start: string | null; period_end: string | null }>(
    `select title, report, report_type, period_start, period_end from engagements
      where status not in ('Report issued', 'Cancelled') order by period_end is null, period_end, seq limit 1`,
  );
  const e = rows[0];
  if (!e) return null;
  const daysToEnd = e.period_end ? Math.ceil((Date.parse(`${e.period_end}T00:00:00Z`) - Date.now()) / DAY) : null;
  return { title: e.title, report: e.report, reportType: e.report_type, periodStart: e.period_start, periodEnd: e.period_end, daysToEnd };
}

const bulkBody = z
  .object({
    theme: z.string().min(1).max(40),
    owner: z.string().max(200).optional(),
    outOfScope: z.string().max(2000).optional(),
  })
  .strict();

export async function socReadinessRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/soc/readiness", { preHandler: canRead }, async () => {
    if (!(await hasFeature("soc"))) throw notFound("This product has no SOC readiness view.");
    const [exceptions, wins, engagement] = await Promise.all([likelyExceptions(), quickWins(), activeEngagement()]);
    const fixFirst = [...exceptions].sort((a, b) => b.weight - a.weight).slice(0, 3);
    return { ranAt: new Date().toISOString(), engagement, exceptions, fixFirst, quickWins: wins };
  });

  /**
   * One owner for a whole category, or a whole category out of scope.
   *
   * The two decisions a team makes by category rather than by criterion, and
   * the two that otherwise take eighteen clicks. One audit row per criterion,
   * so the trail still says what happened to each.
   */
  app.post("/api/v1/controls/bulk", { preHandler: canWrite }, async (request) => {
    if (!(await hasFeature("soc"))) throw notFound("This product has no bulk update.");
    requireAuth(request);
    assertCanWrite(request.user.role);
    const body = bulkBody.parse(request.body);
    if (body.owner === undefined && body.outOfScope === undefined) throw badRequest("Say what to change: an owner, or out of scope with a reason.");
    if (body.outOfScope !== undefined && !body.outOfScope.trim()) throw badRequest("Say why this category is out of scope.");

    const { rows } = await query<{ id: string; ref: string; owner: string; status: string; justification: string }>(
      "select id, ref, owner, status, justification from controls where theme = $1",
      [body.theme],
    );
    if (!rows.length) throw notFound("No such category.");
    const targets = body.owner !== undefined ? rows.filter((r) => r.status !== "not_applicable") : rows;

    await withTransaction(async (tx) => {
      for (const r of targets) {
        if (body.owner !== undefined) {
          await tx.query("update controls set owner = $1 where id = $2", [body.owner.trim(), r.id]);
        } else {
          await tx.query("update controls set status = 'not_applicable', justification = $1 where id = $2", [body.outOfScope!.trim(), r.id]);
        }
      }
    });
    for (const r of targets) {
      await audit(request, {
        action: "Control updated",
        entity: "control",
        entityId: r.ref,
        before: { owner: r.owner, status: r.status, justification: r.justification },
        after: body.owner !== undefined
          ? { owner: body.owner.trim(), status: r.status, justification: r.justification }
          : { owner: r.owner, status: "not_applicable", justification: body.outOfScope!.trim() },
      });
    }
    return { updated: targets.length };
  });
}
