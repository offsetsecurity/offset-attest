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
 * Offset Accord's readiness plan, and the checks written for it.
 *
 * GDPR is about the records - the data map, DPIAs, processor contracts - so
 * its plan leans on checks no other pack used before. Each one is exercised here against real
 * rows, because a check that is always green or never green looks exactly like
 * a working one on screen.
 */
const DB = process.env["E2E_DATABASE_URL"];
const maybe = DB ? describe : describe.skip;

const PACKS = resolve(process.cwd(), "../../packs");
const ACCORD_PACK = resolve(PACKS, "accord");

/** Every screen a plan step may send somebody to, and the feature that shows it. */
const SCREENS: Record<string, string | null> = {
  getready: "journey", dashboard: null, isms: "ismsScreen", profile: "tiers", soa: "statementOfApplicability",
  system: "baselines", controls: null, evidence: null, risks: null, assets: null,
  policies: null, tasks: null, incidents: null, findings: null, reports: null,
  people: null, backups: null, settings: null, audit: null,
  vendors: "privacy", datamap: "privacy", dpias: "privacy", requests: "privacy",
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

maybe("Offset Accord readiness plan", () => {
  let app: FastifyInstance;
  let sid = "";
  let csrf = "";

  const read = () => ({ cookie: `offset_sid=${sid}; offset_csrf=${csrf}` });

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
    process.env["PACK_DIR"] = ACCORD_PACK;
    await migrate();
    for (const t of [
      "audit_log", "sessions", "users", "evidence_controls", "risk_controls", "controls",
      "programme", "risks", "evidence", "assets", "policies", "tasks", "findings",
      "journey_tasks", "settings", "dpias", "consents", "activity_vendors", "processing_activities", "vendors",
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
      ["setup", "map", "tell", "risk", "suppliers", "ready", "prove"],
    );
    expect(automatic).toBeGreaterThan(15);
  });

  it("wants a lawful basis and an owner on everything in use", async () => {
    expect((await task("map.start")).detail).toBe("the data map is empty");
    expect((await task("map.basis")).state).toBe("outstanding");

    await query(
      `insert into processing_activities (id, seq, name, lawful_basis, owner, owner_email, status)
       values ($1, 1, 'Payroll', 'Legal obligation', 'Priya', 'priya@example.test', 'Active'),
              ($2, 2, 'Newsletter', 'Not decided yet', '', '', 'Draft'),
              ($3, 3, 'Old CCTV', 'Not decided yet', '', '', 'Retired')`,
      [randomUUID(), randomUUID(), randomUUID()],
    );
    expect((await task("map.start")).detail).toBe("2 processing activities on the data map");
    let basis = await task("map.basis");
    expect(basis.state).toBe("outstanding");
    expect(basis.detail).toBe("1 of 2 still need a lawful basis");
    expect((await task("map.owners")).detail).toBe("1 of 2 have no owner or no email");

    await query(
      "update processing_activities set lawful_basis = 'Consent', owner = 'Sam', owner_email = 'sam@example.test' where seq = 2",
    );
    basis = await task("map.basis");
    expect(basis.state).toBe("done");
    expect((await task("map.owners")).state).toBe("done");
  });

  it("asks for a DPIA on every high-risk entry, and only those", async () => {
    let t = await task("risk.screen");
    expect(t.detail).toBe("2 of 2 not yet checked for high risk");
    expect((await task("risk.dpia")).detail).toBe("nothing is marked high risk");

    await query("update processing_activities set high_risk = 'No' where seq = 1");
    await query("update processing_activities set high_risk = 'Yes' where seq = 2");
    expect((await task("risk.screen")).state).toBe("done");
    t = await task("risk.dpia");
    expect(t.state).toBe("outstanding");
    expect(t.detail).toBe("1 of 1 high-risk entries have no DPIA");

    // A DPIA that concluded none was needed does not count as one.
    await query(
      `insert into dpias (id, seq, title, activity_id, status)
       select $1, 1, 'Newsletter DPIA', id, 'Not needed' from processing_activities where seq = 2`,
      [randomUUID()],
    );
    expect((await task("risk.dpia")).state).toBe("outstanding");
    await query("update dpias set status = 'In progress'");
    expect((await task("risk.dpia")).state).toBe("done");
  });

  it("wants consent recorded only where something relies on it", async () => {
    let t = await task("tell.consent");
    expect(t.state).toBe("outstanding");
    expect(t.detail).toBe("entries rely on consent, but no consent record exists");

    await query("insert into consents (id, seq, purpose) values ($1, 1, 'Newsletter sign-up')", [randomUUID()]);
    t = await task("tell.consent");
    expect(t.state).toBe("done");
  });

  it("counts only approved privacy notices", async () => {
    expect((await task("tell.notice")).state).toBe("outstanding");
    await query(
      `insert into policies (id, seq, name, doc_type, status)
       values ($1, 1, 'Customer privacy notice', 'Privacy notice', 'Draft')`,
      [randomUUID()],
    );
    expect((await task("tell.notice")).state).toBe("outstanding");
    await query("update policies set status = 'Approved'");
    expect((await task("tell.notice")).detail).toBe("1 approved privacy notice");
  });

  it("wants a signed DPA with every processor, and every transfer covered", async () => {
    expect((await task("suppliers.list")).state).toBe("outstanding");
    const payroll = randomUUID();
    await query(
      `insert into vendors (id, seq, name, status, privacy_role, dpa_status, transfer, transfer_safeguard)
       values ($1, 1, 'Payroll Co', 'Active', 'Processor', 'Missing', 'Yes', 'None yet'),
              ($2, 2, 'Tax office', 'Active', 'Separate controller', 'Not needed', 'No', 'Not applicable')`,
      [payroll, randomUUID()],
    );
    expect((await task("suppliers.list")).detail).toBe("1 processor recorded");
    expect((await task("suppliers.dpa")).detail).toBe("1 of 1 have no signed agreement");
    expect((await task("suppliers.transfers")).state).toBe("outstanding");

    await query(
      "update vendors set dpa_status = 'Signed', transfer_safeguard = 'Standard contractual clauses' where id = $1",
      [payroll],
    );
    expect((await task("suppliers.dpa")).state).toBe("done");
    expect((await task("suppliers.transfers")).state).toBe("done");
  });

  it("chases entries not reviewed for 12 months", async () => {
    await query("update processing_activities set last_reviewed = date('now', '-13 months') where seq = 1");
    let t = await task("prove.review");
    expect(t.state).toBe("outstanding");
    expect(t.detail).toBe("1 not reviewed for over 12 months");

    await query("update processing_activities set last_reviewed = date('now') where seq = 1");
    t = await task("prove.review");
    expect(t.state).toBe("done");
  });
});
