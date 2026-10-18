import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pool, query } from "../src/db/pool.js";
import { seedControls } from "../src/db/seed.js";
import { loadPackJourney } from "../src/journey/journey.js";
import { hasCheck } from "../src/journey/checks.js";

/**
 * Offset Attest's readiness plan, the checks written for it, and the SOC
 * reports register and PDFs.
 *
 * A SOC report is won or lost on scope, testing and dates, so the plan leans
 * on checks no other pack used before. Each one is exercised here against real
 * rows, because a check that is always green or never green looks exactly like
 * a working one on screen.
 */
const DB = process.env["E2E_DATABASE_URL"];
const maybe = DB ? describe : describe.skip;

const PACKS = resolve(process.cwd(), "../../packs");
const ATTEST_PACK = resolve(PACKS, "attest");

/** Every screen a plan step may send somebody to, and the feature that shows it. */
const SCREENS: Record<string, string | null> = {
  getready: "journey", dashboard: null, isms: "ismsScreen", profile: "tiers", soa: "statementOfApplicability",
  system: "baselines", controls: null, evidence: null, risks: null, assets: null,
  policies: null, tasks: null, incidents: null, findings: null, reports: null,
  people: null, backups: null, settings: null, audit: null,
  vendors: "ismsRegisters", engagements: "soc", datamap: "privacy", dpias: "privacy", requests: "privacy",
  breaches: "privacy", consents: "privacy", training: "ismsRegisters", objectives: "ismsRegisters",
  parties: "ismsRegisters", reviews: "ismsRegisters", communications: "ismsRegisters",
  calendar: "calendar", gaps: "gapAnalysis", help: "help", guides: "help",
};

interface PackTask { id: string; title: string; do: string; why: string; check?: string; goto?: string }

describe("readiness plans in every pack that ships one", () => {
  // Whatever packs are here. A written list fails in a repository that holds
  // one product, and silently skips a new one in a repository that holds five.
  const ids = readdirSync(PACKS, { withFileTypes: true })
    .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && existsSync(resolve(PACKS, d.name, "journey.json")))
    .map((d) => d.name);

  for (const id of ids) {
    it(`${id}: sends people only to screens its product shows`, async () => {
      const pack = JSON.parse(await readFile(resolve(PACKS, id, "pack.json"), "utf8")) as {
        features?: Record<string, boolean>;
      };
      const journey = JSON.parse(await readFile(resolve(PACKS, id, "journey.json"), "utf8")) as {
        stages: { tasks: PackTask[] }[];
      };
      expect(pack.features?.["journey"]).toBe(true);
      for (const t of journey.stages.flatMap((s) => s.tasks)) {
        if (!t.goto) continue;
        expect(Object.hasOwn(SCREENS, t.goto), `${t.id} goes to ${t.goto}, which is not a screen`).toBe(true);
        const needs = SCREENS[t.goto];
        if (needs) expect(pack.features?.[needs], `${t.id} goes to ${t.goto}, hidden in ${id}`).toBe(true);
      }
    });
  }
});

maybe("Offset Attest readiness plan", () => {
  let app: FastifyInstance;
  let sid = "";
  let csrf = "";

  const read = () => ({ cookie: `offset_sid=${sid}; offset_csrf=${csrf}` });
  const write = () => ({ ...read(), "x-csrf-token": csrf });

  interface Task { id: string; state: string; automatic: boolean; detail: string }
  interface Plan { stages: { id: string; tasks: Task[] }[] }

  const task = async (id: string): Promise<Task> => {
    const res = await app.inject({ url: "/api/v1/journey", headers: read() });
    expect(res.statusCode).toBe(200);
    const plan = res.json().journey as Plan;
    const t = plan.stages.flatMap((s) => s.tasks).find((x) => x.id === id);
    expect(t, `no task ${id}`).toBeTruthy();
    return t!;
  };

  beforeAll(async () => {
    process.env["PACK_DIR"] = ATTEST_PACK;
    await migrate();
    for (const t of [
      "audit_log", "sessions", "users", "evidence_controls", "risk_controls", "control_tests", "engagement_controls",
      "engagements", "controls", "programme", "risks", "evidence", "assets", "policies", "tasks", "findings",
      "journey_tasks", "settings", "reviews", "training", "vendors",
    ]) {
      await query(`delete from ${t}`);
    }
    await seedControls();

    app = await buildApp();
    await app.ready();

    const boot = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: {
        username: "admin", name: "Test Admin",
        email: "admin@example.test", password: "correct-horse-battery-staple",
      },
    });
    for (const c of boot.headers["set-cookie"] as string[]) {
      const m = /^(offset_sid|offset_csrf)=([^;]+)/.exec(c);
      if (m?.[1] === "offset_sid") sid = m[2]!;
      if (m?.[1] === "offset_csrf") csrf = m[2]!;
    }
  }, 60_000);

  afterAll(async () => {
    delete process.env["PACK_DIR"];
    await app?.close();
    await pool.end();
  });

  it("names only checks that exist, and says what and why for every step", async () => {
    const journey = await loadPackJourney();
    const ids = new Set<string>();
    let automatic = 0;
    for (const stage of journey.stages) {
      for (const t of stage.tasks) {
        expect(ids.has(t.id), `duplicate task id: ${t.id}`).toBe(false);
        ids.add(t.id);
        expect(t.do.length, `${t.id} has no instructions`).toBeGreaterThan(20);
        expect(t.why.length, `${t.id} does not say why it matters`).toBeGreaterThan(20);
        if (t.check) {
          automatic++;
          expect(hasCheck(t.check), `journey.json names a check that does not exist: ${t.check}`).toBe(true);
        }
      }
    }
    expect(journey.stages.map((s) => s.id)).toEqual(
      ["setup", "scope", "risk", "controls", "evidence", "test", "audit", "report"],
    );
    expect(automatic).toBeGreaterThan(20);
  });

  it("ships all 61 SOC 2 criteria and the SOC 1 objectives", async () => {
    const { rows } = await query<{ theme: string; n: number }>("select theme, count(*) as n from controls group by theme");
    const by = Object.fromEntries(rows.map((r) => [r.theme, r.n]));
    const soc2 = rows.filter((r) => r.theme !== "CO").reduce((n, r) => n + r.n, 0);
    expect(soc2).toBe(61);
    expect(by["CC6"]).toBe(8);
    expect(by["P"]).toBe(18);
    expect(by["CO"]).toBeGreaterThanOrEqual(10);
  });

  it("wants something ruled out of scope, and a reason for each exclusion", async () => {
    expect((await task("scope.categories")).state).toBe("outstanding");
    await query("update controls set status = 'not_applicable', justification = '' where theme = 'P'");
    expect((await task("scope.categories")).detail).toBe("18 items ruled out with no reason");
    await query("update controls set justification = 'No privacy commitments to customers' where theme = 'P'");
    const done = await task("scope.categories");
    expect(done.state).toBe("done");
    expect(done.detail).toBe("18 items ruled out, each with a reason");
  });

  it("wants every criterion in scope tested, and the last test passing", async () => {
    const { rows } = await query<{ id: string }>("select id from controls where status <> 'not_applicable'");
    expect((await task("test.all")).detail).toBe(`0 of ${rows.length} in scope tested`);
    expect((await task("test.fix")).detail).toBe("nothing tested yet");

    for (const r of rows) {
      await query(
        "insert into control_tests (id, control_id, tested_on, tester, result) values ($1, $2, '2026-01-10', 'Priya', 'Pass')",
        [randomUUID(), r.id],
      );
    }
    expect((await task("test.all")).state).toBe("done");
    expect((await task("test.fix")).state).toBe("done");

    // A later failure is what counts, not the earlier pass.
    await query(
      "insert into control_tests (id, control_id, tested_on, tester, result) values ($1, $2, '2026-02-10', 'Priya', 'Fail')",
      [randomUUID(), rows[0]!.id],
    );
    const fix = await task("test.fix");
    expect(fix.state).toBe("outstanding");
    expect(fix.detail).toBe("1 criterion failing their last test");
  });

  it("wants high-criticality vendors reviewed within the year, with their assurance", async () => {
    expect((await task("evidence.vendors")).detail).toBe("no high-criticality vendors recorded");
    await query(
      `insert into vendors (id, seq, name, criticality, status, assurance, assessed_date)
       values ($1, 1, 'Cloud host', 'High', 'Active', 'SOC 2 Type II', date('now', '-2 months')),
              ($2, 2, 'Identity provider', 'High', 'Active', '', date('now', '-2 months')),
              ($3, 3, 'Old host', 'High', 'Exited', '', null)`,
      [randomUUID(), randomUUID(), randomUUID()],
    );
    expect((await task("evidence.vendors")).detail).toBe("1 of 2 high-criticality vendors reviewed in the last 12 months");
    await query("update vendors set assurance = 'SOC 2 Type II' where name = 'Identity provider'");
    expect((await task("evidence.vendors")).state).toBe("done");
  });

  it("knows when the audit is booked and when the report is issued", async () => {
    expect((await task("audit.book")).state).toBe("outstanding");
    const created = await app.inject({
      method: "POST", url: "/api/v1/engagements", headers: write(),
      payload: {
        title: "SOC 2 Type II, 2026", report: "SOC 2", reportType: "Type II", auditor: "Example CPA LLP",
        periodStart: "2026-01-01", periodEnd: "2026-06-30", categories: "Security, Availability",
      },
    });
    expect(created.statusCode).toBe(201);
    expect((await task("audit.book")).state).toBe("done");
    expect((await task("report.issued")).detail).toBe("no report issued yet");

    const id = (created.json() as { engagement: { id: string } }).engagement.id;
    const issued = await app.inject({
      method: "PATCH", url: `/api/v1/engagements/${id}`, headers: write(),
      payload: { status: "Report issued", reportDate: "2026-08-15", opinion: "Unmodified" },
    });
    expect(issued.statusCode).toBe(200);
    expect((await task("report.issued")).detail).toBe("SOC 2 Type II, 2026, issued 2026-08-15");
  });

  it("refuses SOC reports a CPA firm would not issue", async () => {
    const post = (payload: Record<string, unknown>) =>
      app.inject({ method: "POST", url: "/api/v1/engagements", headers: write(), payload });
    expect((await post({ title: "x", report: "SOC 3", reportType: "Type I" })).statusCode).toBe(400);
    expect((await post({ title: "x", reportType: "Type II", periodStart: "2026-06-30", periodEnd: "2026-01-01" })).statusCode).toBe(400);
    expect((await post({ title: "x", status: "Report issued" })).statusCode).toBe(400);
    expect((await post({ title: "x", status: "Report issued", reportDate: "2026-01-01" })).statusCode).toBe(400);
    expect((await post({ title: "SOC 1 Type I", report: "SOC 1", reportType: "Type I", periodEnd: "2026-03-31" })).statusCode).toBe(201);
  });

  it("puts SOC reports on the calendar when the next one is due", async () => {
    await query("update engagements set next_due = date('now', '+20 days') where title = 'SOC 2 Type II, 2026'");
    const res = await app.inject({ url: "/api/v1/calendar?days=60", headers: read() });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).toContain("SOC report due");
  });

  it("renders the SOC 3 draft and both control matrices", async () => {
    const list = await app.inject({ url: "/api/v1/reports", headers: read() });
    const ids = (list.json() as { reports: { id: string }[] }).reports.map((r) => r.id);
    for (const id of ["soc3-report", "soc2-criteria-matrix", "soc1-objectives-matrix"]) {
      expect(ids, `${id} is not offered`).toContain(id);
      const res = await app.inject({ url: `/api/v1/reports/${id}`, headers: read() });
      expect(res.statusCode, id).toBe(200);
      expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    }
    // Nothing about GDPR in a SOC product.
    expect(ids).not.toContain("accountability-report");
  });
});
