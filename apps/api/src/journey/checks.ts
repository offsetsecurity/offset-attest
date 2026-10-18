import { query } from "../db/pool.js";
import { loadSmtp, whyNotSendable } from "../mail/mailer.js";
import { loadBranding } from "../routes/settings.js";
import { packMeta, readPack } from "../lib/pack.js";

/**
 * The tasks the product can answer for itself.
 *
 * A journey task either has a check here or it does not. Where it does, the
 * product looks at its own data and decides; where it does not, somebody has
 * to tick it, because no amount of software can see whether a board approved a
 * policy or whether staff actually follow it.
 *
 * That split is deliberate and it is shown to the customer. A plan that
 * pretends to verify "get management to approve this" would be lying, and a
 * plan that made somebody tick "all 32 subdomains are scored" by hand when the
 * answer is sitting in the database would be insulting.
 *
 * Every check returns a short line of detail as well as a verdict, because
 * "not done" without "you have scored 30 of 32" is a dead end for someone who
 * does not already know what is missing.
 */

export interface CheckResult {
  done: boolean;
  /** One short line, shown whether or not it passed. */
  detail: string;
}

type Check = () => Promise<CheckResult>;

/** How many rows a table holds. Several checks are only ever "is there any". */
async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

const plural = (n: number, one: string, many = one + "s"): string =>
  `${n} ${n === 1 ? one : many}`;

/** "control" -> "controls", "subcategory" -> "subcategories". */
const plurals = (word: string): string =>
  /criterion$/i.test(word) ? `${word.slice(0, -2)}a`
    : word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`;

const CHECKS: Record<string, Check> = {
  /**
   * More than the one account the install created. A programme run entirely
   * from the bootstrap admin account has nobody to hand over to.
   */
  "users.beyondAdmin": async () => {
    const n = await count("select count(*) as n from users where disabled = 0");
    return {
      done: n > 1,
      detail: n > 1 ? `${plural(n, "person", "people")} can sign in` : "only the first account exists",
    };
  },

  /** Configured and actually sendable, not merely filled in. */
  "settings.smtp": async () => {
    const why = whyNotSendable(await loadSmtp());
    return { done: why === null, detail: why ?? "email is configured and ready to send" };
  },

  "settings.logo": async () => {
    const { logo } = await loadBranding();
    return {
      done: logo !== null,
      detail: logo ? "your logo is on every report" : "reports carry the Offset Security mark",
    };
  },

  /**
   * The daily backup has completed at least once. It cannot tell whether
   * anybody copied that file off the machine, which is the half that matters,
   * so the task wording asks for that and this only covers what it can see.
   */
  "jobs.backupRan": async () => {
    const { rows } = await query<{ completed_at: string }>(
      `select completed_at from jobs
        where name = 'backup' and completed_at is not null
        order by completed_at desc limit 1`,
    );
    const last = rows[0]?.completed_at;
    return {
      done: Boolean(last),
      detail: last ? `last backup ${last.slice(0, 10)}` : "no backup has completed yet",
    };
  },

  "programme.scope": async () => {
    const { rows } = await query<{ scope: string }>("select scope from programme where id = 1");
    const scope = (rows[0]?.scope ?? "").trim();
    // A word or two is somebody testing the box, not a scope statement.
    const enough = scope.length >= 40;
    return {
      done: enough,
      detail: scope ? (enough ? "scope is written down" : "what is there is too short to be a scope") : "nothing written yet",
    };
  },

  "registers.assets": async () => {
    const n = await count("select count(*) as n from assets");
    return { done: n > 0, detail: n ? `${plural(n, "asset")} recorded` : "nothing recorded yet" };
  },

  "registers.policies": async () => {
    const n = await count("select count(*) as n from policies");
    return { done: n > 0, detail: n ? `${plural(n, "policy", "policies")} recorded` : "nothing recorded yet" };
  },

  "registers.risks": async () => {
    const n = await count("select count(*) as n from risks");
    return { done: n > 0, detail: n ? `${plural(n, "risk")} recorded` : "nothing recorded yet" };
  },

  /** Somebody has been written down as caring about your security (4.2). */
  "registers.parties": async () => {
    const n = await count("select count(*) as n from parties");
    return {
      done: n > 0,
      detail: n ? `${plural(n, "interested party", "interested parties")} recorded` : "nobody recorded yet",
    };
  },

  /**
   * A communication plan exists (7.4). The question is whether anything was
   * arranged at all; who it reaches and how often is for the auditor to read.
   */
  "registers.communications": async () => {
    const n = await count("select count(*) as n from communications");
    return {
      done: n > 0,
      detail: n ? `${plural(n, "communication")} planned` : "nothing planned yet",
    };
  },

  "registers.tasks": async () => {
    const n = await count("select count(*) as n from tasks");
    return { done: n > 0, detail: n ? `${plural(n, "task")} raised` : "nothing raised yet" };
  },

  // ── the GDPR records ──────────────────────────────────────────────────────

  "privacy.activities": async () => {
    const n = await count("select count(*) as n from processing_activities where status <> 'Retired'");
    return {
      done: n > 0,
      detail: n ? `${plural(n, "processing activity", "processing activities")} on the data map` : "the data map is empty",
    };
  },

  /** Every entry in use says why the organisation is allowed to do it. */
  "privacy.lawfulBasis": async () => {
    const total = await count("select count(*) as n from processing_activities where status <> 'Retired'");
    const missing = await count(
      "select count(*) as n from processing_activities where status <> 'Retired' and lawful_basis = 'Not decided yet'",
    );
    return {
      done: total > 0 && missing === 0,
      detail: !total ? "the data map is empty" : missing ? `${missing} of ${total} still need a lawful basis` : "every entry has a lawful basis",
    };
  },

  /** Somebody answers for every entry, with an address to remind them on. */
  "privacy.owners": async () => {
    const total = await count("select count(*) as n from processing_activities where status <> 'Retired'");
    const missing = await count(
      "select count(*) as n from processing_activities where status <> 'Retired' and (owner = '' or owner_email = '')",
    );
    return {
      done: total > 0 && missing === 0,
      detail: !total ? "the data map is empty" : missing ? `${missing} of ${total} have no owner or no email` : "every entry has an owner",
    };
  },

  /** Every entry has had the "is this high risk?" question answered. */
  "privacy.screened": async () => {
    const total = await count("select count(*) as n from processing_activities where status <> 'Retired'");
    const open = await count(
      "select count(*) as n from processing_activities where status <> 'Retired' and high_risk = 'Not assessed'",
    );
    return {
      done: total > 0 && open === 0,
      detail: !total ? "the data map is empty" : open ? `${open} of ${total} not yet checked for high risk` : "every entry has been checked",
    };
  },

  /** Every high-risk entry has an impact assessment. */
  "privacy.dpiaCoverage": async () => {
    const high = await count(
      "select count(*) as n from processing_activities where status <> 'Retired' and high_risk = 'Yes'",
    );
    const missing = await count(
      `select count(*) as n from processing_activities a
        where a.status <> 'Retired' and a.high_risk = 'Yes'
          and not exists (select 1 from dpias d where d.activity_id = a.id and d.status <> 'Not needed')`,
    );
    return {
      done: missing === 0,
      detail: !high ? "nothing is marked high risk" : missing ? `${missing} of ${high} high-risk entries have no DPIA` : "every high-risk entry has a DPIA",
    };
  },

  "privacy.notice": async () => {
    const n = await count(
      "select count(*) as n from policies where doc_type = 'Privacy notice' and status = 'Approved'",
    );
    return { done: n > 0, detail: n ? `${plural(n, "approved privacy notice")}` : "no approved privacy notice yet" };
  },

  "privacy.consents": async () => {
    const consentBased = await count(
      "select count(*) as n from processing_activities where status <> 'Retired' and lawful_basis = 'Consent'",
    );
    const n = await count("select count(*) as n from consents where status = 'Active'");
    return {
      done: consentBased === 0 || n > 0,
      detail: n ? `${plural(n, "consent record")}` : consentBased ? "entries rely on consent, but no consent record exists" : "nothing relies on consent",
    };
  },

  "privacy.processors": async () => {
    const n = await count(
      "select count(*) as n from vendors where status <> 'Exited' and privacy_role in ('Processor', 'Sub-processor', 'Joint controller')",
    );
    return { done: n > 0, detail: n ? `${plural(n, "processor")} recorded` : "no processors recorded yet" };
  },

  /** A signed contract with every processor (Article 28). */
  "privacy.dpas": async () => {
    const total = await count(
      "select count(*) as n from vendors where status <> 'Exited' and privacy_role in ('Processor', 'Sub-processor', 'Joint controller')",
    );
    const missing = await count(
      `select count(*) as n from vendors where status <> 'Exited'
          and privacy_role in ('Processor', 'Sub-processor', 'Joint controller')
          and dpa_status in ('Missing', 'In progress')`,
    );
    return {
      done: total > 0 && missing === 0,
      detail: !total ? "no processors recorded yet" : missing ? `${missing} of ${total} have no signed agreement` : "every processor has a signed agreement",
    };
  },

  "privacy.transfers": async () => {
    const open = await count(
      `select count(*) as n from vendors where status <> 'Exited' and transfer = 'Yes'
          and transfer_safeguard in ('None yet', 'Not applicable')`,
    );
    return {
      done: open === 0,
      detail: open ? `${plural(open, "transfer")} outside the EU with nothing to cover it` : "every transfer is covered, or there are none",
    };
  },

  /** Nothing on the data map has gone a year without being looked at. */
  "privacy.reviewed": async () => {
    const total = await count("select count(*) as n from processing_activities where status <> 'Retired'");
    const late = await count(
      "select count(*) as n from processing_activities where status <> 'Retired' and next_review < date('now')",
    );
    return {
      done: total > 0 && late === 0,
      detail: !total ? "the data map is empty" : late ? `${late} not reviewed for over 12 months` : "everything reviewed within the year",
    };
  },

  /**
   * Every applicable subdomain carries a level.
   *
   * Excluded ones do not need a score — that is the whole point of excluding
   * them — so they count as answered. The customer has said something about
   * every item either way, which is what "assessed" means.
   */
  "controls.allScored": async () => {
    const { rows } = await query<{ total: number; answered: number }>(
      `select count(*) as total,
              sum(case when maturity is not null or status = 'not_applicable' then 1 else 0 end)
                as answered
         from controls`,
    );
    const total = rows[0]?.total ?? 0;
    const answered = rows[0]?.answered ?? 0;
    return {
      done: total > 0 && answered === total,
      detail: total === 0 ? "nothing to score" : `${answered} of ${total} answered`,
    };
  },

  "evidence.any": async () => {
    const n = await count("select count(*) as n from evidence");
    return { done: n > 0, detail: n ? `${plural(n, "item")} of evidence held` : "nothing collected yet" };
  },

  /** Evidence that is attached to something. A folder of files proves nothing. */
  "evidence.linked": async () => {
    const total = await count("select count(*) as n from evidence");
    const linked = await count(
      "select count(distinct evidence_id) as n from evidence_controls",
    );
    const item = (await packMeta()).itemLabel.toLowerCase();
    return {
      done: total > 0 && linked === total,
      detail: total === 0 ? "no evidence yet" : `${linked} of ${total} linked to a ${item}`,
    };
  },

  /** A date on every item, so freshness can be worked out at all. */
  "evidence.dated": async () => {
    const total = await count("select count(*) as n from evidence");
    const dated = await count("select count(*) as n from evidence where collected_date is not null");
    return {
      done: total > 0 && dated === total,
      detail: total === 0 ? "no evidence yet" : `${dated} of ${total} have a collected date`,
    };
  },

  "programme.methodology": async () => {
    const { rows } = await query<{ methodology: string }>("select methodology from programme where id = 1");
    const text = (rows[0]?.methodology ?? "").trim();
    const enough = text.length >= 40;
    return {
      done: enough,
      detail: text ? (enough ? "method is written down" : "what is there is too short to be a method") : "nothing written yet",
    };
  },

  /**
   * Every policy approved. Approval is recorded on the policy itself - status,
   * approver and date - so unlike a board meeting, this is something the
   * product can see.
   */
  "policies.approved": async () => {
    const total = await count("select count(*) as n from policies");
    const approved = await count(
      "select count(*) as n from policies where status = 'Approved' and trim(approver) <> '' and approval_date is not null",
    );
    return {
      done: total > 0 && approved === total,
      detail: total === 0 ? "no policies yet" : `${approved} of ${total} approved, with approver and date`,
    };
  },

  "policies.reviewDates": async () => {
    const total = await count("select count(*) as n from policies");
    const dated = await count("select count(*) as n from policies where review_date is not null");
    return {
      done: total > 0 && dated === total,
      detail: total === 0 ? "no policies yet" : `${dated} of ${total} have a review date`,
    };
  },

  /** An owner on every risk. A risk nobody owns is a list entry, not a risk. */
  "risks.owned": async () => {
    const total = await count("select count(*) as n from risks");
    const owned = await count("select count(*) as n from risks where trim(owner) <> ''");
    return {
      done: total > 0 && owned === total,
      detail: total === 0 ? "no risks yet" : `${owned} of ${total} have an owner`,
    };
  },

  /**
   * Every risk being reduced points at what reduces it. Accepted, transferred
   * and avoided risks are not expected to, so they are left out.
   */
  "risks.linked": async () => {
    const total = await count("select count(*) as n from risks where treatment = 'Mitigate'");
    const linked = await count(
      `select count(*) as n from risks r
        where r.treatment = 'Mitigate'
          and exists (select 1 from risk_controls rc where rc.risk_id = r.id)`,
    );
    const item = (await packMeta()).itemLabel.toLowerCase();
    return {
      done: total > 0 && linked === total,
      detail: total === 0 ? "no risks being reduced yet" : `${linked} of ${total} linked to a ${item}`,
    };
  },

  /**
   * Both tiers chosen, on both dimensions.
   *
   * A tier is a statement about how the organisation manages risk, not a score
   * out of four, and choosing where you intend to be is the decision the rest
   * of the profile hangs off.
   */
  "programme.tiers": async () => {
    const { rows } = await query<{ attrs: string }>("select attrs from programme where id = 1");
    const tiers = (JSON.parse(rows[0]?.attrs ?? "{}")["tiers"] ?? {}) as Record<string, unknown>;
    const wanted = { govCur: "governance today", govTgt: "governance target", rmCur: "risk management today", rmTgt: "risk management target" };
    const missing = Object.entries(wanted)
      .filter(([key]) => !Number(tiers[key]))
      .map(([, label]) => label);
    return {
      done: missing.length === 0,
      detail: missing.length ? `still to choose: ${missing.join(", ")}` : "current and target tiers are set",
    };
  },

  /** Where each outcome stands today: the current profile. */
  "controls.currentProfile": async () => {
    const { rows } = await query<{ attrs: string }>("select attrs from controls where status <> 'not_applicable'");
    const described = rows.filter((r) => String(JSON.parse(r.attrs || "{}")["curState"] ?? "").trim());
    const item = (await packMeta()).itemLabel.toLowerCase();
    return {
      done: rows.length > 0 && described.length === rows.length,
      detail: `${described.length} of ${rows.length} ${plurals(item)} describe where you are now`,
    };
  },

  /** And where you mean to get to: the target profile. */
  "controls.targetProfile": async () => {
    const { rows } = await query<{ attrs: string }>("select attrs from controls where status <> 'not_applicable'");
    const targeted = rows.filter((r) => String(JSON.parse(r.attrs || "{}")["tgtState"] ?? "").trim());
    const item = (await packMeta()).itemLabel.toLowerCase();
    return {
      done: rows.length > 0 && targeted.length === rows.length,
      detail: `${targeted.length} of ${rows.length} ${plurals(item)} say where you intend to be`,
    };
  },

  /**
   * The system this is all about: named, described, and with its boundary
   * drawn. An authorisation package without a boundary is a list of controls
   * around nothing in particular.
   */
  "programme.system": async () => {
    const { rows } = await query<{ attrs: string }>("select attrs from programme where id = 1");
    const system = (JSON.parse(rows[0]?.attrs ?? "{}")["system"] ?? {}) as Record<string, string>;
    const wanted = { name: "a name", description: "a description", boundary: "an authorisation boundary" };
    const missing = Object.entries(wanted)
      .filter(([key]) => !(system[key] ?? "").trim())
      .map(([, label]) => label);
    return {
      done: missing.length === 0,
      detail: missing.length ? `still needs ${missing.join(", ")}` : `the system is described: ${system["name"]}`,
    };
  },

  /** A baseline chosen and applied, which is what scopes the catalogue. */
  "baseline.applied": async () => {
    const { rows } = await query<{ attrs: string }>("select attrs from programme where id = 1");
    const level = String(JSON.parse(rows[0]?.attrs ?? "{}")["baseline"] ?? "");
    const inScope = await count(
      "select count(*) as n from controls where json_extract(attrs, '$.inBaseline') = 1",
    );
    return {
      done: Boolean(level) && inScope > 0,
      detail: level ? `${level} baseline, ${plural(inScope, "control")} in scope` : "no baseline chosen yet",
    };
  },

  /**
   * The organisation-defined parameters filled in, on the controls in scope
   * that have them. A control that says "within [assignment: organisation-
   * defined time period]" has not been implemented until somebody says what
   * that period is.
   */
  "controls.parameters": async () => {
    const parameters = await readPack<Record<string, unknown[]>>("parameters.json").catch(() => ({}));
    const refs = new Set(Object.keys(parameters));
    if (refs.size === 0) return { done: true, detail: "this framework has no parameters" };

    const { rows } = await query<{ ref: string; attrs: string }>(
      "select ref, attrs from controls where status <> 'not_applicable'",
    );
    const wanted = rows.filter((r) => refs.has(r.ref));
    const filled = wanted.filter((r) => {
      const values = (JSON.parse(r.attrs || "{}")["paramValues"] ?? {}) as Record<string, string>;
      return Object.values(values).some((v) => String(v ?? "").trim() !== "");
    });
    return {
      done: wanted.length > 0 && filled.length === wanted.length,
      detail:
        wanted.length === 0
          ? "nothing in scope needs parameters yet"
          : `${filled.length} of ${wanted.length} that need values have them`,
    };
  },

  /** Who actually implements each control: you, a provider, or both. */
  "controls.origination": async () => {
    const { rows } = await query<{ attrs: string }>(
      "select attrs from controls where status <> 'not_applicable'",
    );
    const set = rows.filter((r) => String(JSON.parse(r.attrs || "{}")["origination"] ?? "").trim());
    return {
      done: rows.length > 0 && set.length === rows.length,
      detail: `${set.length} of ${rows.length} in scope say who implements them`,
    };
  },

  /** An owner on everything that applies. Excluded items need none. */
  "controls.owned": async () => {
    const total = await count("select count(*) as n from controls where status <> 'not_applicable'");
    const owned = await count(
      "select count(*) as n from controls where status <> 'not_applicable' and trim(owner) <> ''",
    );
    return {
      done: total > 0 && owned === total,
      detail: `${owned} of ${total} that apply have an owner`,
    };
  },

  /**
   * A reason against every control, included or excluded.
   *
   * ISO 27001 asks the Statement of Applicability to justify inclusions as well
   * as exclusions, so "nothing excluded" is not the same as "finished" - which
   * is also what stops this showing green on a fresh install.
   */
  "soa.justified": async () => {
    const total = await count("select count(*) as n from controls");
    const reasoned = await count("select count(*) as n from controls where trim(justification) <> ''");
    const bare = await count(
      "select count(*) as n from controls where status = 'not_applicable' and trim(justification) = ''",
    );
    return {
      done: total > 0 && reasoned === total,
      detail:
        `${reasoned} of ${total} have a reason` +
        (bare ? `; ${plural(bare, "exclusion")} with no reason at all` : ""),
    };
  },

  "reports.soaExported": async () => {
    const { rows } = await query<{ at: string }>(
      `select ts as at from audit_log
        where action = 'Report generated' and entity_id = 'statement-of-applicability'
        order by ts desc limit 1`,
    );
    const last = rows[0];
    return {
      done: Boolean(last),
      detail: last ? `last exported ${last.at.slice(0, 10)}` : "not exported yet",
    };
  },

  /** Internal audit results are recorded as findings, typed by severity. */
  "registers.findings": async () => {
    const n = await count("select count(*) as n from findings");
    return { done: n > 0, detail: n ? `${plural(n, "finding")} recorded` : "nothing recorded yet" };
  },

  /** Nothing still open without somebody and a date against it. */
  "findings.owned": async () => {
    const total = await count("select count(*) as n from findings");
    const open = await count("select count(*) as n from findings where status <> 'Closed'");
    const loose = await count(
      "select count(*) as n from findings where status <> 'Closed' and (trim(owner) = '' or due_date is null)",
    );
    return {
      done: total > 0 && loose === 0,
      detail:
        total === 0
          ? "no findings recorded yet"
          : loose
          ? `${plural(loose, "open finding")} with no owner or due date`
          : `${plural(open, "open finding")}, all with an owner and a due date`,
    };
  },

  // ── SOC ───────────────────────────────────────────────────────────────────

  /**
   * Scope is decided: something has been ruled out, and everything ruled out
   * says why. Unlike an ISO Statement of Applicability, a SOC report does not
   * justify what is in; it is the exclusions a CPA firm asks about. Keeping
   * every category in is possible but rare, so a fresh install is not green.
   */
  "soc.scoped": async () => {
    const excluded = await count("select count(*) as n from controls where status = 'not_applicable'");
    const bare = await count(
      "select count(*) as n from controls where status = 'not_applicable' and trim(justification) = ''",
    );
    return {
      done: excluded > 0 && bare === 0,
      detail: excluded === 0
        ? "nothing ruled out yet: decide which categories are in the report"
        : bare
        ? `${plural(bare, "item")} ruled out with no reason`
        : `${plural(excluded, "item")} ruled out, each with a reason`,
    };
  },

  /** Every criterion in scope has been tested at least once. Type II is all about this. */
  "soc.tested": async () => {
    const total = await count("select count(*) as n from controls where status <> 'not_applicable'");
    const tested = await count(
      `select count(*) as n from controls c where c.status <> 'not_applicable'
          and exists (select 1 from control_tests t where t.control_id = c.id)`,
    );
    return { done: total > 0 && tested === total, detail: `${tested} of ${total} in scope tested` };
  },

  /** No criterion in scope whose most recent test failed. An auditor would call it an exception. */
  "soc.passing": async () => {
    const tested = await count(
      `select count(*) as n from controls c where c.status <> 'not_applicable'
          and exists (select 1 from control_tests t where t.control_id = c.id)`,
    );
    const failing = await count(
      `select count(*) as n from controls c where c.status <> 'not_applicable'
          and (select t.result from control_tests t where t.control_id = c.id
                order by t.tested_on desc, t.created_at desc limit 1) in ('Fail', 'Partial')`,
    );
    return {
      done: tested > 0 && failing === 0,
      detail: tested === 0 ? "nothing tested yet" : failing ? `${plural(failing, "criterion", "criteria")} failing their last test` : "every last test passed",
    };
  },

  "registers.vendors": async () => {
    const n = await count("select count(*) as n from vendors where status <> 'Exited'");
    return { done: n > 0, detail: n ? `${plural(n, "vendor")} recorded` : "nothing recorded yet" };
  },

  /**
   * Every high-criticality vendor reviewed in the last year, with the
   * assurance it gave written down (CC9.2). Subservice organisations are here.
   */
  "soc.vendorsReviewed": async () => {
    const total = await count("select count(*) as n from vendors where status <> 'Exited' and criticality = 'High'");
    const done = await count(
      `select count(*) as n from vendors where status <> 'Exited' and criticality = 'High'
          and trim(assurance) <> '' and assessed_date >= date('now', '-12 months')`,
    );
    return {
      done: total > 0 && done === total,
      detail: total ? `${done} of ${total} high-criticality vendors reviewed in the last 12 months` : "no high-criticality vendors recorded",
    };
  },

  "registers.training": async () => {
    const n = await count("select count(*) as n from training where result = 'Completed'");
    return { done: n > 0, detail: n ? `${plural(n, "completed training record")}` : "no completed training recorded" };
  },

  /** An internal review of the controls has been held (CC4.1). */
  "soc.internalReview": async () => {
    const n = await count("select count(*) as n from reviews where status = 'Completed'");
    return { done: n > 0, detail: n ? `${plural(n, "review")} completed` : "none held yet" };
  },

  /** The audit is booked: a SOC report recorded with a CPA firm and a period. */
  "soc.engaged": async () => {
    const n = await count(
      `select count(*) as n from engagements where status <> 'Cancelled'
          and trim(auditor) <> '' and period_end is not null`,
    );
    return { done: n > 0, detail: n ? `${plural(n, "SOC report")} with a CPA firm and a period` : "no SOC report booked yet" };
  },

  "soc.issued": async () => {
    const { rows } = await query<{ title: string; report_date: string }>(
      `select title, report_date from engagements where status = 'Report issued' order by report_date desc limit 1`,
    );
    const last = rows[0];
    return { done: Boolean(last), detail: last ? `${last.title}, issued ${last.report_date}` : "no report issued yet" };
  },

  /**
   * Somebody has exported a report. Read from the audit log rather than from a
   * flag, because the audit log is written whether or not anybody thought
   * about this feature, and it cannot be set by accident.
   */
  "reports.exported": async () => {
    const { rows } = await query<{ entity_id: string; at: string }>(
      `select entity_id, ts as at from audit_log
        where action = 'Report generated'
        order by ts desc limit 1`,
    );
    const last = rows[0];
    return {
      done: Boolean(last),
      detail: last ? `last export ${last.at.slice(0, 10)} (${last.entity_id})` : "nothing exported yet",
    };
  },
};

/** Whether a named check exists. Used to validate a pack on load. */
export const hasCheck = (name: string): boolean => Object.hasOwn(CHECKS, name);

/**
 * Runs every check a set of tasks asks for, once each.
 *
 * Tasks share checks — two stages can both care about evidence — so this
 * de-duplicates first. A check that throws is reported as not done rather than
 * taking the whole screen down with it: a broken check should cost the
 * customer one green tick, not their plan.
 */
export async function runChecks(names: string[]): Promise<Record<string, CheckResult>> {
  const wanted = [...new Set(names)].filter(hasCheck);
  const out: Record<string, CheckResult> = {};

  await Promise.all(
    wanted.map(async (name) => {
      try {
        out[name] = await CHECKS[name]!();
      } catch {
        out[name] = { done: false, detail: "could not be checked" };
      }
    }),
  );

  return out;
}
