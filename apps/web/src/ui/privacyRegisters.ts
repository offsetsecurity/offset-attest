import { useEffect, useState } from "preact/hooks";
import type { VNode } from "preact";
import { html } from "./html.js";
import type { RegisterSpec, ColumnSpec } from "./Register.js";
import { vendorRegister, policyRegister } from "./registers.js";
import {
  activities, dpias, requests, breaches, consents, type RegisterRow,
} from "../persistence/apiClient.js";

/**
 * The GDPR registers, as configuration for `Register.ts`.
 *
 * Everything here is typed in by a person. The two clocks GDPR sets - one
 * month to answer a request, 72 hours to tell the regulator about a breach -
 * are worked out by the database from the date somebody entered, and shown
 * here as a countdown that keeps moving while the page is open.
 */

export const DEPARTMENTS = [
  "HR", "Finance", "Sales", "Marketing", "Customer service", "IT", "Operations",
  "Facilities", "Legal", "Management", "Other",
] as const;
export const LAWFUL_BASES = [
  "Not decided yet", "Consent", "Contract", "Legal obligation", "Vital interests",
  "Public task", "Legitimate interests",
] as const;
const ACTIVITY_STATUS = ["Draft", "Active", "Retired"] as const;
const HIGH_RISK = ["Not assessed", "No", "Yes"] as const;
const YES_NO = ["No", "Yes"] as const;
const DPIA_STATUS = ["Screening", "Not needed", "In progress", "Approved", "Rejected"] as const;
const RESIDUAL = ["Not assessed", "Low", "Medium", "High"] as const;
const DECISION = ["Not decided", "Go ahead", "Go ahead with changes", "Do not go ahead"] as const;
const CONSULT = ["No", "Yes", "Done"] as const;
const REQUEST_TYPES = [
  "Access", "Erasure", "Correction", "Objection", "Restriction", "Portability", "Stop marketing", "Other",
] as const;
const REQUEST_STATUS = ["Open", "Waiting for ID", "In progress", "Done", "Refused"] as const;
const IDENTITY = ["Not checked", "Checked", "Not needed"] as const;
const BREACH_RISK = ["Not assessed", "Unlikely to harm anyone", "Risk to people", "High risk to people"] as const;
const DECIDE = ["Not decided", "Yes", "No"] as const;
const BREACH_STATUS = ["Open", "Contained", "Closed"] as const;
const CONSENT_STATUS = ["Active", "Paused", "Ended"] as const;
const PRIVACY_ROLES = ["Processor", "Sub-processor", "Joint controller", "Separate controller", "No personal data"] as const;
const DPA_STATUS = ["Missing", "In progress", "Signed", "Not needed"] as const;
const SAFEGUARDS = [
  "Not applicable", "Adequacy decision", "Standard contractual clauses", "Binding corporate rules",
  "EU-US Data Privacy Framework", "Exception (Article 49)", "None yet",
] as const;
const DOC_TYPES = ["Policy", "Privacy notice", "Cookie notice", "Procedure", "Record", "Other"] as const;

const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";
const SLATE = "#475569";
const BLUE = "#2457D6";

const TONE: Record<string, string> = {
  Draft: SLATE, Active: GREEN, Retired: SLATE,
  "Not assessed": SLATE, Yes: AMBER, No: GREEN,
  Screening: BLUE, "Not needed": SLATE, "In progress": BLUE, Approved: GREEN, Rejected: RED,
  Low: GREEN, Medium: AMBER, High: RED,
  Open: AMBER, "Waiting for ID": BLUE, Done: GREEN, Refused: SLATE,
  Contained: BLUE, Closed: GREEN,
  "Unlikely to harm anyone": GREEN, "Risk to people": AMBER, "High risk to people": RED,
  Paused: AMBER, Ended: SLATE,
  Missing: RED, Signed: GREEN,
  Consent: BLUE, Contract: BLUE, "Legal obligation": BLUE, "Vital interests": BLUE,
  "Public task": BLUE, "Legitimate interests": BLUE, "Not decided yet": RED,
};

const badge = (value: unknown, colour?: string): VNode => {
  const text = String(value ?? "—");
  const c = colour ?? TONE[text] ?? SLATE;
  return html`<span class="pill" style=${`background:${c}1a;color:${c}`}>${text}</span>`;
};

const plain = (value: unknown): string => {
  const text = String(value ?? "").trim();
  return text === "" ? "—" : text;
};

const titleCell = <T extends RegisterRow>(
  header: string,
  title: (r: T) => unknown,
  detail: (r: T) => string,
): ColumnSpec<T> => ({
  header,
  cell: (r) => html`
    <div>${String(title(r) ?? "")}</div>
    <div class="muted" style="font-size:11.5px">${detail(r)}</div>`,
});

/** Today in the browser's own time zone, "2026-10-16". */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from today to an ISO date. Negative when it has passed. */
export function daysLeft(iso: string): number {
  return Math.round(
    (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${localToday()}T00:00:00Z`)) / 86_400_000,
  );
}

/** Re-draws its children every minute, so a countdown keeps counting. */
function useMinute(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return tick;
}

const say = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Days to answer a request: green with room, amber in the last week, red when late. */
function DaysCountdown({ due }: { due: string }): VNode {
  useMinute();
  const left = daysLeft(due);
  if (left < 0) return badge(`${say(-left, "day")} late`, RED);
  if (left === 0) return badge("Due today", RED);
  return badge(`${say(left, "day")} left`, left <= 7 ? AMBER : GREEN);
}

/** Hours until the regulator must be told, from a local "YYYY-MM-DDTHH:MM". */
export function hoursLeft(deadline: string): number {
  return (new Date(deadline).getTime() - Date.now()) / 3_600_000;
}

function HoursCountdown({ deadline }: { deadline: string }): VNode {
  useMinute();
  const h = hoursLeft(deadline);
  if (h < 0) return badge(`${say(Math.ceil(-h), "hour")} late`, RED);
  return badge(`${say(Math.floor(h), "hour")} left`, h <= 24 ? RED : h <= 48 ? AMBER : GREEN);
}

/** "16 Oct 2026, 09:30" from a local "2026-10-16T09:30". */
const when = (local: unknown): string => {
  const s = String(local ?? "");
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const reviewCell = <T extends RegisterRow>(key: string, doneWhen: (r: T) => boolean): ColumnSpec<T> => ({
  header: "Next review",
  width: "120px",
  cell: (r) => {
    const value = r[key] as string | null;
    if (!value) return html`<span class="muted">—</span>`;
    const overdue = !doneWhen(r) && value < localToday();
    return overdue
      ? html`<span style="color:var(--red);font-weight:700" title="Not reviewed for over 12 months">${value}</span>`
      : html`<span class="muted">${value}</span>`;
  },
});

const ownerFields = (who = "Owner") => [
  { key: "owner", label: who, kind: "text" as const },
  { key: "ownerEmail", label: "Email reminders to", kind: "text" as const,
    hint: "This person is reminded when it is due. Leave empty for none." },
];

// ── the data map ─────────────────────────────────────────────────────────────

export const activityRegister: RegisterSpec<RegisterRow> = {
  api: activities,
  attachTo: "activities",
  singular: "Processing activity",
  plural: "Data map",
  searchText: (r) =>
    `${r["name"]} ${r["department"]} ${r["owner"]} ${r["purpose"]} ${r["data_categories"]} ${r["storage"]} ${r["recipients"]}`,
  filters: [
    { key: "department", label: "All departments", options: DEPARTMENTS },
    { key: "lawful_basis", label: "All lawful bases", options: LAWFUL_BASES },
    { key: "status", label: "All statuses", options: ACTIVITY_STATUS },
  ],
  columns: [
    titleCell("Activity", (r) => r["name"], (r) =>
      [r["department"], String(r["purpose"] ?? "").slice(0, 80)].filter(Boolean).join(" · ")),
    { header: "Lawful basis", width: "150px", cell: (r) => badge(r["lawful_basis"]) },
    { header: "High risk?", width: "110px", cell: (r) => {
      if (r["high_risk"] !== "Yes") return badge(r["high_risk"]);
      return Number(r["dpia_count"] ?? 0)
        ? html`<span class="pill amber" title="High risk, and has a DPIA">Yes · DPIA</span>`
        : html`<span class="pill red" title="High risk, but no DPIA yet">Yes · no DPIA</span>`;
    } },
    { header: "Owner", width: "140px", cell: (r) => plain(r["owner"]) },
    { header: "Status", width: "90px", cell: (r) => badge(r["status"]) },
    reviewCell("next_review", (r) => r["status"] === "Retired"),
  ],
  fields: [
    { key: "name", label: "Activity", kind: "text", wide: true, required: true,
      hint: "What you do with the data, in a few words. For example: \"Paying staff\" or \"Newsletter to customers\"." },
    { key: "department", label: "Department", kind: "select", options: ["", ...DEPARTMENTS] },
    { key: "status", label: "Status", kind: "select", options: ACTIVITY_STATUS,
      hint: "Draft until somebody has checked it. Retired when you stop doing it." },
    ...ownerFields(),
    { key: "purpose", label: "Why you do it (purpose)", kind: "textarea", wide: true },
    { key: "lawfulBasis", label: "Lawful basis", kind: "select", options: LAWFUL_BASES,
      hint: "The legal reason you may use the data. See Help: GDPR in plain words." },
    { key: "dataSubjects", label: "Whose data", kind: "text",
      hint: "Staff, customers, job applicants, website visitors, children…" },
    { key: "dataCategories", label: "What data", kind: "textarea", wide: true,
      hint: "Name, address, email, bank details, date of birth…" },
    { key: "specialData", label: "Special-category data?", kind: "select", options: YES_NO,
      hint: "Health, ethnicity, religion, biometrics, sexual orientation, union membership and similar." },
    { key: "specialCondition", label: "Article 9 condition", kind: "text", wide: true,
      showIf: (d) => d["specialData"] === "Yes",
      hint: "The extra legal condition, for example \"employment law obligation\" or \"explicit consent\"." },
    { key: "source", label: "Where the data comes from", kind: "text", wide: true,
      hint: "The person themselves, a recruiter, a public register…" },
    { key: "storage", label: "Where it is kept", kind: "textarea", wide: true,
      hint: "The systems, apps, spreadsheets and paper files." },
    { key: "recipients", label: "Who it is shared with", kind: "textarea", wide: true,
      hint: "Inside and outside the organisation: payroll company, tax office, couriers…" },
    { key: "vendorIds", label: "Processors and suppliers involved", kind: "links", source: "vendors", wide: true },
    { key: "transfers", label: "Sent outside the EU/EEA?", kind: "text", wide: true,
      hint: "Where to, and what covers it. Leave empty if it stays in the EU." },
    { key: "retention", label: "How long you keep it", kind: "text", wide: true,
      hint: "For example: \"6 years after employment ends\"." },
    { key: "security", label: "How it is protected", kind: "textarea", wide: true,
      hint: "Access control, encryption, backups, locked cabinets…" },
    { key: "highRisk", label: "High risk?", kind: "select", options: HIGH_RISK,
      hint: "Yes means it needs a DPIA. Not sure? Start a DPIA and answer the screening questions." },
    { key: "lastReviewed", label: "Last reviewed", kind: "date",
      hint: "Set to today after checking it. The owner is reminded 12 months later." },
    { key: "notes", label: "Notes", kind: "textarea", wide: true },
    { key: "controlIds", label: "Related GDPR duties", kind: "links", source: "controls", wide: true },
  ],
  blank: () => ({
    name: "", department: "", status: "Draft", owner: "", ownerEmail: "", purpose: "",
    lawfulBasis: "Not decided yet", dataSubjects: "", dataCategories: "", specialData: "No",
    specialCondition: "", source: "", storage: "", recipients: "", transfers: "", retention: "",
    security: "", highRisk: "Not assessed", lastReviewed: null, notes: "", vendorIds: [], controlIds: [],
  }),
  toInput: (r) => ({
    name: r["name"], department: r["department"], status: r["status"], owner: r["owner"],
    ownerEmail: r["owner_email"] ?? "", purpose: r["purpose"], lawfulBasis: r["lawful_basis"],
    dataSubjects: r["data_subjects"], dataCategories: r["data_categories"],
    specialData: r["special_data"], specialCondition: r["special_condition"], source: r["source"],
    storage: r["storage"], recipients: r["recipients"], transfers: r["transfers"],
    retention: r["retention"], security: r["security"], highRisk: r["high_risk"],
    lastReviewed: r["last_reviewed"], notes: r["notes"],
    vendorIds: r["vendor_ids"] ?? [], controlIds: r["control_ids"] ?? [],
  }),
};

// ── impact assessments ───────────────────────────────────────────────────────

/** The nine signs of high risk European regulators use to decide if a DPIA is needed. */
export const SCREENING: { id: string; q: string }[] = [
  { id: "scoring", q: "Do you score, profile or predict things about people? (credit, performance, behaviour)" },
  { id: "automated", q: "Are decisions with legal or similar big effects made by a computer alone?" },
  { id: "monitoring", q: "Do you watch or track people systematically? (CCTV, online tracking, location)" },
  { id: "sensitive", q: "Does it use special-category or very personal data? (health, biometrics, finances, location)" },
  { id: "scale", q: "Is it large scale? (many people, a lot of data, a long time, or a wide area)" },
  { id: "matching", q: "Do you combine data sets in ways people would not expect?" },
  { id: "vulnerable", q: "Are the people vulnerable or in a weaker position? (children, patients, staff, elderly)" },
  { id: "innovative", q: "Does it use new technology? (AI, facial recognition, new devices)" },
  { id: "blocking", q: "Could it stop people using a service or a right? (refusing a loan, a job, a service)" },
];

/** The risks to people a DPIA scores. */
export const DPIA_RISKS: { id: string; risk: string }[] = [
  { id: "access", risk: "Someone sees the data who should not (hacking, mistakes, insiders)" },
  { id: "loss", risk: "Data is lost or destroyed and cannot be got back" },
  { id: "change", risk: "Data is wrong, or changed without permission" },
  { id: "excess", risk: "More data is collected, or kept longer, than needed" },
  { id: "surprise", risk: "People do not know, or would not expect, what is done with their data" },
  { id: "reuse", risk: "Data is used for another purpose than people were told" },
  { id: "rights", risk: "People cannot easily use their rights (see, delete, object)" },
  { id: "unfair", risk: "Unfair or discriminating outcomes for people" },
];

const LIKELIHOOD = ["Remote", "Possible", "Probable"] as const;
const SEVERITY = ["Minimal", "Significant", "Severe"] as const;
const LEVELS = ["Low", "Medium", "High"] as const;

interface RiskAnswer { likelihood?: string; severity?: string; measures?: string; residual?: string }

/** Likelihood times severity, as Low, Medium or High. */
export function inherentLevel(a: RiskAnswer): string {
  const l = LIKELIHOOD.indexOf(a.likelihood as never) + 1;
  const s = SEVERITY.indexOf(a.severity as never) + 1;
  if (!l || !s) return "";
  const n = l * s;
  return n >= 6 ? "High" : n >= 3 ? "Medium" : "Low";
}

/** How many screening questions were answered Yes. */
export const screeningYes = (answers: Record<string, unknown>): number =>
  SCREENING.filter((s) => answers[s.id] === "Yes").length;

function choice(
  options: readonly string[],
  value: string | undefined,
  pick: (v: string) => void,
  disabled: boolean,
): VNode {
  return html`<div class="dpia-choice">
    ${options.map((o) => html`
      <button type="button" disabled=${disabled}
        class=${`btn small${value === o ? " primary" : ""}`}
        onClick=${() => pick(value === o ? "" : o)}>${o}</button>`)}
  </div>`;
}

function Screening({ value, set, canEdit }: {
  value: Record<string, string>;
  set: (patch: Record<string, unknown>) => void;
  canEdit: boolean;
}): VNode {
  const yes = screeningYes(value);
  const answered = SCREENING.filter((s) => value[s.id]).length;
  const verdict = yes >= 2
    ? html`<span class="pill red">${yes} signs of high risk: a DPIA is needed</span>`
    : yes === 1
    ? html`<span class="pill amber">1 sign of high risk: think carefully, and write down why</span>`
    : answered === SCREENING.length
    ? html`<span class="pill green">No signs of high risk: a DPIA is probably not needed</span>`
    : html`<span class="pill slate">${answered} of ${SCREENING.length} answered</span>`;
  return html`<div class="dpia-block">
    <div style="margin-bottom:8px">${verdict}</div>
    ${SCREENING.map((s, i) => html`
      <div class="dpia-row" key=${s.id}>
        <div class="dpia-q"><b>${i + 1}.</b> ${s.q}</div>
        ${choice(["Yes", "No", "Not sure"], value[s.id], (v) => set({ screening: { ...value, [s.id]: v } }), !canEdit)}
      </div>`)}
  </div>`;
}

function RiskGrid({ value, set, canEdit }: {
  value: Record<string, RiskAnswer>;
  set: (patch: Record<string, unknown>) => void;
  canEdit: boolean;
}): VNode {
  const update = (id: string, patch: RiskAnswer): void => {
    const next = { ...value, [id]: { ...(value[id] ?? {}), ...patch } };
    // The overall result is the worst risk left over after the measures.
    const worst = Object.values(next).reduce(
      (acc, a) => Math.max(acc, LEVELS.indexOf((a.residual ?? "") as never)), -1);
    set({ risks: next, ...(worst >= 0 ? { residualRisk: LEVELS[worst] } : {}) });
  };
  const sel = (opts: readonly string[], v: string | undefined, on: (x: string) => void): VNode => html`
    <select value=${v ?? ""} disabled=${!canEdit}
      onChange=${(e: Event) => on((e.target as HTMLSelectElement).value)}>
      <option value="">—</option>
      ${opts.map((o) => html`<option value=${o}>${o}</option>`)}
    </select>`;
  return html`<div class="dpia-block">
    <table class="dpia-grid">
      <thead><tr>
        <th>Risk to people</th><th style="width:105px">Likelihood</th><th style="width:115px">Severity</th>
        <th style="width:70px">Risk</th><th>What you will do about it</th><th style="width:95px">Left over</th>
      </tr></thead>
      <tbody>
        ${DPIA_RISKS.map((r) => {
          const a = value[r.id] ?? {};
          const level = inherentLevel(a);
          return html`<tr key=${r.id}>
            <td style="font-size:12.5px">${r.risk}</td>
            <td>${sel(LIKELIHOOD, a.likelihood, (x) => update(r.id, { likelihood: x }))}</td>
            <td>${sel(SEVERITY, a.severity, (x) => update(r.id, { severity: x }))}</td>
            <td>${level ? badge(level) : html`<span class="muted">—</span>`}</td>
            <td><textarea rows="2" disabled=${!canEdit} value=${a.measures ?? ""}
              onInput=${(e: Event) => update(r.id, { measures: (e.target as HTMLTextAreaElement).value })}></textarea></td>
            <td>${sel(LEVELS, a.residual, (x) => update(r.id, { residual: x }))}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

export const dpiaRegister: RegisterSpec<RegisterRow> = {
  api: dpias,
  attachTo: "dpias",
  singular: "DPIA",
  plural: "DPIAs",
  searchText: (r) => `${r["title"]} ${r["owner"]} ${r["activity_name"] ?? ""} ${r["description"]}`,
  filters: [
    { key: "status", label: "All statuses", options: DPIA_STATUS },
    { key: "residual_risk", label: "All results", options: RESIDUAL },
  ],
  columns: [
    titleCell("DPIA", (r) => r["title"], (r) => (r["activity_name"] ? `For: ${r["activity_name"]}` : "Not linked to the data map")),
    { header: "Screening", width: "120px", cell: (r) => {
      const n = screeningYes((r["screening"] as Record<string, unknown>) ?? {});
      return n >= 2 ? badge(`${n} signs`, RED) : n === 1 ? badge("1 sign", AMBER) : html`<span class="muted">—</span>`;
    } },
    { header: "Left-over risk", width: "120px", cell: (r) => badge(r["residual_risk"]) },
    { header: "Status", width: "110px", cell: (r) => badge(r["status"]) },
    { header: "Owner", width: "130px", cell: (r) => plain(r["owner"]) },
    { header: "Review by", width: "110px", cell: (r) => plain(r["review_date"]) },
  ],
  fields: [
    { key: "title", label: "DPIA", kind: "text", wide: true, required: true,
      hint: "Name it after the project or system, for example \"New CCTV system\"." },
    { key: "activityId", label: "For which data map entry", kind: "link", source: "activities", wide: true },
    { key: "status", label: "Status", kind: "select", options: DPIA_STATUS,
      hint: "Use \"Not needed\" when screening shows no high risk. The answers stay on file as your reason." },
    ...ownerFields(),
    { key: "description", label: "What the processing is", kind: "textarea", wide: true,
      hint: "In plain words: what data, about whom, what you do with it, and which systems." },
    { key: "screening", label: "Step 1. Screening: is a DPIA needed?", kind: "custom", wide: true,
      render: (v, set, _d, canEdit) => html`<${Screening} value=${(v as Record<string, string>) ?? {}} set=${set} canEdit=${canEdit} />` },
    { key: "necessity", label: "Step 2. Why is it needed, and is there a less intrusive way?", kind: "textarea", wide: true },
    { key: "minimisation", label: "How do you keep the data to the minimum, and for how long?", kind: "textarea", wide: true },
    { key: "rights", label: "How are people told, and how can they use their rights?", kind: "textarea", wide: true },
    { key: "risks", label: "Step 3. Risks to people", kind: "custom", wide: true,
      hint: "Score each risk, write what you will do, then the risk left over. The worst left-over risk becomes the result below.",
      render: (v, set, _d, canEdit) => html`<${RiskGrid} value=${(v as Record<string, RiskAnswer>) ?? {}} set=${set} canEdit=${canEdit} />` },
    { key: "residualRisk", label: "Step 4. Left-over risk overall", kind: "select", options: RESIDUAL },
    { key: "consultRegulator", label: "Consult the regulator?", kind: "select", options: CONSULT,
      hint: "Required before you start if high risk is left over (Article 36)." },
    { key: "dpoAdvice", label: "Data Protection Officer's advice", kind: "textarea", wide: true },
    { key: "decision", label: "Decision", kind: "select", options: DECISION },
    { key: "approvedBy", label: "Approved by", kind: "text" },
    { key: "approvedDate", label: "Approved on", kind: "date" },
    { key: "reviewDate", label: "Review by", kind: "date",
      hint: "The owner is reminded on this date. Review sooner if the processing changes." },
    { key: "notes", label: "Notes", kind: "textarea", wide: true },
  ],
  blank: () => ({
    title: "", activityId: null, status: "Screening", owner: "", ownerEmail: "", description: "",
    screening: {}, necessity: "", minimisation: "", rights: "", risks: {}, residualRisk: "Not assessed",
    consultRegulator: "No", dpoAdvice: "", decision: "Not decided", approvedBy: "", approvedDate: null,
    reviewDate: null, notes: "",
  }),
  toInput: (r) => ({
    title: r["title"], activityId: r["activity_id"], status: r["status"], owner: r["owner"],
    ownerEmail: r["owner_email"] ?? "", description: r["description"], screening: r["screening"] ?? {},
    necessity: r["necessity"], minimisation: r["minimisation"], rights: r["rights"],
    risks: r["risks"] ?? {}, residualRisk: r["residual_risk"], consultRegulator: r["consult_regulator"],
    dpoAdvice: r["dpo_advice"], decision: r["decision"], approvedBy: r["approved_by"],
    approvedDate: r["approved_date"], reviewDate: r["review_date"], notes: r["notes"],
  }),
  validate: (d) =>
    d["status"] === "Approved" && d["residualRisk"] === "High" && d["consultRegulator"] !== "Done"
      ? "High risk is left over. Consult the regulator first, then set \"Consult the regulator?\" to Done."
      : null,
};

// ── requests from individuals ────────────────────────────────────────────────

const requestClosed = (r: RegisterRow): boolean => r["status"] === "Done" || r["status"] === "Refused";

export const requestRegister: RegisterSpec<RegisterRow> = {
  api: requests,
  attachTo: "requests",
  singular: "Request",
  plural: "Requests",
  searchText: (r) => `${r["requester"]} ${r["request_type"]} ${r["owner"]} ${r["contact"]}`,
  filters: [
    { key: "request_type", label: "All kinds", options: REQUEST_TYPES },
    { key: "status", label: "All statuses", options: REQUEST_STATUS },
  ],
  summary: (rows) => {
    const open = rows.filter((r) => !requestClosed(r));
    const late = open.filter((r) => daysLeft(String(r["due_date"])) < 0).length;
    const week = open.filter((r) => { const d = daysLeft(String(r["due_date"])); return d >= 0 && d <= 7; }).length;
    return html`<div class="card pad" style="margin-bottom:14px;font-size:13px">
      <b>${open.length}</b> open · <span style=${late ? "color:var(--red);font-weight:700" : ""}>${late} late</span> · ${week} due within a week.
      <span class="muted"> You have one month from the day a request arrives. Extend only for complex requests, and tell the person why.</span>
    </div>`;
  },
  columns: [
    titleCell("Request", (r) => `${r["request_type"]} — ${r["requester"]}`,
      (r) => [r["channel"], r["contact"]].filter(Boolean).join(" · ")),
    { header: "Received", width: "100px", cell: (r) => plain(r["received_date"]) },
    { header: "Answer by", width: "110px", cell: (r) => html`
      <div>${plain(r["due_date"])}</div>
      ${r["extended"] === "Yes" ? html`<div class="muted" style="font-size:11px">extended</div>` : null}` },
    { header: "Time left", width: "120px", cell: (r) => requestClosed(r)
      ? html`<span class="muted">${r["completed_date"] ? `closed ${r["completed_date"]}` : "closed"}</span>`
      : html`<${DaysCountdown} due=${String(r["due_date"])} />` },
    { header: "Status", width: "120px", cell: (r) => badge(r["status"]) },
    { header: "Owner", width: "130px", cell: (r) => plain(r["owner"]) },
  ],
  fields: [
    { key: "requester", label: "Who is asking", kind: "text", required: true },
    { key: "contact", label: "How to reach them", kind: "text" },
    { key: "requestType", label: "What they want", kind: "select", options: REQUEST_TYPES },
    { key: "channel", label: "How it arrived", kind: "text", hint: "Email, letter, phone, web form…" },
    { key: "receivedDate", label: "Received on", kind: "date",
      hint: "The clock starts on this day, even if it arrived in the wrong inbox." },
    { key: "due", label: "Answer by", kind: "info",
      render: (_v, _set, d) => {
        const received = String(d["receivedDate"] ?? "");
        if (!received) return html`<div class="muted" style="padding:7px 0">Set the received date.</div>`;
        const due = new Date(`${received}T00:00:00`);
        due.setMonth(due.getMonth() + (d["extended"] === "Yes" ? 3 : 1));
        const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
        return html`<div style="padding:5px 0"><b>${iso}</b> <${DaysCountdown} due=${iso} /></div>`;
      } },
    { key: "identity", label: "Identity checked?", kind: "select", options: IDENTITY,
      hint: "Ask for proof only when you are not sure who they are." },
    { key: "status", label: "Status", kind: "select", options: REQUEST_STATUS },
    { key: "extended", label: "Extended by two months?", kind: "select", options: YES_NO,
      hint: "Only for complex or many requests. Tell the person within the first month." },
    { key: "extensionReason", label: "Why it needs more time", kind: "textarea", wide: true,
      showIf: (d) => d["extended"] === "Yes" },
    ...ownerFields("Handled by"),
    { key: "completedDate", label: "Answered on", kind: "date" },
    { key: "outcome", label: "What you did", kind: "textarea", wide: true,
      hint: "What you sent, deleted or changed. If refused, why. Needed before closing." },
    { key: "notes", label: "Notes", kind: "textarea", wide: true },
  ],
  blank: () => ({
    requester: "", contact: "", requestType: "Access", channel: "", receivedDate: localToday(),
    identity: "Not checked", status: "Open", extended: "No", extensionReason: "", owner: "",
    ownerEmail: "", completedDate: null, outcome: "", notes: "",
  }),
  toInput: (r) => ({
    requester: r["requester"], contact: r["contact"], requestType: r["request_type"],
    channel: r["channel"], receivedDate: r["received_date"], identity: r["identity"],
    status: r["status"], extended: r["extended"], extensionReason: r["extension_reason"],
    owner: r["owner"], ownerEmail: r["owner_email"] ?? "", completedDate: r["completed_date"],
    outcome: r["outcome"], notes: r["notes"],
  }),
  validate: (d) =>
    !d["receivedDate"]
      ? "Give the date the request arrived."
      : d["extended"] === "Yes" && !String(d["extensionReason"] ?? "").trim()
      ? "Say why the request needs more time."
      : (d["status"] === "Done" || d["status"] === "Refused") && !String(d["outcome"] ?? "").trim()
      ? "Write down what you did, or why you refused, before closing it."
      : null,
};

// ── breaches ─────────────────────────────────────────────────────────────────

/** Where the 72-hour clock stands for one breach. */
function noticeCell(r: RegisterRow): VNode {
  if (r["regulator_notified_at"]) {
    const late = String(r["regulator_notified_at"]) > String(r["regulator_deadline"]);
    return html`<div>${badge(late ? "Told, late" : "Told in time", late ? AMBER : GREEN)}</div>
      <div class="muted" style="font-size:11px">${when(r["regulator_notified_at"])}</div>`;
  }
  if (r["notify_regulator"] === "No") return badge("Not reportable", SLATE);
  if (r["status"] === "Closed") return html`<span class="muted">closed</span>`;
  return html`<div><${HoursCountdown} deadline=${String(r["regulator_deadline"])} /></div>
    <div class="muted" style="font-size:11px">by ${when(r["regulator_deadline"])}</div>`;
}

export const breachRegister: RegisterSpec<RegisterRow> = {
  api: breaches,
  attachTo: "breaches",
  singular: "Breach",
  plural: "Breaches",
  searchText: (r) => `${r["title"]} ${r["description"]} ${r["owner"]} ${r["data_categories"]}`,
  filters: [
    { key: "status", label: "All statuses", options: BREACH_STATUS },
    { key: "risk_level", label: "All risk levels", options: BREACH_RISK },
  ],
  summary: (rows) => {
    const clocks = rows.filter((r) => r["status"] !== "Closed" && r["notify_regulator"] !== "No" && !r["regulator_notified_at"]);
    return html`<div class="card pad" style="margin-bottom:14px;font-size:13px">
      ${clocks.length
        ? html`<b style="color:var(--red)">${clocks.length} breach${clocks.length === 1 ? "" : "es"} with the 72-hour clock running.</b>`
        : html`<b>No 72-hour clocks running.</b>`}
      <span class="muted"> Tell the regulator within 72 hours of becoming aware, unless the breach is unlikely to harm anyone. Log every breach, even ones you do not report.</span>
    </div>`;
  },
  columns: [
    titleCell("Breach", (r) => r["title"], (r) => `Aware ${when(r["aware_at"])}${r["people_affected"] ? ` · ${r["people_affected"]} people` : ""}`),
    { header: "Risk", width: "150px", cell: (r) => badge(r["risk_level"]) },
    { header: "Regulator (72 h)", width: "150px", cell: noticeCell },
    { header: "Tell people?", width: "110px", cell: (r) =>
      r["people_notified_date"] ? badge("Told", GREEN) : badge(r["notify_people"],
        r["notify_people"] === "Not decided" && r["risk_level"] === "High risk to people" ? RED : undefined) },
    { header: "Status", width: "100px", cell: (r) => badge(r["status"]) },
    { header: "Owner", width: "120px", cell: (r) => plain(r["owner"]) },
  ],
  fields: [
    { key: "title", label: "What happened, in a few words", kind: "text", wide: true, required: true,
      hint: "For example: \"Payroll spreadsheet emailed to the wrong person\"." },
    { key: "awareAt", label: "Became aware at", kind: "datetime", required: true,
      hint: "The 72 hours start here: when the organisation knew, not when the right person heard." },
    { key: "occurredAt", label: "Happened at (if known)", kind: "datetime" },
    { key: "clock", label: "Tell the regulator by", kind: "info",
      render: (_v, _set, d) => {
        const aware = String(d["awareAt"] ?? "");
        if (!aware) return html`<div class="muted" style="padding:7px 0">Set when you became aware.</div>`;
        const t = new Date(aware);
        t.setHours(t.getHours() + 72);
        const pad = (n: number): string => String(n).padStart(2, "0");
        const local = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
        return html`<div style="padding:5px 0"><b>${when(local)}</b> <${HoursCountdown} deadline=${local} /></div>`;
      } },
    { key: "description", label: "What happened", kind: "textarea", wide: true },
    { key: "dataCategories", label: "What data", kind: "text", wide: true },
    { key: "peopleAffected", label: "Roughly how many people", kind: "text" },
    { key: "specialData", label: "Special-category data?", kind: "select", options: YES_NO },
    { key: "consequences", label: "Likely effect on the people", kind: "textarea", wide: true,
      hint: "Identity theft, money lost, distress, embarrassment, discrimination…" },
    { key: "containment", label: "What you did to stop it and limit harm", kind: "textarea", wide: true },
    { key: "riskLevel", label: "Risk to the people", kind: "select", options: BREACH_RISK },
    { key: "notifyRegulator", label: "Tell the regulator?", kind: "select", options: DECIDE,
      hint: "Yes, unless the breach is unlikely to harm anyone." },
    { key: "regulatorNotifiedAt", label: "Regulator told at", kind: "datetime",
      showIf: (d) => d["notifyRegulator"] === "Yes" },
    { key: "regulatorReference", label: "Regulator's reference", kind: "text",
      showIf: (d) => d["notifyRegulator"] === "Yes" },
    { key: "lateReason", label: "Why it was late (if after 72 hours)", kind: "textarea", wide: true,
      showIf: (d) => d["notifyRegulator"] === "Yes" },
    { key: "notifyPeople", label: "Tell the people affected?", kind: "select", options: DECIDE,
      hint: "Yes, if it is high risk to them." },
    { key: "peopleNotifiedDate", label: "People told on", kind: "date",
      showIf: (d) => d["notifyPeople"] === "Yes" },
    { key: "decisionReason", label: "Why you decided this", kind: "textarea", wide: true,
      hint: "Needed for every breach, including those you do not report (Article 33(5))." },
    { key: "status", label: "Status", kind: "select", options: BREACH_STATUS },
    ...ownerFields(),
    { key: "notes", label: "Notes", kind: "textarea", wide: true },
  ],
  blank: () => {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    return {
      title: "", awareAt: `${localToday()}T${pad(d.getHours())}:${pad(d.getMinutes())}`, occurredAt: null,
      description: "", dataCategories: "", peopleAffected: "", specialData: "No", consequences: "",
      containment: "", riskLevel: "Not assessed", notifyRegulator: "Not decided", regulatorNotifiedAt: null,
      regulatorReference: "", lateReason: "", notifyPeople: "Not decided", peopleNotifiedDate: null,
      decisionReason: "", status: "Open", owner: "", ownerEmail: "", notes: "",
    };
  },
  toInput: (r) => ({
    title: r["title"], awareAt: r["aware_at"], occurredAt: r["occurred_at"],
    description: r["description"], dataCategories: r["data_categories"],
    peopleAffected: r["people_affected"], specialData: r["special_data"],
    consequences: r["consequences"], containment: r["containment"], riskLevel: r["risk_level"],
    notifyRegulator: r["notify_regulator"], regulatorNotifiedAt: r["regulator_notified_at"],
    regulatorReference: r["regulator_reference"], lateReason: r["late_reason"],
    notifyPeople: r["notify_people"], peopleNotifiedDate: r["people_notified_date"],
    decisionReason: r["decision_reason"], status: r["status"], owner: r["owner"],
    ownerEmail: r["owner_email"] ?? "", notes: r["notes"],
  }),
  validate: (d) =>
    !d["awareAt"]
      ? "Give the date and time you became aware."
      : d["status"] === "Closed" && (d["notifyRegulator"] === "Not decided" || !String(d["decisionReason"] ?? "").trim())
      ? "Before closing, decide whether to tell the regulator and write down why."
      : null,
};

// ── consent records ──────────────────────────────────────────────────────────

export const consentRegister: RegisterSpec<RegisterRow> = {
  api: consents,
  attachTo: "consents",
  singular: "Consent record",
  plural: "Consent records",
  searchText: (r) => `${r["purpose"]} ${r["method"]} ${r["owner"]} ${r["activity_name"] ?? ""}`,
  filters: [{ key: "status", label: "All statuses", options: CONSENT_STATUS }],
  columns: [
    titleCell("What people agree to", (r) => r["purpose"], (r) =>
      [r["method"], r["activity_name"] ? `for ${r["activity_name"]}` : ""].filter(Boolean).join(" · ")),
    { header: "Proof kept in", cell: (r) => plain(r["evidence_location"]) },
    { header: "Status", width: "100px", cell: (r) => badge(r["status"]) },
    { header: "Owner", width: "130px", cell: (r) => plain(r["owner"]) },
    reviewCell("next_review", (r) => r["status"] !== "Active"),
  ],
  fields: [
    { key: "purpose", label: "What people agree to", kind: "text", wide: true, required: true,
      hint: "For example: \"Monthly newsletter by email\" or \"Optional analytics cookies\"." },
    { key: "activityId", label: "Data map entry", kind: "link", source: "activities", wide: true },
    { key: "method", label: "How consent is collected", kind: "text", wide: true,
      hint: "An unticked box on the sign-up form, a cookie banner, a paper form…" },
    { key: "wording", label: "The exact wording people see", kind: "textarea", wide: true,
      hint: "Attach a screenshot below as well." },
    { key: "noticeVersion", label: "Privacy notice version shown", kind: "text" },
    { key: "evidenceLocation", label: "Where each person's consent is kept", kind: "text",
      hint: "The system that records who agreed and when." },
    { key: "withdrawMethod", label: "How people withdraw", kind: "text", wide: true,
      hint: "Must be as easy as giving it: an unsubscribe link, a settings page…" },
    { key: "startedDate", label: "In use since", kind: "date" },
    { key: "status", label: "Status", kind: "select", options: CONSENT_STATUS },
    ...ownerFields(),
    { key: "lastReviewed", label: "Last reviewed", kind: "date",
      hint: "The owner is reminded 12 months later." },
    { key: "notes", label: "Notes", kind: "textarea", wide: true },
  ],
  blank: () => ({
    purpose: "", activityId: null, method: "", wording: "", noticeVersion: "", evidenceLocation: "",
    withdrawMethod: "", startedDate: null, status: "Active", owner: "", ownerEmail: "",
    lastReviewed: null, notes: "",
  }),
  toInput: (r) => ({
    purpose: r["purpose"], activityId: r["activity_id"], method: r["method"], wording: r["wording"],
    noticeVersion: r["notice_version"], evidenceLocation: r["evidence_location"],
    withdrawMethod: r["withdraw_method"], startedDate: r["started_date"], status: r["status"],
    owner: r["owner"], ownerEmail: r["owner_email"] ?? "", lastReviewed: r["last_reviewed"],
    notes: r["notes"],
  }),
};

// ── processors and suppliers ─────────────────────────────────────────────────

const processes = (r: RegisterRow): boolean =>
  ["Processor", "Sub-processor", "Joint controller"].includes(String(r["privacy_role"]));

/** The supplier register with what GDPR asks of a processor: a contract, and covered transfers. */
export const processorRegister: RegisterSpec<RegisterRow> = {
  ...vendorRegister,
  singular: "Supplier",
  plural: "Processors and suppliers",
  searchText: (r) => `${r["name"]} ${r["service"]} ${r["owner"]} ${r["personal_data"]} ${r["transfer_countries"]}`,
  filters: [
    { key: "privacy_role", label: "All roles", options: PRIVACY_ROLES },
    { key: "dpa_status", label: "All DPA statuses", options: DPA_STATUS },
    { key: "transfer", label: "Outside the EU?", options: YES_NO },
  ],
  columns: [
    titleCell("Supplier", (r) => r["name"], (r) => String(r["service"] ?? "")),
    { header: "Role", width: "130px", cell: (r) => plain(r["privacy_role"]) },
    { header: "DPA", width: "110px", cell: (r) =>
      processes(r) || r["dpa_status"] === "Signed" ? badge(r["dpa_status"]) : html`<span class="muted">—</span>` },
    { header: "Outside the EU", width: "170px", cell: (r) => r["transfer"] !== "Yes"
      ? html`<span class="muted">No</span>`
      : html`<div>${plain(r["transfer_countries"])}</div>
          <div>${badge(r["transfer_safeguard"], ["None yet", "Not applicable"].includes(String(r["transfer_safeguard"])) ? RED : GREEN)}</div>` },
    { header: "Status", width: "110px", cell: (r) => badge(r["status"], r["status"] === "Active" ? GREEN : SLATE) },
    { header: "Review by", width: "100px", cell: (r) => plain(r["review_date"]) },
  ],
  fields: [
    { key: "name", label: "Supplier", kind: "text", wide: true, required: true },
    { key: "service", label: "What they do for you", kind: "text", wide: true },
    { key: "privacyRole", label: "Role under GDPR", kind: "select", options: PRIVACY_ROLES,
      hint: "Processor: handles data only on your instructions. Separate controller: decides for themselves, like a bank or the tax office." },
    { key: "personalData", label: "What personal data they handle", kind: "textarea", wide: true },
    { key: "dpaStatus", label: "Data processing agreement (DPA)", kind: "select", options: DPA_STATUS,
      hint: "Required for every processor (Article 28). Attach the signed copy below." },
    { key: "dpaDate", label: "DPA signed on", kind: "date", showIf: (d) => d["dpaStatus"] === "Signed" },
    { key: "transfer", label: "Is data sent or seen outside the EU/EEA?", kind: "select", options: YES_NO,
      hint: "Include support staff abroad who can see the data." },
    { key: "transferCountries", label: "Which countries", kind: "text", showIf: (d) => d["transfer"] === "Yes" },
    { key: "transferSafeguard", label: "What covers the transfer", kind: "select", options: SAFEGUARDS,
      showIf: (d) => d["transfer"] === "Yes",
      hint: "Most suppliers use standard contractual clauses. Some countries have an adequacy decision." },
    { key: "status", label: "Status", kind: "select", options: ["Prospective", "Active", "Under review", "Exited"] },
    { key: "criticality", label: "How much you rely on them", kind: "select", options: ["High", "Medium", "Low"] },
    ...ownerFields("Owner here"),
    { key: "assessedDate", label: "Last checked", kind: "date" },
    { key: "reviewDate", label: "Review by", kind: "date" },
    { key: "assurance", label: "Security assurance they gave", kind: "text", wide: true,
      hint: "An ISO 27001 certificate, a SOC 2 report, a questionnaire…" },
    { key: "notes", label: "Notes", kind: "textarea", wide: true },
    { key: "controlIds", label: "Related GDPR duties", kind: "links", source: "controls", wide: true },
  ],
  blank: () => ({
    ...vendorRegister.blank(),
    status: "Active", privacyRole: "Processor", personalData: "", dpaStatus: "Missing", dpaDate: null,
    transfer: "No", transferCountries: "", transferSafeguard: "Not applicable",
  }),
  toInput: (r) => ({
    ...vendorRegister.toInput(r),
    privacyRole: r["privacy_role"], personalData: r["personal_data"], dpaStatus: r["dpa_status"],
    dpaDate: r["dpa_date"], transfer: r["transfer"], transferCountries: r["transfer_countries"],
    transferSafeguard: r["transfer_safeguard"],
  }),
  validate: (d) =>
    d["transfer"] === "Yes" && !String(d["transferCountries"] ?? "").trim()
      ? "Say which countries the data goes to."
      : null,
};

// ── notices and policies ─────────────────────────────────────────────────────

/** The documents register, where privacy notices live alongside policies. */
export const noticeRegister: RegisterSpec<RegisterRow> = {
  ...policyRegister,
  singular: "Document",
  plural: "Notices and policies",
  filters: [
    { key: "doc_type", label: "All kinds", options: DOC_TYPES },
    { key: "status", label: "All statuses", options: ["Draft", "In Review", "Approved"] },
  ],
  columns: [
    titleCell("Document", (r) => r["name"], (r) =>
      [r["doc_type"], `v${r["version"]}`, r["audience"] ? `for ${r["audience"]}` : ""].filter(Boolean).join(" · ")),
    ...policyRegister.columns.slice(1),
  ],
  fields: [
    policyRegister.fields[0]!,
    { key: "docType", label: "Kind", kind: "select", options: DOC_TYPES },
    { key: "audience", label: "Who it is for", kind: "text",
      hint: "Customers, staff, job applicants, website visitors…" },
    ...policyRegister.fields.slice(1).map((f) =>
      f.key === "controlIds" ? { ...f, label: "Related GDPR duties" }
        : f.key === "acknowledgements" ? { ...f, hint: "Saved straight away, against the version the document is on." }
        : f),
  ],
  blank: () => ({ ...policyRegister.blank(), docType: "Privacy notice", audience: "" }),
  toInput: (r) => ({ ...policyRegister.toInput(r), docType: r["doc_type"], audience: r["audience"] }),
};
