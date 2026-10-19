import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pool, query } from "../src/db/pool.js";
import { seedControls } from "../src/db/seed.js";

/**
 * "If the auditor came today", fix-first, quick wins and the bulk change behind
 * Get ready. Each rule is driven from real rows, so a rule that never fires (or
 * always does) shows up here rather than on a customer's screen.
 */
const DB = process.env["E2E_DATABASE_URL"];
const maybe = DB ? describe : describe.skip;
const PACK = resolve(process.cwd(), "../../packs/attest");

interface Ready {
  exceptions: { id: string; ref: string; label: string; weight: number; controlId?: string }[];
  fixFirst: { id: string; weight: number }[];
  quickWins: { id: string; count: number }[];
  engagement: { title: string; daysToEnd: number | null } | null;
}

maybe("SOC readiness", () => {
  let app: FastifyInstance;
  let sid = "";
  let csrf = "";
  const read = () => ({ cookie: `offset_sid=${sid}; offset_csrf=${csrf}` });
  const write = () => ({ ...read(), "x-csrf-token": csrf });
  const ready = async (): Promise<Ready> => {
    const res = await app.inject({ url: "/api/v1/soc/readiness", headers: read() });
    expect(res.statusCode).toBe(200);
    return res.json() as Ready;
  };
  const idOf = async (ref: string): Promise<string> =>
    (await query<{ id: string }>("select id from controls where ref = $1", [ref])).rows[0]!.id;

  beforeAll(async () => {
    process.env["PACK_DIR"] = PACK;
    await migrate();
    for (const t of ["audit_log", "sessions", "users", "evidence_controls", "evidence", "control_tests", "engagement_controls",
      "engagements", "findings", "vendors", "policies", "controls"]) {
      await query(`delete from ${t}`);
    }
    await seedControls();
    app = await buildApp();
    await app.ready();
    const boot = await app.inject({
      method: "POST", url: "/api/v1/auth/bootstrap",
      payload: { username: "admin", name: "Admin", email: "admin@example.test", password: "correct-horse-battery-staple" },
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

  it("starts with one 'not in place' line per category, weighted by its size", async () => {
    const r = await ready();
    const cc6 = r.exceptions.find((e) => e.id === "notyet:CC6")!;
    expect(cc6.weight).toBe(8);
    expect(r.fixFirst[0]!.weight).toBeGreaterThanOrEqual(r.fixFirst[1]!.weight);
    expect(r.quickWins.find((w) => w.id === "owners")!.count).toBe(73);
    expect(r.engagement).toBeNull();
  });

  it("marks a whole category out of scope, and it leaves the list", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/controls/bulk", headers: write(),
      payload: { theme: "P", outOfScope: "No privacy commitments to customers" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(18);
    expect((await ready()).exceptions.some((e) => e.id === "notyet:P")).toBe(false);
    const refused = await app.inject({ method: "POST", url: "/api/v1/controls/bulk", headers: write(),
      payload: { theme: "C1", outOfScope: "  " } });
    expect(refused.statusCode).toBe(400);
  });

  it("gives a whole category one owner, skipping what is out of scope", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/controls/bulk", headers: write(),
      payload: { theme: "CC6", owner: "Priya" } });
    expect(res.json().updated).toBe(8);
    const { rows } = await query<{ n: number }>("select count(*) as n from controls where theme = 'CC6' and owner = 'Priya'");
    expect(rows[0]!.n).toBe(8);
  });

  it("writes up a failed test, and a passing retest clears it", async () => {
    const id = await idOf("CC6.2");
    await query("insert into control_tests (id, control_id, tested_on, tester, result) values ($1, $2, '2026-03-01', 'Priya', 'Fail')", [randomUUID(), id]);
    const failing = (await ready()).exceptions.find((e) => e.id === "test:CC6.2")!;
    expect(failing.label).toBe("Fail");
    expect(failing.controlId).toBe(id);
    await query("insert into control_tests (id, control_id, tested_on, tester, result) values ($1, $2, '2026-04-01', 'Priya', 'Pass')", [randomUUID(), id]);
    expect((await ready()).exceptions.some((e) => e.id === "test:CC6.2")).toBe(false);
  });

  it("writes up a criterion claimed in place with no proof, then with only old proof", async () => {
    const id = await idOf("CC8.1");
    await query("update controls set status = 'implemented' where id = $1", [id]);
    expect((await ready()).exceptions.find((e) => e.id === "noev:CC8.1")?.label).toBe("Gap");
    const ev = randomUUID();
    await query("insert into evidence (id, name, collected_date) values ($1, 'Old change log', date('now', '-2 years'))", [ev]);
    await query("insert into evidence_controls (evidence_id, control_id) values ($1, $2)", [ev, id]);
    const r = await ready();
    expect(r.exceptions.some((e) => e.id === "noev:CC8.1")).toBe(false);
    expect(r.exceptions.find((e) => e.id === "stale:CC8.1")?.label).toBe("Stale");
  });

  it("writes up overdue exceptions, unreviewed critical vendors and unapproved policies", async () => {
    await query("insert into findings (id, seq, title, status, due_date, clause) values ($1, 1, 'Pen test finding', 'Open', date('now', '-5 days'), 'CC7.1')", [randomUUID()]);
    await query("insert into vendors (id, seq, name, criticality, status, assurance) values ($1, 1, 'Cloud host', 'High', 'Active', '')", [randomUUID()]);
    await query("insert into policies (id, seq, name, status) values ($1, 1, 'Access Control Policy', 'Draft')", [randomUUID()]);
    const r = await ready();
    expect(r.exceptions.find((e) => e.id === "finding:1")?.ref).toBe("CC7.1");
    expect(r.exceptions.find((e) => e.id === "vendor:1")?.ref).toBe("CC9.2");
    expect(r.exceptions.find((e) => e.id === "policy:1")?.label).toBe("Gap");
  });

  it("knows the report being worked towards", async () => {
    await app.inject({ method: "POST", url: "/api/v1/engagements", headers: write(),
      payload: { title: "SOC 2 Type II, 2027", reportType: "Type II", periodStart: "2027-01-01", periodEnd: "2027-06-30" } });
    const e = (await ready()).engagement!;
    expect(e.title).toBe("SOC 2 Type II, 2027");
    expect(e.daysToEnd).toBeGreaterThan(0);
  });
});
