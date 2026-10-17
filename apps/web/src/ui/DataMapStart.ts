import { useEffect, useState } from "preact/hooks";
import type { VNode } from "preact";
import { html } from "./html.js";
import { activities, type RegisterRow } from "../persistence/apiClient.js";
import { DEPARTMENTS } from "./privacyRegisters.js";

/**
 * Two ways to fill in the data map without starting from a blank form.
 *
 * Templates: common processing activities most organisations have, written
 * out in full. Ticking one copies it onto the data map as a draft; nothing
 * links back, so the copy is the customer's to change.
 *
 * Questionnaire: the same activities asked as plain questions, one department
 * at a time, the way a privacy lead goes round the building with a clipboard.
 * Each Yes becomes a draft entry owned by the person who answered.
 *
 * Both write through the same API as the form, so the same checks apply.
 */

interface Template {
  /** Stable, so the screen can tell which ones are already on the data map. */
  id: string;
  /** The question a department head is asked. */
  question: string;
  name: string;
  department: string;
  purpose: string;
  lawfulBasis: string;
  dataSubjects: string;
  dataCategories: string;
  specialData?: "Yes" | "No";
  specialCondition?: string;
  source?: string;
  storage: string;
  recipients: string;
  retention: string;
  highRisk?: "Yes" | "No" | "Not assessed";
}

const T = (t: Template): Template => t;

export const TEMPLATES: Template[] = [
  // ── HR ──
  T({ id: "hr.recruitment", department: "HR", question: "Do you recruit staff?",
    name: "Recruitment", purpose: "Advertising jobs, receiving applications, shortlisting and interviewing candidates.",
    lawfulBasis: "Contract", dataSubjects: "Job applicants",
    dataCategories: "Name, contact details, CV, work history, qualifications, interview notes, references.",
    source: "The applicant, recruitment agencies, referees", storage: "Recruitment system, HR shared folder, email",
    recipients: "Hiring managers, recruitment agency", retention: "6 months after the role is filled for unsuccessful candidates" }),
  T({ id: "hr.records", department: "HR", question: "Do you keep a file on each member of staff?",
    name: "Staff records", purpose: "Managing employment: contracts, absence, performance, conduct and leaving.",
    lawfulBasis: "Contract", dataSubjects: "Staff, former staff",
    dataCategories: "Name, address, date of birth, contract, job title, emergency contacts, performance and disciplinary records.",
    storage: "HR system, paper personnel files", recipients: "Line managers, HR", retention: "6 years after employment ends" }),
  T({ id: "hr.payroll", department: "HR", question: "Do you pay staff?",
    name: "Payroll", purpose: "Paying staff and making tax and social security deductions.",
    lawfulBasis: "Legal obligation", dataSubjects: "Staff",
    dataCategories: "Name, address, bank details, salary, tax code, national insurance or social security number.",
    storage: "Payroll system", recipients: "Payroll provider, bank, tax authority, pension provider",
    retention: "6 years after the end of the tax year" }),
  T({ id: "hr.health", department: "HR", question: "Do you record sickness, injuries or health conditions of staff?",
    name: "Sickness and occupational health", purpose: "Managing sickness absence, sick pay, workplace adjustments and health and safety.",
    lawfulBasis: "Legal obligation", dataSubjects: "Staff",
    dataCategories: "Sickness records, fit notes, medical reports, accident reports.",
    specialData: "Yes", specialCondition: "Employment and social security law (Article 9(2)(b))",
    storage: "HR system, occupational health provider", recipients: "Occupational health provider, insurer",
    retention: "6 years after employment ends; accident records as the law requires" }),
  T({ id: "hr.vetting", department: "HR", question: "Do you run criminal record or background checks?",
    name: "Background checks", purpose: "Checking suitability for roles that need it.",
    lawfulBasis: "Legal obligation", dataSubjects: "Job applicants, staff",
    dataCategories: "Identity documents, criminal record check results, right-to-work documents.",
    specialData: "Yes", specialCondition: "Criminal records data under Article 10 and national law",
    storage: "HR system", recipients: "Vetting provider", retention: "Only as long as needed to make the decision", highRisk: "Yes" }),
  T({ id: "hr.monitoring", department: "HR", question: "Do you monitor staff use of email, internet or devices?",
    name: "Staff IT monitoring", purpose: "Protecting systems and data, and investigating misuse.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Staff, contractors",
    dataCategories: "Login records, web and email logs, device activity.",
    storage: "Security tools, IT systems", recipients: "IT team, HR during an investigation",
    retention: "90 days, longer when part of an investigation", highRisk: "Yes" }),
  // ── Finance ──
  T({ id: "fin.suppliers", department: "Finance", question: "Do you pay suppliers or freelancers?",
    name: "Supplier and freelancer payments", purpose: "Paying suppliers and keeping accounting records.",
    lawfulBasis: "Contract", dataSubjects: "Sole traders, supplier contacts",
    dataCategories: "Name, contact details, bank details, invoices.",
    storage: "Accounting system", recipients: "Bank, auditors, tax authority", retention: "6 years" }),
  T({ id: "fin.billing", department: "Finance", question: "Do you invoice customers and chase payment?",
    name: "Customer billing and collections", purpose: "Invoicing customers, taking payment and recovering debts.",
    lawfulBasis: "Contract", dataSubjects: "Customers",
    dataCategories: "Name, billing address, payment details, payment history.",
    storage: "Accounting system, payment processor", recipients: "Payment processor, debt collection agency",
    retention: "6 years" }),
  // ── Sales ──
  T({ id: "sales.orders", department: "Sales", question: "Do you take and deliver customer orders?",
    name: "Customer orders and delivery", purpose: "Taking orders, delivering goods or services, and handling returns.",
    lawfulBasis: "Contract", dataSubjects: "Customers",
    dataCategories: "Name, delivery address, email, phone, order history.",
    storage: "Online shop, order system", recipients: "Couriers, payment processor",
    retention: "6 years after the last order" }),
  T({ id: "sales.crm", department: "Sales", question: "Do you keep a list of business contacts and leads?",
    name: "Business contacts and sales leads", purpose: "Managing relationships with business customers and prospects.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Business contacts, prospects",
    dataCategories: "Name, job title, work email, work phone, notes of contact.",
    storage: "CRM", recipients: "Sales team", retention: "2 years after last contact" }),
  // ── Marketing ──
  T({ id: "mkt.newsletter", department: "Marketing", question: "Do you send newsletters or marketing emails?",
    name: "Marketing email list", purpose: "Sending newsletters and offers to people who signed up.",
    lawfulBasis: "Consent", dataSubjects: "Subscribers, customers",
    dataCategories: "Name, email, preferences, opens and clicks.",
    storage: "Email marketing platform", recipients: "Email marketing platform",
    retention: "Until the person unsubscribes" }),
  T({ id: "mkt.analytics", department: "Marketing", question: "Do you use cookies or analytics on your website?",
    name: "Website analytics and cookies", purpose: "Understanding how the website is used and measuring campaigns.",
    lawfulBasis: "Consent", dataSubjects: "Website visitors",
    dataCategories: "IP address, device and browser details, pages visited, cookie identifiers.",
    storage: "Analytics service", recipients: "Analytics provider, advertising partners",
    retention: "14 months" }),
  T({ id: "mkt.events", department: "Marketing", question: "Do you run events or webinars that people sign up for?",
    name: "Events and webinars", purpose: "Registering attendees and running events.",
    lawfulBasis: "Contract", dataSubjects: "Attendees",
    dataCategories: "Name, email, organisation, dietary or access needs.",
    specialData: "No", storage: "Event platform", recipients: "Venue, event platform",
    retention: "1 year after the event" }),
  // ── Customer service ──
  T({ id: "cs.support", department: "Customer service", question: "Do you handle customer questions, support tickets or complaints?",
    name: "Customer support and complaints", purpose: "Answering questions, fixing problems and handling complaints.",
    lawfulBasis: "Contract", dataSubjects: "Customers",
    dataCategories: "Name, contact details, account details, the content of the conversation.",
    storage: "Helpdesk system, email", recipients: "Support team", retention: "3 years after the case closes" }),
  T({ id: "cs.calls", department: "Customer service", question: "Do you record phone calls?",
    name: "Call recording", purpose: "Training staff, resolving disputes and checking quality.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Customers, staff",
    dataCategories: "Voice recordings, phone numbers, call times.",
    storage: "Telephony system", recipients: "Telephony provider", retention: "90 days" }),
  // ── IT ──
  T({ id: "it.accounts", department: "IT", question: "Do you manage staff user accounts and system logs?",
    name: "User accounts and access logs", purpose: "Giving staff access to systems and keeping them secure.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Staff, contractors",
    dataCategories: "Name, username, work email, login records, device details.",
    storage: "Directory service, systems' logs", recipients: "IT provider", retention: "Logs 1 year; accounts until the person leaves" }),
  T({ id: "it.backups", department: "IT", question: "Do you keep backups of systems that hold personal data?",
    name: "Backups", purpose: "Restoring systems and data after a failure or attack.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Everyone whose data is in the systems backed up",
    dataCategories: "Copies of all data in the systems backed up.",
    storage: "Backup service, off-site storage", recipients: "Backup provider", retention: "As set by the backup schedule" }),
  // ── Facilities ──
  T({ id: "fac.cctv", department: "Facilities", question: "Do you use CCTV cameras?",
    name: "CCTV", purpose: "Protecting people and property and preventing crime.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Staff, visitors, members of the public",
    dataCategories: "Video images, time and location.",
    storage: "CCTV recorder", recipients: "Police on request, security company",
    retention: "30 days, unless needed for an investigation", highRisk: "Yes" }),
  T({ id: "fac.visitors", department: "Facilities", question: "Do visitors sign in at reception?",
    name: "Visitor log", purpose: "Knowing who is on site, for security and fire safety.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Visitors",
    dataCategories: "Name, organisation, who they are visiting, times in and out, car registration.",
    storage: "Visitor book or sign-in tablet", recipients: "Reception", retention: "1 year" }),
  T({ id: "fac.access", department: "Facilities", question: "Do staff use cards, fobs or fingerprints to enter the building?",
    name: "Building access control", purpose: "Controlling who can enter the building.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Staff, contractors",
    dataCategories: "Name, card number, photo, entry and exit times.",
    storage: "Access control system", recipients: "Security company", retention: "Entry logs 90 days" }),
  // ── Legal ──
  T({ id: "legal.claims", department: "Legal", question: "Do you deal with legal claims or disputes?",
    name: "Legal claims and disputes", purpose: "Defending and bringing legal claims.",
    lawfulBasis: "Legitimate interests", dataSubjects: "Claimants, customers, staff",
    dataCategories: "Names, contact details, the facts of the case, correspondence.",
    storage: "Legal case files", recipients: "External lawyers, insurers, courts",
    retention: "6 years after the matter closes" }),
  // ── Management ──
  T({ id: "mgmt.board", department: "Management", question: "Do you keep records of directors and shareholders?",
    name: "Directors and shareholders", purpose: "Meeting company law duties and running the company.",
    lawfulBasis: "Legal obligation", dataSubjects: "Directors, shareholders",
    dataCategories: "Name, address, date of birth, shareholding, board minutes.",
    storage: "Company records", recipients: "Company registry, accountants", retention: "As company law requires" }),
];

const toBody = (t: Template, owner = "", ownerEmail = ""): Record<string, unknown> => ({
  name: t.name, department: t.department, purpose: t.purpose, lawfulBasis: t.lawfulBasis,
  dataSubjects: t.dataSubjects, dataCategories: t.dataCategories, specialData: t.specialData ?? "No",
  specialCondition: t.specialCondition ?? "", source: t.source ?? "", storage: t.storage,
  recipients: t.recipients, retention: t.retention, highRisk: t.highRisk ?? "Not assessed",
  status: "Draft", owner, ownerEmail,
  notes: "Added from a template. Check every field and change it to match what you really do.",
});

/** Names already on the data map, so a template is not offered twice. */
const taken = (rows: RegisterRow[]): Set<string> =>
  new Set(rows.map((r) => String(r["name"] ?? "").trim().toLowerCase()));

export function DataMapTemplates({ canEdit, onAdded }: { canEdit: boolean; onAdded: () => void }): VNode {
  const [rows, setRows] = useState<RegisterRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    activities.list().then((r) => live && setRows(r)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, []);

  const have = taken(rows ?? []);
  const toggle = (id: string): void =>
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function add(): Promise<void> {
    setBusy(true);
    setError("");
    setMessage("");
    let n = 0;
    try {
      for (const t of TEMPLATES.filter((x) => picked.has(x.id))) {
        await activities.create(toBody(t));
        n++;
      }
      setMessage(`${n} added to the data map as drafts. Open each one and check it.`);
      setPicked(new Set());
      setRows(await activities.list());
      onAdded();
    } catch (err) {
      setError(`${n} added, then: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const groups = DEPARTMENTS.map((d) => ({ d, items: TEMPLATES.filter((t) => t.department === d) }))
    .filter((g) => g.items.length);

  return html`<div class="card pad">
    <p class="muted" style="margin-top:0">
      Common ways organisations use personal data, already filled in. Tick the ones you do and
      press <b>Add</b>. Each lands on the data map as a <b>draft</b>: open it, change anything that is not
      true for you, and set it to Active.
    </p>
    ${error ? html`<div class="err" role="alert">${error}</div>` : null}
    ${message ? html`<div class="ok-note" role="status">${message}</div>` : null}
    ${groups.map((g) => html`
      <h3 class="section-h" style="margin-top:18px">${g.d}</h3>
      <table>
        <tbody>
          ${g.items.map((t) => {
            const already = have.has(t.name.toLowerCase());
            return html`<tr key=${t.id}>
              <td style="width:36px">
                <input type="checkbox" disabled=${!canEdit || already} checked=${already || picked.has(t.id)}
                  aria-label=${`Add ${t.name}`} onChange=${() => toggle(t.id)} />
              </td>
              <td>
                <div><b>${t.name}</b> ${already ? html`<span class="pill green">on the data map</span>` : null}
                  ${t.highRisk === "Yes" ? html` <span class="pill amber">usually needs a DPIA</span>` : null}
                  ${t.specialData === "Yes" ? html` <span class="pill red">special-category data</span>` : null}</div>
                <div class="muted" style="font-size:12px">${t.purpose}</div>
              </td>
              <td style="width:160px"><span class="pill blue">${t.lawfulBasis}</span></td>
              <td class="muted" style="width:220px;font-size:12px">${t.retention}</td>
            </tr>`;
          })}
        </tbody>
      </table>`)}
    ${canEdit
      ? html`<div class="form-actions" style="margin-top:16px">
          <button type="button" class="btn primary" disabled=${busy || picked.size === 0} onClick=${() => void add()}>
            ${busy ? "Adding…" : picked.size ? `Add ${picked.size} to the data map` : "Tick some to add"}
          </button>
        </div>`
      : null}
  </div>`;
}

interface Extra { name: string; purpose: string }

export function DataMapQuestionnaire({ canEdit, onAdded }: { canEdit: boolean; onAdded: () => void }): VNode {
  const [dept, setDept] = useState<string>("HR");
  const [owner, setOwner] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, "Yes" | "No">>({});
  const [extras, setExtras] = useState<Extra[]>([{ name: "", purpose: "" }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const questions = TEMPLATES.filter((t) => t.department === dept);
  const yes = questions.filter((q) => answers[q.id] === "Yes");
  const extraOk = extras.filter((e) => e.name.trim());

  function pickDept(d: string): void {
    setDept(d);
    setAnswers({});
    setExtras([{ name: "", purpose: "" }]);
    setMessage("");
    setError("");
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError("");
    setMessage("");
    let n = 0;
    try {
      for (const t of yes) {
        await activities.create(toBody(t, owner.trim(), ownerEmail.trim()));
        n++;
      }
      for (const e of extraOk) {
        await activities.create({
          name: e.name.trim(), department: dept, purpose: e.purpose.trim(), status: "Draft",
          owner: owner.trim(), ownerEmail: ownerEmail.trim(),
          notes: "Added from the department questionnaire. Fill in the rest.",
        });
        n++;
      }
      setMessage(`${n} added to the data map for ${dept}, as drafts. Next: open each one and fill in the gaps.`);
      setAnswers({});
      setExtras([{ name: "", purpose: "" }]);
      onAdded();
    } catch (err) {
      setError(`${n} added, then: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return html`<div class="card pad">
    <p class="muted" style="margin-top:0">
      Go through this with each department head. Answer yes or no; every Yes becomes a draft entry on the
      data map, owned by the person you name here. Then add anything else the department does with
      personal data that is not on the list.
    </p>
    <div class="form-grid" style="margin-bottom:12px">
      <label class="fld"><span>Department</span>
        <select value=${dept} onChange=${(e: Event) => pickDept((e.target as HTMLSelectElement).value)}>
          ${DEPARTMENTS.map((d) => html`<option value=${d}>${d}</option>`)}
        </select>
      </label>
      <label class="fld"><span>Who answered (becomes the owner)</span>
        <input value=${owner} maxLength=${200} onInput=${(e: Event) => setOwner((e.target as HTMLInputElement).value)} />
      </label>
      <label class="fld"><span>Their email, for yearly review reminders</span>
        <input type="email" value=${ownerEmail} maxLength=${200}
          onInput=${(e: Event) => setOwnerEmail((e.target as HTMLInputElement).value)} />
      </label>
    </div>

    ${questions.length
      ? html`<table>
          <tbody>
            ${questions.map((q, i) => html`<tr key=${q.id}>
              <td style="width:28px" class="muted">${i + 1}.</td>
              <td>
                <div>${q.question}</div>
                <div class="muted" style="font-size:12px">If yes: "${q.name}" is added with typical answers filled in.</div>
              </td>
              <td style="width:150px">
                <div class="dpia-choice">
                  ${(["Yes", "No"] as const).map((v) => html`
                    <button type="button" disabled=${!canEdit}
                      class=${`btn small${answers[q.id] === v ? " primary" : ""}`}
                      onClick=${() => setAnswers((a) => ({ ...a, [q.id]: v }))}>${v}</button>`)}
                </div>
              </td>
            </tr>`)}
          </tbody>
        </table>`
      : html`<p class="muted">No standard questions for this department. Use the lines below.</p>`}

    <h3 class="section-h" style="margin-top:18px">Anything else ${dept} does with personal data?</h3>
    <p class="muted" style="margin:0 0 8px;font-size:12.5px">
      Think about spreadsheets, apps people signed up to themselves, paper files and shared inboxes.
    </p>
    ${extras.map((e, i) => html`<div class="form-grid" key=${i} style="margin-bottom:6px">
      <label class="fld"><span>Activity</span>
        <input value=${e.name} maxLength=${300} placeholder="For example: Training sign-up sheet"
          onInput=${(ev: Event) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, name: (ev.target as HTMLInputElement).value } : x)))} />
      </label>
      <label class="fld"><span>Why</span>
        <input value=${e.purpose} maxLength=${1000}
          onInput=${(ev: Event) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, purpose: (ev.target as HTMLInputElement).value } : x)))} />
      </label>
    </div>`)}
    <button type="button" class="btn small" disabled=${!canEdit}
      onClick=${() => setExtras((xs) => [...xs, { name: "", purpose: "" }])}>Add another line</button>

    ${error ? html`<div class="err" role="alert" style="margin-top:12px">${error}</div>` : null}
    ${message ? html`<div class="ok-note" role="status" style="margin-top:12px">${message}</div>` : null}
    ${canEdit
      ? html`<div class="form-actions" style="margin-top:16px">
          <button type="button" class="btn primary" disabled=${busy || yes.length + extraOk.length === 0}
            onClick=${() => void save()}>
            ${busy ? "Adding…" : `Add ${yes.length + extraOk.length} to the data map`}
          </button>
        </div>`
      : null}
  </div>`;
}
