import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { query, withTransaction } from "../db/pool.js";
import { isAdmin, requireAuth } from "../auth/rbac.js";
import { audit } from "../audit/audit.js";
import { badRequest } from "../lib/errors.js";
import { hasFeature } from "../lib/pack.js";

/**
 * Example data: a small, coherent organisation, and a way to remove it again.
 *
 * Empty registers make a product impossible to judge. Somebody evaluating this
 * wants to see what a filled-in programme looks like before deciding whether to
 * spend a week filling one in, and a sales demonstration should not begin with
 * twenty minutes of typing.
 *
 * Every row it writes is marked `"demo": true` in its attrs, and removing the
 * examples deletes exactly those rows. Nothing else is touched, so an install
 * that has real work in it does not lose any of it - which is the only way this
 * is safe to offer on a live install at all.
 *
 * Two things have nowhere to carry the mark: control tests (no attrs column)
 * and the scope text (one row, shared with the customer's own words). What the
 * example wrote there is remembered in the `example-data` setting instead, and
 * removing the examples takes back only what still matches it.
 */

const MARK = JSON.stringify({ demo: true });

/** Where the example remembers what it wrote outside a marked row. */
const NOTE_KEY = "example-data";

interface Note {
  tests: string[];
  scope: string | null;
  methodology: string | null;
}

/** The tables it writes to, in the order they must be emptied. */
const TABLES = [
  "engagements", "evidence", "findings", "incidents", "tasks", "reviews", "parties",
  "objectives", "training", "vendors", "policies", "risks", "assets",
];

interface Row {
  table: string;
  columns: Record<string, unknown>;
  /** Criterion refs this row should be linked to, through its link table. */
  controls?: string[];
  /** Link to every criterion in the example report's scope instead. */
  inScope?: boolean;
}

const today = (offsetDays = 0): string =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Categories left out of the example's report. Everything else is in it. */
const OUT_OF_SCOPE_THEMES = new Set(["P", "CO"]);

const SCOPE = `Tidewell Dispatch, the scheduling and dispatch platform Tidewell Software Ltd sells to field-service companies, as run in production from Stratus Cloud's two European regions.

In the system: the web and mobile applications, the scheduling engine, the customer API, the production database and its backups, the identity provider staff sign in through, the source repository and build pipeline, and the people who build, run and support the platform.

Trust Services categories in the SOC 2 report: Security, Availability, Confidentiality and Processing integrity. Customers rely on the platform being up during their working day, on their job and customer lists staying private, and on jobs reaching the right engineer at the right time.

Out of scope: Privacy, because our customers decide what personal information goes into the platform and answer for it to their own customers; we hold it for them under contract and protect it under Confidentiality. SOC 1, because the platform does not process our customers' financial transactions or feed their financial statements.

Carved out: Stratus Cloud hosts the platform and is a subservice organisation. Its own SOC 2 Type II report covers the data centres and the infrastructure under our accounts; we review it every year.`;

const METHODOLOGY = `Each criterion has an owner, who decides whether the controls we rely on are designed and working, and records it here.

Every quarter the owner tests their controls: a sample from the period (five leavers, ten changes, one restore) is checked against the control, and the result recorded as Pass, Partial or Fail with a note. A Fail opens an exception with a due date and a root cause.

Risks are scored for likelihood and impact on a five-point scale, once before and once after the controls, and reviewed twice a year or after a significant change. Anything left above 12 goes to the leadership team.

An internal control review is held before each audit by somebody who does not run the controls being reviewed. The leadership team reviews results, exceptions and the audit timetable every six months.`;

/**
 * One small company: Tidewell Software, which sells a scheduling and dispatch
 * platform to field-service companies and is part way between its SOC 2
 * Type I and its first Type II. Everything joins up - risks point at criteria,
 * evidence proves them, the failed test raised an exception - because a
 * demonstration of disconnected rows teaches the wrong lesson about the
 * product. Every name in it is invented.
 */
const EXAMPLE: Row[] = [
  { table: "assets", columns: { name: "Tidewell Dispatch platform", type: "Software", category: "Primary asset", criticality: "High", classification: "Confidential", owner: "Head of Engineering", location: "Stratus Cloud, two European regions" }, controls: ["CC6.1", "A1.1"] },
  { table: "assets", columns: { name: "Production database", type: "Data / Information", category: "Primary asset", criticality: "High", classification: "Confidential", owner: "Head of Engineering", location: "Stratus Cloud" }, controls: ["C1.1", "A1.2"] },
  { table: "assets", columns: { name: "Database backups", type: "Data / Information", criticality: "High", classification: "Confidential", owner: "Platform Lead", location: "Stratus Cloud, second region" }, controls: ["A1.2", "A1.3"] },
  { table: "assets", columns: { name: "Identity provider tenant", type: "SaaS", criticality: "High", classification: "Confidential", owner: "IT Manager", location: "Cloud" }, controls: ["CC6.1", "CC6.2"] },
  { table: "assets", columns: { name: "Source repository and build pipeline", type: "Software", criticality: "High", classification: "Confidential", owner: "Head of Engineering", location: "Hosted Git service" }, controls: ["CC8.1"] },
  { table: "assets", columns: { name: "Staff laptops", type: "Hardware", criticality: "Medium", classification: "Internal", owner: "IT Manager", location: "With staff" }, controls: ["CC6.8"] },
  { table: "assets", columns: { name: "Bristol office", type: "Facility", criticality: "Low", classification: "Internal", owner: "Office Manager", location: "Second floor, shared building" }, controls: ["CC6.4"] },
  { table: "assets", columns: { name: "Staff and their knowledge", type: "People", criticality: "High", classification: "Internal", owner: "Chief Executive", location: "Everywhere" }, controls: ["CC1.4"] },

  { table: "risks", columns: { title: "Customer job data exposed by a misconfigured cloud service", description: "A storage bucket or database endpoint is left reachable from the internet and a customer's job and contact lists are downloaded.", category: "Security", likelihood: 3, impact: 5, res_likelihood: 2, res_impact: 5, treatment: "Mitigate", status: "Open", owner: "Head of Engineering", review_date: today(90) }, controls: ["CC6.1", "CC6.6", "CC7.1", "C1.1"] },
  { table: "risks", columns: { title: "Staff credentials taken by phishing", description: "An engineer signs in to a convincing fake page and an attacker gets a working session to production tooling.", category: "Security", likelihood: 4, impact: 4, res_likelihood: 2, res_impact: 4, treatment: "Mitigate", status: "Open", owner: "IT Manager", review_date: today(90) }, controls: ["CC2.2", "CC6.1"] },
  { table: "risks", columns: { title: "Hosting outage during customers' working day", description: "A regional failure at the hosting provider stops engineers receiving jobs, and customers miss appointments.", category: "Operational", likelihood: 2, impact: 5, res_likelihood: 1, res_impact: 4, treatment: "Mitigate", status: "Open", owner: "Platform Lead", review_date: today(60) }, controls: ["A1.1", "A1.2", "CC9.1", "CC9.2"] },
  { table: "risks", columns: { title: "Leaver keeps access after their last day", description: "Accounts in the identity provider, or in tools outside it, are not removed promptly, so a former employee can still sign in.", category: "Security", likelihood: 3, impact: 4, treatment: "Mitigate", status: "Open", owner: "IT Manager", review_date: today(45) }, controls: ["CC6.2", "CC6.3"] },
  { table: "risks", columns: { title: "An unreviewed change mis-schedules jobs", description: "A change reaches production without review and the scheduling engine sends engineers to the wrong job, or at the wrong time.", category: "Operational", likelihood: 3, impact: 4, res_likelihood: 2, res_impact: 3, treatment: "Mitigate", status: "Open", owner: "Head of Engineering", review_date: today(75) }, controls: ["CC8.1", "PI1.3"] },
  { table: "risks", columns: { title: "Ransomware on a staff laptop reaches production", description: "Malware on an engineer's laptop gets to production credentials and encrypts or deletes data.", category: "Security", likelihood: 2, impact: 5, treatment: "Mitigate", status: "Open", owner: "IT Manager", review_date: today(120) }, controls: ["CC6.8", "CC7.4", "A1.3"] },

  { table: "policies", columns: { name: "Information security policy", version: "2.1", status: "Approved", owner: "Chief Executive", approver: "Board", approval_date: today(-40), review_date: today(325) }, controls: ["CC1.1", "CC5.3"] },
  { table: "policies", columns: { name: "Access control policy", version: "1.3", status: "Approved", owner: "IT Manager", approver: "Chief Executive", approval_date: today(-60), review_date: today(305) }, controls: ["CC6.1", "CC6.2", "CC6.3"] },
  { table: "policies", columns: { name: "Change management policy", version: "1.1", status: "In Review", owner: "Head of Engineering", review_date: today(20) }, controls: ["CC8.1"] },
  { table: "policies", columns: { name: "System description: Tidewell Dispatch", version: "0.4", status: "Draft", owner: "Compliance Lead", review_date: today(30) }, controls: ["CC2.3"] },

  { table: "vendors", columns: { name: "Stratus Cloud", service: "Hosts the platform, database and backups (subservice organisation, carved out of our report)", criticality: "High", classification: "Confidential", status: "Active", owner: "Platform Lead", assurance: "SOC 2 Type II, Security and Availability, twelve-month period; bridge letter on file", assessed_date: today(-50), review_date: today(315) }, controls: ["CC9.2", "A1.2"] },
  { table: "vendors", columns: { name: "Parcelpost Mail", service: "Sends appointment emails and texts to our customers' customers", criticality: "Medium", classification: "Confidential", status: "Active", owner: "Head of Engineering", assurance: "SOC 2 Type II, Security only", assessed_date: today(-140), review_date: today(25) }, controls: ["CC9.2"] },
  { table: "vendors", columns: { name: "Clearline Helpdesk", service: "Support ticketing for customers", criticality: "Medium", classification: "Confidential", status: "Under review", owner: "Head of Support", assurance: "ISO 27001 certificate; no SOC report offered", assessed_date: today(-200), review_date: today(-10) }, controls: ["CC9.2", "C1.1"] },
  { table: "vendors", columns: { name: "Bright Cleaning", service: "Office cleaning, out of hours", criticality: "Low", classification: "Internal", status: "Active", owner: "Office Manager", assurance: "Contract with confidentiality terms", review_date: today(200) }, controls: ["CC6.4"] },

  { table: "training", columns: { person: "Everyone", course: "Annual security awareness", audience: "All staff", completed_date: today(-45), next_due: today(320), result: "Completed" }, controls: ["CC1.4", "CC2.2"] },
  { table: "training", columns: { person: "Engineering team", course: "Secure development and change review", audience: "Engineers", completed_date: today(-90), next_due: today(275), result: "Completed" }, controls: ["CC8.1"] },
  { table: "training", columns: { person: "Support team", course: "Handling customer data in tickets", audience: "Support", completed_date: today(-30), next_due: today(335), result: "Completed" }, controls: ["C1.1"] },
  { table: "training", columns: { person: "New starters, this quarter", course: "Induction: code of conduct and acceptable use", audience: "New starters", next_due: today(10), result: "In progress" }, controls: ["CC1.1"] },

  { table: "objectives", columns: { title: "Every leaver loses all access within one working day", measure: "Days between last day and the last account disabled", target: "1 day", owner: "IT Manager", due_date: today(120), status: "At risk" }, controls: ["CC6.2", "CC6.3"] },
  { table: "objectives", columns: { title: "Platform available 99.9% of customers' working hours", measure: "Monthly availability from the status page", target: "99.9%", owner: "Platform Lead", due_date: today(200), status: "On track" }, controls: ["A1.1"] },
  { table: "objectives", columns: { title: "No critical vulnerability open longer than 14 days", measure: "Days open, from the scanner", target: "14 days", owner: "Head of Engineering", due_date: today(90), status: "On track" }, controls: ["CC7.1"] },

  { table: "parties", columns: { name: "Enterprise customers", kind: "Customer", needs: "A current SOC 2 report each year, a bridge letter between reports, and notice of a security incident", addressed: "Report shared under NDA from the trust page; incident terms in every contract", owner: "Chief Executive" }, controls: ["CC2.3"] },
  { table: "parties", columns: { name: "Prospects in procurement", kind: "Customer", needs: "Evidence of controls before signing, usually a SOC 2 report or a security questionnaire", addressed: "Type I report now; Type II after the current period", owner: "Head of Sales" }, controls: ["CC2.3"] },
  { table: "parties", columns: { name: "Staff", kind: "Staff", needs: "Clear rules, training, and to know who to tell when something looks wrong", addressed: "Handbook, annual training, incident channel", owner: "Head of People" }, controls: ["CC1.1", "CC2.2"] },
  { table: "parties", columns: { name: "Stratus Cloud", kind: "Supplier", needs: "Us to run the controls their report expects of their customers", addressed: "Their complementary user entity controls mapped to our criteria", owner: "Platform Lead" }, controls: ["CC9.2"] },

  { table: "reviews", columns: { title: "Internal control review: access and change management", kind: "Internal audit", status: "Completed", planned_date: today(-35), held_date: today(-33), led_by: "External consultant", attendees: "Compliance Lead, IT Manager, Head of Engineering", scope: "CC6 logical access and CC8 change management, over three months of the Type II period", outcome: "Access controls sound, but one leaver was missed in a tool outside single sign-on, and hotfix approvals were not recorded. Both raised as exceptions." }, controls: ["CC4.1", "CC6.2", "CC8.1"] },
  { table: "reviews", columns: { title: "Leadership review, first half", kind: "Management review", status: "Completed", planned_date: today(-20), held_date: today(-20), led_by: "Chief Executive", attendees: "Chief Executive, Head of Engineering, IT Manager, Compliance Lead", scope: "Exceptions, risks, objectives and the Type II timetable", outcome: "Agreed to bring every tool behind single sign-on before fieldwork, and to review the helpdesk supplier early." }, controls: ["CC4.2"] },
  { table: "reviews", columns: { title: "Readiness check before Type II fieldwork", kind: "Internal audit", status: "Planned", planned_date: today(55), led_by: "External consultant", scope: "Every in-scope criterion: is the evidence complete for the period?" } },

  { table: "findings", columns: { title: "Leaver kept access to the helpdesk for nine days", type: "Test exception", status: "Open", source: "Control test", description: "One of five leavers sampled this quarter still had a Clearline Helpdesk account nine days after leaving. The tool is outside single sign-on, so disabling the identity account did not remove it.", clause: "CC6.3", owner: "IT Manager", due_date: today(21), root_cause: "The leaver checklist covers single sign-on only; tools with their own accounts were never listed." }, controls: ["CC6.2", "CC6.3"] },
  { table: "findings", columns: { title: "Hotfix approvals not recorded", type: "Test exception", status: "Closed", source: "Internal control review", description: "Three of ten changes sampled were emergency fixes with no recorded approval.", clause: "CC8.1", owner: "Head of Engineering", due_date: today(-5), root_cause: "The emergency route skipped the pull-request approval rule.", action_taken: "Branch protection now covers the hotfix branch; emergency changes are approved after the fact within one working day.", verification: "Every emergency change in the following month carried an approval.", verified_by: "Compliance Lead", verified_date: today(-3) }, controls: ["CC8.1"] },

  { table: "tasks", columns: { title: "Put Clearline Helpdesk behind single sign-on", owner: "IT Manager", due_date: today(21), priority: "High", status: "In Progress", notes: "Closes the open leaver exception." } },
  { table: "tasks", columns: { title: "Finish the system description for the Type II", owner: "Compliance Lead", due_date: today(30), priority: "High", status: "Open" } },
  { table: "tasks", columns: { title: "Ask Parcelpost Mail for their latest SOC 2 report", owner: "Head of Engineering", due_date: today(25), priority: "Medium", status: "Open" } },
  { table: "tasks", columns: { title: "Run the quarterly access review", owner: "IT Manager", due_date: today(-2), priority: "High", status: "Open", notes: "Overdue on purpose in the example data: this is what an overdue row looks like." } },

  { table: "incidents", columns: { title: "Phishing email reached 25 mailboxes", detected_date: today(-25), owner: "IT Manager", severity: "Medium", status: "Closed", description: "A credential-harvesting email got past filtering. One person clicked; the identity provider's MFA prompt stopped the sign-in. Rule added, staff reminded." } },
  { table: "incidents", columns: { title: "Scheduling delayed in one region for 40 minutes", detected_date: today(-70), owner: "Platform Lead", severity: "Medium", status: "Closed", description: "A failed database failover left jobs queued. Traffic was moved to the second region by hand; no data lost. Failover runbook corrected." } },

  { table: "evidence", columns: { name: "Approved information security policy", type: "Approval", owner: "Chief Executive", collected_date: today(-40), next_review: today(325) }, controls: ["CC1.1", "CC5.3"] },
  { table: "evidence", columns: { name: "Quarterly access review, this quarter", type: "Report", owner: "IT Manager", collected_date: today(-20), next_review: today(70) }, controls: ["CC6.2", "CC6.3"] },
  { table: "evidence", columns: { name: "Change tickets sampled for the quarter", type: "Report", owner: "Head of Engineering", collected_date: today(-15), next_review: today(75) }, controls: ["CC8.1"] },
  { table: "evidence", columns: { name: "Awareness training completion report", type: "Report", owner: "IT Manager", collected_date: today(-45), next_review: today(320) }, controls: ["CC1.4", "CC2.2"] },
  { table: "evidence", columns: { name: "Backup restore test record", type: "Report", owner: "Platform Lead", collected_date: today(-30), next_review: today(60) }, controls: ["A1.2", "A1.3"] },
  { table: "evidence", columns: { name: "Vulnerability scan summary", type: "Report", owner: "Head of Engineering", collected_date: today(-10), next_review: today(20) }, controls: ["CC7.1"] },
  { table: "evidence", columns: { name: "Stratus Cloud SOC 2 Type II report and review notes", type: "Assessment", owner: "Platform Lead", collected_date: today(-50), next_review: today(315) }, controls: ["CC9.2", "A1.2"] },

  // Type I: the period end is the "as of" date, and there is no start.
  { table: "engagements", columns: { title: "SOC 2 Type I, Tidewell Dispatch", report: "SOC 2", report_type: "Type I", status: "Report issued", auditor: "Harrow & Pike LLP", categories: "Security, Availability, Confidentiality, Processing integrity", period_end: today(-210), report_date: today(-165), opinion: "Unmodified", exceptions: "None.", next_due: today(150), owner: "Compliance Lead", notes: "Our first report. Shared with customers under NDA from the trust page." }, inScope: true },
  { table: "engagements", columns: { title: "SOC 2 Type II, Tidewell Dispatch, first period", report: "SOC 2", report_type: "Type II", status: "Observation period", auditor: "Harrow & Pike LLP", categories: "Security, Availability, Confidentiality, Processing integrity", period_start: today(-120), period_end: today(60), opinion: "Not yet issued", next_due: today(150), owner: "Compliance Lead", notes: "Six-month period. Fieldwork is booked for the month after it ends." }, inScope: true },
];

const PRIVACY_REASON = "Out of scope: customers decide what personal information goes into the platform; we protect it for them under Confidentiality";
const SOC1_REASON = "Out of scope: the platform does not process customers' financial transactions or feed their financial reporting, so there is no SOC 1";

/**
 * Criteria the example has an opinion about: the in-scope ones with an owner
 * and a status, and Privacy and the SOC 1 objectives out of scope with a reason.
 *
 * Only ones left exactly as seeded are touched, and removing the examples puts
 * back only the ones still holding exactly what was written here. Somebody who
 * edits an example criterion afterwards keeps their edit: the reset sees the
 * change and leaves it alone, which is the difference between a demonstration
 * and a hazard.
 */
const CONTROL_EXAMPLES: { ref: string; status: string; owner: string; justification: string }[] = [
  { ref: "CC1.1", status: "implemented", owner: "Chief Executive", justification: "Code of conduct signed at induction and each year" },
  { ref: "CC1.2", status: "implemented", owner: "Chief Executive", justification: "The board takes a security report every quarter" },
  { ref: "CC1.3", status: "implemented", owner: "Chief Executive", justification: "Security roles named in the policy and the org chart" },
  { ref: "CC1.4", status: "implemented", owner: "Head of People", justification: "Background checks, training and yearly reviews" },
  { ref: "CC1.5", status: "in_progress", owner: "Head of People", justification: "Control duties being written into job descriptions" },
  { ref: "CC2.1", status: "implemented", owner: "Compliance Lead", justification: "Control results kept here, with their evidence" },
  { ref: "CC2.2", status: "implemented", owner: "IT Manager", justification: "Awareness training and an incident channel" },
  { ref: "CC2.3", status: "in_progress", owner: "Compliance Lead", justification: "Trust page live; system description still in draft" },
  { ref: "CC3.1", status: "implemented", owner: "Chief Executive", justification: "Service commitments set out in the customer contract" },
  { ref: "CC3.2", status: "implemented", owner: "Compliance Lead", justification: "Risk register reviewed twice a year" },
  { ref: "CC3.3", status: "implemented", owner: "Compliance Lead", justification: "Fraud considered in the risk assessment" },
  { ref: "CC3.4", status: "in_progress", owner: "Compliance Lead", justification: "Significant changes not yet a standing agenda item" },
  { ref: "CC4.1", status: "implemented", owner: "Compliance Lead", justification: "Quarterly self-tests and an internal control review" },
  { ref: "CC4.2", status: "implemented", owner: "Compliance Lead", justification: "Exceptions raised with owners and due dates" },
  { ref: "CC5.1", status: "implemented", owner: "Compliance Lead", justification: "Every risk points at the criteria that treat it" },
  { ref: "CC5.2", status: "implemented", owner: "Head of Engineering", justification: "Infrastructure defined as code and reviewed" },
  { ref: "CC5.3", status: "implemented", owner: "Compliance Lead", justification: "Policies approved and published to staff" },
  { ref: "CC6.1", status: "implemented", owner: "IT Manager", justification: "Single sign-on and MFA for production tooling" },
  { ref: "CC6.2", status: "in_progress", owner: "IT Manager", justification: "One tool still outside single sign-on; see the open exception" },
  { ref: "CC6.3", status: "in_progress", owner: "IT Manager", justification: "Quarterly access review; one leaver missed this quarter" },
  { ref: "CC6.4", status: "implemented", owner: "Office Manager", justification: "No servers on site; the office is badge entry" },
  { ref: "CC6.5", status: "implemented", owner: "IT Manager", justification: "Laptops wiped and certified on return" },
  { ref: "CC6.6", status: "implemented", owner: "Head of Engineering", justification: "Web application firewall and closed network paths" },
  { ref: "CC6.7", status: "implemented", owner: "Head of Engineering", justification: "Encrypted in transit; exports logged" },
  { ref: "CC6.8", status: "implemented", owner: "IT Manager", justification: "Endpoint protection on every laptop" },
  { ref: "CC7.1", status: "implemented", owner: "Head of Engineering", justification: "Weekly scans; critical findings fixed within 14 days" },
  { ref: "CC7.2", status: "implemented", owner: "Platform Lead", justification: "Alerting on unusual sign-ins and traffic" },
  { ref: "CC7.3", status: "implemented", owner: "Platform Lead", justification: "On-call triage with a written severity scale" },
  { ref: "CC7.4", status: "implemented", owner: "Platform Lead", justification: "Incident response plan used twice this year" },
  { ref: "CC7.5", status: "in_progress", owner: "Platform Lead", justification: "Post-incident reviews held; actions not always tracked" },
  { ref: "CC8.1", status: "implemented", owner: "Head of Engineering", justification: "Reviewed pull requests; hotfix gap closed" },
  { ref: "CC9.1", status: "in_progress", owner: "Platform Lead", justification: "Continuity plan written; the regional failover drill is due" },
  { ref: "CC9.2", status: "in_progress", owner: "Compliance Lead", justification: "Hosting reviewed; helpdesk supplier review overdue" },
  { ref: "A1.1", status: "implemented", owner: "Platform Lead", justification: "Capacity alerts and autoscaling" },
  { ref: "A1.2", status: "implemented", owner: "Platform Lead", justification: "Daily backups to a second region" },
  { ref: "A1.3", status: "implemented", owner: "Platform Lead", justification: "Restore tested every quarter" },
  { ref: "C1.1", status: "implemented", owner: "Head of Engineering", justification: "Customer data classified confidential and encrypted at rest" },
  { ref: "C1.2", status: "in_progress", owner: "Head of Engineering", justification: "Deletion on contract end is manual; automating it" },
  { ref: "PI1.1", status: "implemented", owner: "Head of Product", justification: "Scheduling rules documented for customers" },
  { ref: "PI1.2", status: "implemented", owner: "Head of Engineering", justification: "Imports validated and rejected rows reported" },
  { ref: "PI1.3", status: "implemented", owner: "Head of Engineering", justification: "Job queue monitored; stuck jobs alert" },
  { ref: "PI1.4", status: "not_started", owner: "Head of Engineering", justification: "Delivery checks on job notifications to be designed" },
  { ref: "PI1.5", status: "implemented", owner: "Head of Engineering", justification: "Job history kept and backed up" },
];

/** A few quarterly self-tests, including the one that failed. */
const TEST_EXAMPLES: { ref: string; days: number; tester: string; result: "Pass" | "Fail" | "Partial"; note: string }[] = [
  { ref: "CC6.2", days: -20, tester: "IT Manager", result: "Pass", note: "Five joiners sampled; every one had an approved request before access was granted." },
  { ref: "CC6.3", days: -20, tester: "IT Manager", result: "Fail", note: "Five leavers sampled; one still had a helpdesk account nine days after leaving. Exception raised." },
  { ref: "CC8.1", days: -15, tester: "Head of Engineering", result: "Pass", note: "Ten changes sampled; all reviewed and approved before release." },
  { ref: "CC8.1", days: -105, tester: "Head of Engineering", result: "Partial", note: "Three of ten were hotfixes with no recorded approval." },
  { ref: "A1.3", days: -30, tester: "Platform Lead", result: "Pass", note: "Production database restored to the second region in 38 minutes; row counts matched." },
  { ref: "CC7.1", days: -10, tester: "Head of Engineering", result: "Pass", note: "Two critical findings in the period, both fixed within 14 days." },
  { ref: "CC1.4", days: -45, tester: "Head of People", result: "Pass", note: "Training report shows every member of staff completed this year's course." },
];

/** Which link table joins a register to controls. */
const LINKS: Record<string, { table: string; column: string }> = {
  assets: { table: "asset_controls", column: "asset_id" },
  risks: { table: "risk_controls", column: "risk_id" },
  policies: { table: "policy_controls", column: "policy_id" },
  evidence: { table: "evidence_controls", column: "evidence_id" },
  findings: { table: "finding_controls", column: "finding_id" },
  vendors: { table: "vendor_controls", column: "vendor_id" },
  training: { table: "training_controls", column: "training_id" },
  objectives: { table: "objective_controls", column: "objective_id" },
  parties: { table: "party_controls", column: "party_id" },
  reviews: { table: "review_controls", column: "review_id" },
  engagements: { table: "engagement_controls", column: "engagement_id" },
};

const countExamples = async (): Promise<number> => {
  let total = 0;
  for (const table of [...TABLES, "controls"]) {
    const { rows } = await query<{ n: number }>(
      `select count(*) as n from ${table} where json_extract(attrs, '$.demo') = 1`,
    );
    total += rows[0]?.n ?? 0;
  }
  return total;
};

export async function demoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/demo", { preHandler: isAdmin }, async () => ({
    rows: await countExamples(),
    available: EXAMPLE.length,
  }));

  app.post("/api/v1/demo", { preHandler: isAdmin }, async (request, reply) => {
    requireAuth(request);
    if (!(await hasFeature("demoData"))) throw badRequest("This product does not ship example data.");
    if ((await countExamples()) > 0) throw badRequest("The examples are already loaded. Remove them first.");

    const byRef = new Map<string, string>();
    const inScope: string[] = [];
    for (const row of (await query<{ id: string; ref: string; theme: string }>("select id, ref, theme from controls order by ref")).rows) {
      byRef.set(row.ref, row.id);
      if (!OUT_OF_SCOPE_THEMES.has(row.theme)) inScope.push(row.ref);
    }

    let written = 0;
    await withTransaction(async (tx) => {
      for (const row of EXAMPLE) {
        // Anything already in the register under the same name is left alone,
        // so a risk added from the Sample library is not added a second time.
        const named = "title" in row.columns ? "title" : "name" in row.columns ? "name" : null;
        if (named) {
          const { rows: same } = await tx.query(
            `select 1 from ${row.table} where lower(trim(${named})) = lower(trim($1)) limit 1`,
            [String((row.columns as Record<string, unknown>)[named])],
          );
          if (same.length) continue;
        }
        const id = randomUUID();
        const columns: Record<string, unknown> = { ...row.columns, id, attrs: MARK };

        // Every register but evidence carries a display number, and it must
        // not collide with anything already there.
        if (row.table !== "evidence") {
          const { rows: next } = await tx.query<{ next: number }>(
            `select coalesce(max(seq), 0) + 1 as next from ${row.table}`,
          );
          Object.assign(columns, { seq: next[0]?.next ?? 1 });
        }

        const names = Object.keys(columns);
        await tx.query(
          `insert into ${row.table} (${names.join(", ")})
           values (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
          Object.values(columns),
        );
        written++;

        const link = LINKS[row.table];
        for (const ref of row.inScope ? inScope : row.controls ?? []) {
          const controlId = byRef.get(ref);
          if (!link || !controlId) continue;
          await tx.query(
            `insert or ignore into ${link.table} (${link.column}, control_id) values ($1, $2)`,
            [id, controlId],
          );
        }
      }
    });

    // The criteria: an opinion on every one, so the dashboard, the gap list
    // and the Scope screen show something worth reading. Only criteria still
    // exactly as seeded are touched.
    const examples = [
      ...CONTROL_EXAMPLES,
      ...[...byRef.keys()]
        .filter((ref) => ref.startsWith("CO") || /^P\d/.test(ref))
        .map((ref) => ({
          ref,
          status: "not_applicable",
          owner: "",
          justification: ref.startsWith("CO") ? SOC1_REASON : PRIVACY_REASON,
        })),
    ];
    let controls = 0;
    const note: Note = { tests: [], scope: null, methodology: null };
    await withTransaction(async (tx) => {
      for (const example of examples) {
        const { rowCount } = await tx.query(
          `update controls
              set status = $2, owner = $3, justification = $4,
                  attrs = json_patch(attrs, $5)
            where ref = $1
              and status = 'not_started' and trim(owner) = '' and trim(justification) = ''`,
          [
            example.ref,
            example.status,
            example.owner,
            example.justification,
            JSON.stringify({ demo: true, set: example }),
          ],
        );
        controls += rowCount;
      }

      for (const test of TEST_EXAMPLES) {
        const controlId = byRef.get(test.ref);
        if (!controlId) continue;
        const id = randomUUID();
        await tx.query(
          `insert into control_tests (id, control_id, tested_on, tester, result, note)
           values ($1, $2, $3, $4, $5, $6)`,
          [id, controlId, today(test.days), test.tester, test.result, test.note],
        );
        note.tests.push(id);
      }

      // The scope is written only where the customer has not written their own.
      await tx.query("insert or ignore into programme (id) values (1)");
      const { rows } = await tx.query<{ scope: string; methodology: string }>(
        "select scope, methodology from programme where id = 1",
      );
      if (!rows[0]?.scope.trim()) note.scope = SCOPE;
      if (!rows[0]?.methodology.trim()) note.methodology = METHODOLOGY;
      await tx.query(
        "update programme set scope = coalesce($1, scope), methodology = coalesce($2, methodology) where id = 1",
        [note.scope, note.methodology],
      );

      await tx.query(
        `insert into settings (key, value) values ($1, $2)
         on conflict (key) do update set value = excluded.value`,
        [NOTE_KEY, JSON.stringify(note)],
      );
    });

    await audit(request, {
      action: "Example data loaded",
      entity: "demo",
      entityId: "example",
      after: { rows: written, controls, tests: note.tests.length },
    });
    reply.code(201);
    return { rows: written + controls + note.tests.length };
  });

  app.delete("/api/v1/demo", { preHandler: isAdmin }, async (request, reply) => {
    requireAuth(request);
    let removed = 0;
    await withTransaction(async (tx) => {
      for (const table of TABLES) {
        const { rowCount } = await tx.query(
          `delete from ${table} where json_extract(attrs, '$.demo') = 1`,
        );
        removed += rowCount;
      }

      // Tests and scope text, from what the load remembered. Scope text the
      // customer has since rewritten is theirs and stays.
      const { rows } = await tx.query<{ value: string }>("select value from settings where key = $1", [NOTE_KEY]);
      if (rows[0]) {
        const note = JSON.parse(rows[0].value) as Note;
        for (const id of note.tests) {
          removed += (await tx.query("delete from control_tests where id = $1", [id])).rowCount;
        }
        if (note.scope !== null) {
          await tx.query("update programme set scope = '' where id = 1 and scope = $1", [note.scope]);
        }
        if (note.methodology !== null) {
          await tx.query("update programme set methodology = '' where id = 1 and methodology = $1", [note.methodology]);
        }
        await tx.query("delete from settings where key = $1", [NOTE_KEY]);
      }

      // Controls are not deleted - they are the framework - so the example's
      // opinion is taken back, and only where nobody has since changed it.
      const { rowCount: reset } = await tx.query(
        `update controls
            set status = 'not_started', owner = '', justification = '',
                attrs = json_remove(attrs, '$.demo', '$.set')
          where json_extract(attrs, '$.demo') = 1
            and status = json_extract(attrs, '$.set.status')
            and owner = json_extract(attrs, '$.set.owner')
            and justification = json_extract(attrs, '$.set.justification')`,
      );
      removed += reset;

      // Anything edited since keeps the edit, and stops being an example.
      await tx.query(
        `update controls set attrs = json_remove(attrs, '$.demo', '$.set')
          where json_extract(attrs, '$.demo') = 1`,
      );
    });

    await audit(request, { action: "Example data removed", entity: "demo", entityId: "example", before: { rows: removed } });
    reply.code(200);
    return { removed };
  });
}
