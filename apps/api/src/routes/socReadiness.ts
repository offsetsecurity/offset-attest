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

// ── the Dashboard: where you stand, and where you are heading ────────────────

export interface SocDashboard {
  readyPct: number;
  engagement: {
    title: string; report: string; reportType: string;
    periodStart: string | null; periodEnd: string | null; daysToEnd: number | null; daysToStart: number | null;
  } | null;
  /** Today's pace, as the date readiness reaches 100%. Null when there is no pace yet. */
  projectedReady: string | null;
  /** Readiness history, one point a day, oldest first. */
  trend: { day: string; pct: number }[];
  /** How a CPA firm would see each criterion in scope. */
  lens: { ready: number; questions: number; exceptions: number; total: number };
  timeline: { months: string[]; rows: { ref: string; title: string; counts: number[] }[]; currentMonth: number };
  team: { owner: string; total: number; implemented: number }[];
  weakest: { theme: string; name: string; pct: number; implemented: number; total: number } | null;
  weekChange: number;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const monthKey = (d: string): string => d.slice(0, 7);

export async function socDashboard(): Promise<SocDashboard> {
  const yearAgo = daysAgo(365);
  const names = await themeNames();
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
  const implemented = controls.filter((c) => c.status === "implemented");
  const readyPct = controls.length ? Math.round((implemented.length / controls.length) * 100) : 0;

  // The auditor's eye: sampled cleanly, questioned, or written up.
  const lens = { ready: 0, questions: 0, exceptions: 0, total: controls.length };
  for (const c of controls) {
    const failing = c.last_result === "Fail" || c.last_result === "Partial";
    if (c.status !== "implemented" || failing || c.evidence === 0) lens.exceptions++;
    else if (c.fresh === 0 || !c.last_test) lens.questions++;
    else lens.ready++;
  }

  const eng = await activeEngagement();
  const engagement = eng
    ? { ...eng, daysToStart: eng.periodStart ? Math.ceil((Date.parse(`${eng.periodStart}T00:00:00Z`) - Date.now()) / DAY) : null }
    : null;

  // Pace: the line through the last four weeks of the daily snapshots, plus today.
  const { rows: history } = await query<{ day: string; pct: number }>(
    "select day, pct from trend where day >= $1 order by day", [daysAgo(120)],
  );
  const trend = history.filter((h) => h.day !== today()).concat([{ day: today(), pct: readyPct }]);
  const recent = trend.filter((t) => t.day >= daysAgo(28));
  let projectedReady: string | null = null;
  if (readyPct >= 100) projectedReady = today();
  else if (recent.length >= 2) {
    const xs = recent.map((t) => Date.parse(`${t.day}T00:00:00Z`) / DAY);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = recent.reduce((a, t) => a + t.pct, 0) / recent.length;
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = den ? xs.reduce((a, x, i) => a + (x - mx) * (recent[i]!.pct - my), 0) / den : 0;
    if (slope > 0.01) projectedReady = iso(new Date(Date.now() + ((100 - readyPct) / slope) * DAY));
  }
  const weekAgo = trend.find((t) => t.day >= daysAgo(7));
  const weekChange = weekAgo ? readyPct - weekAgo.pct : 0;

  // Evidence by month across the period (or the last six months without one).
  const start = engagement?.periodStart ?? daysAgo(150);
  const end = engagement?.periodEnd && engagement.periodEnd > start ? engagement.periodEnd : iso(new Date(Date.now() + 30 * DAY));
  const months: string[] = [];
  for (let d = new Date(`${monthKey(start)}-01T00:00:00Z`); monthKey(iso(d)) <= monthKey(end) && months.length < 12; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push(monthKey(iso(d)));
  }
  const { rows: ev } = await query<{ ref: string; title: string; month: string; n: number }>(
    `select c.ref, c.title, substr(e.collected_date, 1, 7) as month, count(*) as n
       from evidence_controls ec join evidence e on e.id = ec.evidence_id join controls c on c.id = ec.control_id
      where c.status <> 'not_applicable' and e.collected_date is not null
      group by c.ref, c.title, month`,
  );
  const byRef = new Map<string, { ref: string; title: string; counts: number[] }>();
  for (const r of ev) {
    const i = months.indexOf(r.month);
    if (i < 0) continue;
    const row = byRef.get(r.ref) ?? { ref: r.ref, title: r.title, counts: months.map(() => 0) };
    row.counts[i] = (row.counts[i] ?? 0) + r.n;
    byRef.set(r.ref, row);
  }
  const rows = [...byRef.values()]
    .sort((a, b) => b.counts.filter(Boolean).length - a.counts.filter(Boolean).length || a.ref.localeCompare(b.ref))
    .slice(0, 8);

  // Who is carrying it, and the weakest category in scope.
  const byOwner = new Map<string, { owner: string; total: number; implemented: number }>();
  for (const c of controls) {
    const key = c.owner.trim() || "Unassigned";
    const o = byOwner.get(key) ?? { owner: key, total: 0, implemented: 0 };
    o.total++;
    if (c.status === "implemented") o.implemented++;
    byOwner.set(key, o);
  }
  const team = [...byOwner.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  const byTheme = new Map<string, { total: number; implemented: number }>();
  for (const c of controls) {
    const t = byTheme.get(c.theme) ?? { total: 0, implemented: 0 };
    t.total++;
    if (c.status === "implemented") t.implemented++;
    byTheme.set(c.theme, t);
  }
  const weakestEntry = [...byTheme.entries()].sort((a, b) => a[1].implemented / a[1].total - b[1].implemented / b[1].total)[0];
  const weakest = weakestEntry
    ? { theme: weakestEntry[0], name: names[weakestEntry[0]] ?? weakestEntry[0], pct: Math.round((weakestEntry[1].implemented / weakestEntry[1].total) * 100), ...weakestEntry[1] }
    : null;

  return {
    readyPct, engagement, projectedReady, trend, lens,
    timeline: { months, rows, currentMonth: months.indexOf(monthKey(today())) },
    team, weakest, weekChange,
  };
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

  app.get("/api/v1/soc/dashboard", { preHandler: canRead }, async () => {
    if (!(await hasFeature("soc"))) throw notFound("This product has no SOC dashboard.");
    return socDashboard();
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
