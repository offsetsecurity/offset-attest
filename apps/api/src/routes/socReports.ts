import type { FastifyInstance } from "fastify";
import { query } from "../db/pool.js";
import { canRead } from "../auth/rbac.js";
import { audit } from "../audit/audit.js";
import { notFound } from "../lib/errors.js";
import { hasFeature } from "../lib/pack.js";
import { loadOrganisation } from "./settings.js";
import { loadStored } from "../templates/answers.js";

/**
 * The SOC reports screen's helpers: what the CPA firm will ask for, and the
 * public trust page.
 *
 * The request list is the one a SOC 2 fieldwork team sends in some form every
 * time: populations for the period, and evidence by criterion. Each line is
 * checked against the records so the customer sees, before fieldwork, which
 * answers are already sitting in the product.
 */

export interface AuditorRequest {
  id: string;
  request: string;
  criteria: string;
  ready: boolean;
  /** What the product has for it, or what is missing. */
  detail: string;
  route: string;
}

const DAY = 86_400_000;
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

async function period(): Promise<{ start: string; end: string; label: string }> {
  // The report being worked towards, as on the Dashboard; failing that, the latest issued one.
  const pick = async (sql: string) =>
    (await query<{ title: string; period_start: string | null; period_end: string | null }>(sql)).rows[0];
  const e =
    (await pick(`select title, period_start, period_end from engagements
                  where status not in ('Report issued', 'Cancelled') and period_end is not null
                  order by period_end, seq limit 1`)) ??
    (await pick(`select title, period_start, period_end from engagements
                  where status = 'Report issued' and period_end is not null
                  order by period_end desc limit 1`));
  if (e?.period_end) {
    return { start: e.period_start ?? e.period_end, end: e.period_end, label: e.title };
  }
  return { start: iso(new Date(Date.now() - 365 * DAY)), end: iso(new Date()), label: "the last 12 months" };
}

export async function auditorRequests(): Promise<{ period: { start: string; end: string; label: string }; requests: AuditorRequest[] }> {
  const p = await period();
  const n = async (sql: string, params: unknown[] = []): Promise<number> =>
    (await query<{ n: number }>(sql, params)).rows[0]?.n ?? 0;
  const evidenceFor = (refs: string[]): Promise<number> =>
    n(
      `select count(distinct e.id) as n from evidence e join evidence_controls ec on ec.evidence_id = e.id
         join controls c on c.id = ec.control_id
        where c.ref in (${refs.map((_, i) => `$${i + 3}`).join(", ")}) and e.collected_date between $1 and $2`,
      [p.start, p.end, ...refs],
    );

  const scope = (await query<{ scope: string }>("select scope from programme where id = 1")).rows[0]?.scope?.trim() ?? "";
  const changes = await n("select count(*) as n from tasks where kind = 'Change' and coalesce(due_date, substr(created_at, 1, 10)) between $1 and $2", [p.start, p.end]);
  const training = await n("select count(*) as n from training where result = 'Completed'");
  const incidents = await n("select count(*) as n from incidents where coalesce(detected_date, substr(created_at, 1, 10)) between $1 and $2", [p.start, p.end]);
  const risks = await n("select count(*) as n from risks");
  const policies = await n("select count(*) as n from policies where status = 'Approved'");
  const draft = await n("select count(*) as n from policies where status <> 'Approved'");
  const vendors = await n("select count(*) as n from vendors where status <> 'Exited' and criticality = 'High'");
  const reviewed = await n("select count(*) as n from vendors where status <> 'Exited' and criticality = 'High' and trim(assurance) <> '' and assessed_date >= $1", [iso(new Date(Date.now() - 365 * DAY))]);
  const mgmt = await n("select count(*) as n from reviews where kind = 'Management review' and status = 'Completed'");
  const internal = await n("select count(*) as n from reviews where kind = 'Internal audit' and status = 'Completed'");

  const ev = async (id: string, request: string, refs: string[], what: string): Promise<AuditorRequest> => {
    const got = await evidenceFor(refs);
    return { id, request, criteria: refs.join(", "), ready: got > 0, route: "evidence",
      detail: got ? `${plural(got, "piece")} of evidence dated in the period` : `no ${what} dated in the period yet` };
  };

  const requests: AuditorRequest[] = [
    { id: "description", request: "System description, with boundaries and service commitments", criteria: "Description criteria",
      ready: Boolean(scope), detail: scope ? "written on Scope" : "not written yet", route: "soa" },
    { id: "policies", request: "Approved security policies", criteria: "CC5.3",
      ready: policies > 0 && draft === 0, detail: policies ? `${plural(policies, "approved policy", "approved policies")}${draft ? `, ${draft} still in draft` : ""}` : "none approved yet", route: "policies" },
    { id: "risk", request: "Risk assessment for the period", criteria: "CC3.1–CC3.4",
      ready: risks > 0, detail: risks ? `${plural(risks, "risk")} in the register` : "no risks recorded", route: "risks" },
    { id: "changes", request: "Population of production changes in the period", criteria: "CC8.1",
      ready: changes > 0, detail: changes ? `${plural(changes, "change")} recorded in Tasks` : "no changes recorded; export them from your ticketing tool", route: "tasks" },
    { id: "joiners", request: "New starters in the period, with training dates", criteria: "CC1.4, CC2.2",
      ready: training > 0, detail: training ? `${plural(training, "completed training record")}` : "no training recorded", route: "training" },
    { id: "leavers", request: "Leavers in the period, with access removal times", criteria: "CC6.2",
      ready: false, detail: "not kept in Attest; export it from your HR system and identity provider", route: "evidence" },
    await ev("access", "Quarterly user access reviews", ["CC6.2", "CC6.3"], "access reviews"),
    await ev("scans", "Vulnerability scans and remediation", ["CC7.1"], "scans"),
    await ev("pentest", "Penetration test report", ["CC4.1"], "penetration test"),
    await ev("backups", "Backup and restore test results", ["A1.2", "A1.3"], "restore tests"),
    { id: "incidents", request: "Incident log for the period", criteria: "CC7.3–CC7.5",
      ready: true, detail: incidents ? `${plural(incidents, "incident")} logged` : "no incidents logged; say so in writing", route: "incidents" },
    { id: "vendors", request: "Vendor list, with each critical vendor's SOC report reviewed", criteria: "CC9.2",
      ready: vendors > 0 && reviewed === vendors, detail: vendors ? `${reviewed} of ${vendors} critical vendors reviewed in the last year` : "no critical vendors recorded", route: "vendors" },
    { id: "oversight", request: "Board or management minutes discussing security", criteria: "CC1.2",
      ready: mgmt > 0, detail: mgmt ? `${plural(mgmt, "management review")} recorded` : "no management review recorded", route: "reviews" },
    { id: "monitoring", request: "Internal control review or readiness assessment", criteria: "CC4.1",
      ready: internal > 0, detail: internal ? `${plural(internal, "internal review")} completed` : "none completed yet", route: "reviews" },
  ];
  return { period: p, requests };
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const longDay = (d: string | null): string =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

/** A single self-contained HTML page the customer can put on their website. */
export async function trustPage(): Promise<string> {
  const { name } = await loadOrganisation();
  const org = name.trim() || "Our company";
  const stored = await loadStored();
  const contact = stored.values["security_contact"]?.trim() ?? "";
  const { rows } = await query<{ title: string; report: string; report_type: string; categories: string; period_start: string | null; period_end: string | null; report_date: string | null; opinion: string; next_due: string | null }>(
    `select title, report, report_type, categories, period_start, period_end, report_date, opinion, next_due
       from engagements where status = 'Report issued' order by report_date desc`,
  );
  const cards = rows.map((r) => `
      <div class="r">
        <div class="h"><b>${esc(r.report)}${r.report_type === "Not applicable" ? "" : ` ${esc(r.report_type)}`}</b><span>${r.opinion === "Unmodified" ? "Clean opinion" : esc(r.opinion)}</span></div>
        <p>${esc(r.categories || "Security")}</p>
        <p class="m">${r.report_type === "Type II" && r.period_start ? `Period ${longDay(r.period_start)} to ${longDay(r.period_end)}` : `As of ${longDay(r.period_end)}`} · issued ${longDay(r.report_date)}${r.next_due ? ` · next report due ${longDay(r.next_due)}` : ""}</p>
        <p class="a">${r.report === "SOC 3" ? "Public report: ask us for the PDF or download it below." : `Available under NDA${contact ? `: email <a href="mailto:${esc(contact)}">${esc(contact)}</a>` : ""}.`}</p>
      </div>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(org)} · Security and compliance</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f5f7fb;color:#0f172a;line-height:1.5}
main{max-width:760px;margin:0 auto;padding:48px 20px}
h1{font-size:28px;margin:0 0 6px}.lede{color:#475569;margin:0 0 28px}
.r{background:#fff;border:1px solid #e6eaf2;border-radius:14px;padding:18px 20px;margin-bottom:14px}
.h{display:flex;justify-content:space-between;gap:10px;align-items:center}.h b{font-size:17px}
.h span{background:#dcfce7;color:#166534;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700}
.r p{margin:6px 0 0}.m{color:#64748b;font-size:14px}.a{font-size:14px}
a{color:#2457d6}footer{color:#94a3b8;font-size:12px;margin-top:28px}
</style></head><body><main>
  <h1>${esc(org)} · Security and compliance</h1>
  <p class="lede">Independent CPA firms examine our controls every year. These are our current reports.</p>
  ${cards || '<div class="r"><p>Our first SOC report is in progress.</p></div>'}
  ${contact ? `<p>Questions about security: <a href="mailto:${esc(contact)}">${esc(contact)}</a></p>` : ""}
  <footer>Last updated ${longDay(iso(new Date()))}</footer>
</main></body></html>`;
}

export async function socReportRoutes(app: FastifyInstance): Promise<void> {
  const requireSoc = async (): Promise<void> => {
    if (!(await hasFeature("soc"))) throw notFound("This product has no SOC reports.");
  };

  app.get("/api/v1/soc/requests", { preHandler: canRead }, async () => {
    await requireSoc();
    return auditorRequests();
  });

  app.get("/api/v1/soc/requests.csv", { preHandler: canRead }, async (request, reply) => {
    await requireSoc();
    const { period: p, requests } = await auditorRequests();
    const cell = (v: string): string => `"${v.replace(/"/g, '""')}"`;
    const csv = [["Request", "Criteria", "Ready", "What we have", "Period"].map(cell).join(",")]
      .concat(requests.map((r) => [r.request, r.criteria, r.ready ? "Yes" : "No", r.detail, `${p.start} to ${p.end}`].map(cell).join(",")))
      .join("\r\n");
    await audit(request, { action: "Auditor request list exported", entity: "report", entityId: "auditor-requests" });
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="auditor-request-list.csv"')
      .send("﻿" + csv);
  });

  app.get("/api/v1/soc/trust-page", { preHandler: canRead }, async (request, reply) => {
    await requireSoc();
    const html = await trustPage();
    const download = (request.query as Record<string, string>)["download"] === "1";
    if (download) await audit(request, { action: "Trust page downloaded", entity: "report", entityId: "trust-page" });
    return reply
      .header("content-type", "text/html; charset=utf-8")
      .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
      .header("x-content-type-options", "nosniff")
      .header("content-disposition", `${download ? "attachment" : "inline"}; filename="trust.html"`)
      .send(html);
  });
}
