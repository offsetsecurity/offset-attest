import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { seedIfEmpty } from "../src/db/seed.js";
import { pool, query } from "../src/db/pool.js";
import { readZip } from "../src/lib/zip.js";
import type { Manifest } from "../src/templates/answers.js";

/**
 * The SOC policy templates: every blank has a name the product knows, the
 * answers typed once land in every document, and the tables fill from the
 * registers. Built by docs/dev/build-soc-templates.py.
 */
const DB = process.env["E2E_DATABASE_URL"];
const PACK = resolve(process.cwd(), "../../packs/attest");
const DIR = resolve(PACK, "templates");
const manifest = JSON.parse(readFileSync(resolve(DIR, "fields.json"), "utf8")) as Manifest;
const maybe = DB ? describe : describe.skip;

const SPECIAL = new Set(["$owner", "$approver", "$version", "$approval_date", "$next_review", "$classification"]);
const xmlOf = (buf: Buffer, part = "word/document.xml"): string =>
  readZip(buf).find((e) => e.name === part)?.data.toString("utf8") ?? "";
const tags = (xml: string): string[] => [...xml.matchAll(/<w:tag w:val="([^"]*)"\/>/g)].map((m) => m[1]!);

describe("SOC templates as shipped", () => {
  it("names every blank with something the product can answer", () => {
    const shared = new Set(manifest.shared.map((s) => s.name));
    for (const doc of manifest.documents) {
      const file = readFileSync(resolve(DIR, doc.file));
      for (const tag of [...tags(xmlOf(file)), ...tags(xmlOf(file, "word/header1.xml"))]) {
        const known = SPECIAL.has(tag) || shared.has(tag) || tag in doc.fields;
        expect(known, `${doc.file}: blank "${tag}"`).toBe(true);
      }
      for (const s of doc.shared) expect(shared.has(s), `${doc.file} uses ${s}`).toBe(true);
    }
  });

  it("lists in index.json exactly the documents fields.json can fill", () => {
    const index = JSON.parse(readFileSync(resolve(DIR, "index.json"), "utf8")) as { documents: { file: string }[] };
    expect(index.documents.map((d) => d.file).sort()).toEqual(manifest.documents.map((d) => d.file).sort());
    expect(readdirSync(DIR).filter((f) => f.endsWith(".docx")).length).toBe(manifest.documents.length);
  });
});

maybe("SOC templates filled in", { timeout: 60_000 }, () => {
  let app: FastifyInstance;
  let sid = "";
  let csrf = "";
  const auth = () => ({ cookie: `offset_sid=${sid}; offset_csrf=${csrf}`, "x-csrf-token": csrf });

  beforeAll(async () => {
    process.env["PACK_DIR"] = PACK;
    await migrate();
    await seedIfEmpty();
    for (const t of ["audit_log", "sessions", "users", "settings", "vendors", "risks", "programme"]) {
      await query(`delete from ${t}`);
    }
    app = await buildApp();
    await app.ready();
    const boot = await app.inject({
      method: "POST", url: "/api/v1/auth/bootstrap",
      payload: { username: "socadmin", name: "SOC Admin", email: "soc@example.test", password: "correct-horse-battery-staple" },
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

  it("puts the company, the registers and the scope into the documents", async () => {
    const before = await app.inject({ url: "/api/v1/templates", headers: auth() });
    expect(before.statusCode).toBe(200);
    const leftBefore = (before.json() as { status: { left: number }[] }).status.reduce((n, s) => n + s.left, 0);

    await query(
      "insert into vendors (id, seq, name, service, criticality, status, assurance) values ($1, 1, 'Example Cloud', 'Hosting', 'High', 'Active', 'SOC 2 Type II')",
      [randomUUID()],
    );
    await query("insert or ignore into programme (id) values (1)");
    await query("update programme set scope = 'The Acme Payroll platform and its AWS account.', methodology = '99.9% monthly uptime.' where id = 1");

    const saved = await app.inject({
      method: "PUT", url: "/api/v1/templates/answers", headers: auth(),
      payload: { values: { company: "Acme Ltd", system_name: "Acme Payroll", security_owner: "Head of Security" }, lists: {} },
    });
    expect(saved.statusCode).toBe(200);
    const leftAfter = (saved.json() as { status: { left: number }[] }).status.reduce((n, s) => n + s.left, 0);
    expect(leftAfter).toBeLessThan(leftBefore);

    const vendor = await app.inject({ url: "/api/v1/templates/filled/09_Vendor_Management_Policy.docx", headers: auth() });
    expect(vendor.statusCode).toBe(200);
    const vx = xmlOf(vendor.rawPayload);
    expect(vx).toContain("Acme Ltd");
    expect(vx).toContain("Example Cloud");
    expect(vx).not.toContain("How to use this template");
    expect(xmlOf(vendor.rawPayload, "word/header1.xml")).toContain("Acme Ltd");

    const desc = await app.inject({ url: "/api/v1/templates/filled/00_System_Description.docx", headers: auth() });
    const dx = xmlOf(desc.rawPayload);
    expect(dx).toContain("The Acme Payroll platform and its AWS account.");
    expect(dx).toContain("99.9% monthly uptime.");

    const zip = await app.inject({ url: "/api/v1/templates/filled.zip", headers: auth() });
    expect(zip.statusCode).toBe(200);
    expect(readZip(zip.rawPayload).length).toBe(manifest.documents.length);
  });

  it("refuses an answer to a blank no template has", async () => {
    const res = await app.inject({
      method: "PUT", url: "/api/v1/templates/answers", headers: auth(),
      payload: { values: { nonsense: "x" }, lists: {} },
    });
    expect(res.statusCode).toBe(400);
  });
});
