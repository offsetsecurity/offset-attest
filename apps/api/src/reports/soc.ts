import type { Content } from "pdfmake/interfaces.js";
import { query } from "../db/pool.js";
import { themeOrder, readPack } from "../lib/pack.js";
import { byThemeThenRef } from "../lib/refs.js";
import { loadOrganisation } from "../routes/settings.js";
import { kpiRow, table, safe } from "./pdf.js";
import type { ReportSpec } from "./definitions.js";

/**
 * The SOC reports.
 *
 * Two control matrices, laid out the way a CPA firm's request list asks for
 * them (criterion, owner, status, evidence, last test), and a draft SOC 3: the
 * general-use summary a company publishes once its SOC 2 Type II is issued.
 *
 * Attest cannot write an auditor's opinion and does not pretend to. The SOC 3
 * draft says where the opinion goes and fills in everything else.
 */

/** The SOC 1 objectives live under one theme; every other theme is SOC 2. */
const SOC1 = "CO";

/** Trust Services categories, and the themes that make each one up. */
const CATEGORIES: { name: string; themes: string[]; always?: boolean }[] = [
  { name: "Security", themes: ["CC1", "CC2", "CC3", "CC4", "CC5", "CC6", "CC7", "CC8", "CC9"], always: true },
  { name: "Availability", themes: ["A1"] },
  { name: "Processing integrity", themes: ["PI1"] },
  { name: "Confidentiality", themes: ["C1"] },
  { name: "Privacy", themes: ["P"] },
];

const STATUS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  implemented: "Implemented",
  not_applicable: "Out of scope",
};

interface Row {
  id: string;
  ref: string;
  title: string;
  theme: string;
  status: string;
  owner: string;
  justification: string;
  evidence: number;
  tests: number;
  last_test: string | null;
  last_result: string | null;
  last_tester: string | null;
}

interface Engagement {
  title: string;
  report: string;
  report_type: string;
  status: string;
  auditor: string;
  categories: string;
  period_start: string | null;
  period_end: string | null;
  report_date: string | null;
  opinion: string;
  next_due: string | null;
}

const dash = (v: unknown): string => (String(v ?? "").trim() || "-");

/** A heading inside a section, smaller than h2. */
const sub = (text: string): Content => ({ text, style: "td", bold: true, margin: [0, 6, 0, 3] });

async function rows(): Promise<Row[]> {
  const [{ rows: list }, order] = await Promise.all([
    query<Row>(
      `select c.id, c.ref, c.title, c.theme, c.status, c.owner, c.justification,
              (select count(*) from evidence_controls ec where ec.control_id = c.id) as evidence,
              (select count(*) from control_tests t where t.control_id = c.id) as tests,
              (select t.tested_on from control_tests t where t.control_id = c.id
                order by t.tested_on desc, t.created_at desc limit 1) as last_test,
              (select t.result from control_tests t where t.control_id = c.id
                order by t.tested_on desc, t.created_at desc limit 1) as last_result,
              (select t.tester from control_tests t where t.control_id = c.id
                order by t.tested_on desc, t.created_at desc limit 1) as last_tester
         from controls c`,
    ),
    themeOrder(),
  ]);
  return byThemeThenRef(list, order);
}

async function themeNames(): Promise<Record<string, string>> {
  try {
    return await readPack<Record<string, string>>("themes.json");
  } catch {
    return {};
  }
}

/** A category is in scope when Security, or when any of its criteria is. */
function inScope(all: Row[]): { name: string; criteria: Row[] }[] {
  return CATEGORIES.map((cat) => ({
    name: cat.name,
    always: cat.always,
    criteria: all.filter((r) => cat.themes.includes(r.theme) && r.status !== "not_applicable"),
  })).filter((c) => c.always || c.criteria.length > 0);
}

/** Latest SOC 2 or SOC 3 report the CPA firm has issued, or the one being worked on. */
async function latestEngagement(reports: string[]): Promise<{ issued: Engagement | null; current: Engagement | null }> {
  const marks = reports.map((_, i) => `$${i + 1}`).join(", ");
  const { rows: list } = await query<Engagement>(
    `select title, report, report_type, status, auditor, categories, period_start, period_end,
            report_date, opinion, next_due
       from engagements where report in (${marks}) and status <> 'Cancelled'
      order by coalesce(period_end, '') desc, seq desc`,
    reports,
  );
  return {
    issued: list.find((e) => e.status === "Report issued") ?? null,
    current: list.find((e) => e.status !== "Report issued") ?? null,
  };
}

const period = (e: Engagement): string =>
  e.report_type === "Type II" && e.period_start && e.period_end
    ? `${e.period_start} to ${e.period_end}`
    : e.period_end
    ? `as of ${e.period_end}`
    : "period not set";

const testCell = (r: Row): string =>
  r.last_test ? `${r.last_result} on ${r.last_test}${r.last_tester ? ` by ${r.last_tester}` : ""}` : "Never tested";

/** The figures that head both matrices. */
function matrixKpis(list: Row[], noun: string): Content {
  const scoped = list.filter((r) => r.status !== "not_applicable");
  const failing = scoped.filter((r) => r.last_result === "Fail" || r.last_result === "Partial");
  return kpiRow([
    { label: "In scope", value: String(scoped.length), note: `of ${list.length} ${noun}` },
    { label: "Implemented", value: String(scoped.filter((r) => r.status === "implemented").length), note: "in scope" },
    { label: "With evidence", value: String(scoped.filter((r) => r.evidence > 0).length), note: "linked proof" },
    { label: "Exceptions", value: String(failing.length), note: "last test failed or partial" },
  ]);
}

function matrix(list: Row[], names: Record<string, string>, refHeader: string): Content[] {
  const out: Content[] = [];
  const themes = [...new Set(list.map((r) => r.theme))];
  for (const theme of themes) {
    const group = list.filter((r) => r.theme === theme);
    out.push({ text: safe(names[theme] ?? theme), style: "h2" });
    out.push(
      table(
        [refHeader, "What it asks for", "Status", "Owner", "Evidence", "Last test", "Out-of-scope reason"],
        group.map((r) => [
          r.ref,
          r.title,
          STATUS[r.status] ?? r.status,
          dash(r.owner),
          String(r.evidence),
          testCell(r),
          r.status === "not_applicable" ? dash(r.justification) : "",
        ]),
        [44, "*", 62, 80, 44, 120, 120],
      ),
    );
  }
  return out;
}

// ── SOC 2: the criteria matrix ───────────────────────────────────────────────
export const soc2Matrix: ReportSpec = {
  id: "soc2-criteria-matrix",
  title: "SOC 2 criteria matrix",
  description:
    "Every Trust Services criterion in scope, its owner, status, evidence and last test. What your CPA firm asks for before fieldwork.",
  requires: "soc",
  landscape: true,
  async build() {
    const [all, names] = await Promise.all([rows(), themeNames()]);
    const list = all.filter((r) => r.theme !== SOC1);
    const cats = inScope(all);
    return [
      matrixKpis(list, "criteria"),
      {
        text: `Categories in scope: ${cats.map((c) => c.name).join(", ")}.`,
        style: "td",
        margin: [0, 8, 0, 0],
      },
      ...matrix(list, names, "Criterion"),
    ];
  },
};

// ── SOC 1: the control objectives matrix ─────────────────────────────────────
export const soc1Matrix: ReportSpec = {
  id: "soc1-objectives-matrix",
  title: "SOC 1 control objectives matrix",
  description:
    "Your control objectives for financial reporting, with owner, status, evidence and last test. The core of a SOC 1 Type I or Type II.",
  requires: "soc",
  landscape: true,
  async build() {
    const [all, names] = await Promise.all([rows(), themeNames()]);
    const list = all.filter((r) => r.theme === SOC1);
    return [
      matrixKpis(list, "objectives"),
      {
        text:
          "A SOC 1 report's control objectives are written by the service organisation. " +
          "Edit, add or rule out objectives in Scope so this list matches the services your customers rely on for their financial reporting.",
        style: "small",
        margin: [0, 8, 0, 0],
      },
      ...matrix(list, names, "Objective"),
    ];
  },
};

// ── SOC 3: the general-use report, drafted ───────────────────────────────────
export const soc3Report: ReportSpec = {
  id: "soc3-report",
  title: "SOC 3 report (draft)",
  description:
    "The public, general-use summary of your SOC 2: management's assertion, the system and its boundaries, the categories covered, and where the auditor's opinion goes.",
  requires: "soc",
  async build() {
    const [all, { name: organisation }, prog, eng] = await Promise.all([
      rows(),
      loadOrganisation(),
      query<{ scope: string; methodology: string }>("select scope, methodology from programme where id = 1"),
      latestEngagement(["SOC 3", "SOC 2"]),
    ]);
    const org = organisation.trim() || "[Organisation name]";
    const system = prog.rows[0]?.scope?.trim() ?? "";
    const commitments = prog.rows[0]?.methodology?.trim() ?? "";
    const cats = inScope(all);
    const catList = cats.map((c) => c.name.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1");
    const basis = eng.issued ?? eng.current;
    const periodText = basis ? period(basis) : "[period start] to [period end]";

    const security = all.filter((r) => r.theme !== SOC1);
    const scoped = security.filter((r) => r.status !== "not_applicable");
    const notReady = scoped.filter((r) => r.status !== "implemented");
    const failing = scoped.filter((r) => r.last_result === "Fail" || r.last_result === "Partial");
    const untested = scoped.filter((r) => r.tests === 0);

    const out: Content[] = [];

    // What still stands between this draft and something publishable.
    const blockers: string[] = [];
    if (!organisation.trim()) blockers.push("Set the organisation name in Reports.");
    if (!system) blockers.push("Describe the system and its boundaries on the Scope screen.");
    if (!commitments) blockers.push("Write your service commitments and system requirements on the Scope screen.");
    if (!eng.issued) blockers.push("Record the issued SOC 2 Type II report in SOC reports. A SOC 3 is only issued alongside one.");
    if (notReady.length) blockers.push(`${notReady.length} criteria in scope are not yet implemented.`);
    if (failing.length) blockers.push(`${failing.length} criteria have a failed or partial last test.`);
    if (untested.length) blockers.push(`${untested.length} criteria in scope have never been tested.`);

    if (blockers.length) {
      out.push(
        { text: "Before this can be published", style: "h2" },
        {
          ul: blockers.map((b) => ({ text: b, style: "td" })),
          margin: [0, 0, 0, 6],
        },
        {
          text: "This page is for you, not for publication. It disappears when everything above is done.",
          style: "small",
          color: "#b91c1c",
          margin: [0, 0, 0, 10],
        },
      );
    }

    out.push(
      kpiRow([
        { label: "Categories", value: String(cats.length), note: cats.map((c) => c.name).join(", ") },
        { label: "Criteria in scope", value: String(scoped.length), note: `of ${security.length}` },
        { label: "Period", value: basis?.report_type ?? "Type II", note: periodText },
        { label: "Opinion", value: eng.issued?.opinion ?? "Pending", note: eng.issued?.auditor || "CPA firm" },
      ]),

      { text: `Section 1. ${org}'s assertion`, style: "h2" },
      {
        text: safe(
          `We are responsible for designing, implementing, operating and maintaining effective controls within ` +
            `${org}'s system${system ? "" : " [system name]"} throughout the period ${periodText}, to provide ` +
            `reasonable assurance that our service commitments and system requirements were achieved based on the ` +
            `trust services criteria relevant to ${catList}. Our description of the boundaries of the system is ` +
            `presented in Section 3 and identifies the aspects of the system covered by our assertion.`,
        ),
        style: "td",
        margin: [0, 0, 0, 6],
      },
      {
        text: safe(
          `We have performed an evaluation of the effectiveness of the controls within the system throughout the ` +
            `period ${periodText}. Based on that evaluation, we assert that the controls within the system were ` +
            `effective throughout the period to provide reasonable assurance that our service commitments and ` +
            `system requirements were achieved based on the applicable trust services criteria.`,
        ),
        style: "td",
        margin: [0, 0, 0, 6],
      },
      {
        text:
          "Draft wording for management's assertion. Your CPA firm will give you the exact form it requires; agree it with them before publishing.",
        style: "small",
        margin: [0, 0, 0, 4],
      },

      { text: "Section 2. Independent service auditor's report", style: "h2" },
      eng.issued
        ? {
            text: safe(
              `Issued by ${eng.issued.auditor || "[CPA firm]"} on ${eng.issued.report_date ?? "[date]"} ` +
                `for the period ${period(eng.issued)}. Opinion: ${eng.issued.opinion}. ` +
                `Insert the auditor's report exactly as the firm signed it.`,
            ),
            style: "td",
          }
        : {
            text:
              "Your CPA firm writes and signs this section. Attest cannot produce it. Record the report in SOC reports once it is issued.",
            style: "td",
          },

      { text: "Section 3. The system and its boundaries", style: "h2" },
      { text: system ? safe(system) : "[Describe the services, infrastructure, software, people, procedures and data that make up the system.]", style: "td", margin: [0, 0, 0, 6] },
      sub("Principal service commitments and system requirements"),
      { text: commitments ? safe(commitments) : "[What you promise customers, for example availability targets and how their data is protected, and the requirements your system must meet to keep those promises.]", style: "td", margin: [0, 0, 0, 6] },

      sub("Trust Services categories covered"),
      table(
        ["Category", "Criteria in scope", "Implemented"],
        cats.map((c) => [
          c.name,
          String(c.criteria.length),
          String(c.criteria.filter((r) => r.status === "implemented").length),
        ]),
        ["*", 100, 100],
      ),
    );

    return out;
  },
};
