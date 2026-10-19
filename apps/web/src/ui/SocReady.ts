import { useEffect, useState } from "preact/hooks";
import type { VNode } from "preact";
import { html } from "./html.js";
import {
  controlTests, engagements, organisation, programme, socReadiness,
  type Journey, type JourneyTask, type LikelyException, type SocReadiness,
} from "../persistence/apiClient.js";

/**
 * The SOC parts of Get ready: the progress panel, the in-card actions for the
 * steps that can be done without leaving the screen, "If the auditor came
 * today", what to fix first, quick wins and bulk changes.
 *
 * Every action here changes the real records. Steps the product checks for
 * itself turn green because the data changed, not because a box was ticked.
 */

const SHORT: Record<string, string> = {
  setup: "Set up", scope: "Scope", risk: "Risks", controls: "Controls",
  evidence: "Evidence", test: "Test", audit: "Audit", report: "Report",
};

const go = (route: string): void => { window.location.hash = `#/${route}`; };

// ── the strip and the progress panel ─────────────────────────────────────────

export function ReadyStrip({ plan, ready }: { plan: Journey; ready: SocReadiness | null }): VNode {
  const e = ready?.engagement;
  return html`<div class="sr-strip">
    <span><b>${plan.pct}% ready</b>
      ${e ? html` · ${e.daysToEnd !== null && e.daysToEnd >= 0 ? `${e.daysToEnd} days to the end of your ${e.report} ${e.reportType === "Not applicable" ? "" : e.reportType} period` : e.title}` : " · no SOC report booked yet"}
      ${ready ? ` · ${ready.exceptions.length} likely exception${ready.exceptions.length === 1 ? "" : "s"}` : ""}</span>
    <a href="#/dashboard">View dashboard →</a>
  </div>`;
}

export function ProgressPanel({ plan, current, onPick, snoozed }: {
  plan: Journey;
  current: JourneyTask | undefined;
  onPick: (taskId: string) => void;
  snoozed: Set<string>;
}): VNode {
  const [open, setOpen] = useState(false);
  const stageOf = plan.stages.find((s) => s.tasks.some((t) => t.id === current?.id)) ?? plan.stages.find((s) => !s.complete) ?? plan.stages[0]!;
  const si = plan.stages.indexOf(stageOf);
  const left = plan.applicable - plan.done;
  const icon = (t: JourneyTask): [string, string, string] =>
    t.state === "done" ? ["d", "✓", "Done"]
      : t.state === "not_applicable" ? ["n", "–", "Does not apply"]
      : t.id === current?.id ? ["c", "▶", "Next"]
      : snoozed.has(t.id) ? ["s", "↻", "Tomorrow"]
      : ["t", "", t.automatic ? "Checked for you" : "To do"];

  return html`<div class="card pad sr-plan">
    <div class="sr-planhead">
      <div>
        <div class="sr-lbl">${plan.title}</div>
        <div class="muted" style="font-size:13px"><b style="color:var(--ink)">${plan.done} of ${plan.applicable} steps done</b>
          ${" "}· you are on <b style="color:var(--brand)">stage ${si + 1} of ${plan.stages.length}, ${stageOf.name}</b></div>
      </div>
      <div style="text-align:right">
        <div class="sr-big" style="color:var(--green)">${plan.pct}%</div>
        <div class="muted" style="font-size:12px">${left ? `${left} step${left === 1 ? "" : "s"} to go` : "all done"}</div>
      </div>
    </div>
    <div class="sr-stepper">
      ${plan.stages.map((s, i) => {
        const first = s.tasks.find((t) => t.state === "outstanding") ?? s.tasks[0];
        return html`<button type="button" key=${s.id} class=${`sr-stp${s.complete ? " done" : ""}${i === si ? " now" : ""}`}
            title=${s.name} onClick=${() => first && onPick(first.id)}>
          <span class="sr-dot">${s.complete ? "✓" : i + 1}</span>
          <span>${SHORT[s.id] ?? s.name}</span>
          <span class="sr-bar"><i style=${`width:${s.pct}%`}></i></span>
          <span class="sr-of">${s.done} of ${s.applicable}</span>
        </button>`;
      })}
    </div>
    <div class="sr-planfoot">
      <span class="muted">This stage: ${stageOf.done} of ${stageOf.applicable} done${snoozed.size ? ` · ${snoozed.size} put off until tomorrow` : ""}</span>
      <button type="button" class="linkish" onClick=${() => setOpen((v) => !v)}>${open ? "Hide the plan ▴" : "See the whole plan ▾"}</button>
    </div>
    ${open
      ? html`<div class="sr-planlist">
          ${plan.stages.map((s, i) => html`<div class="sr-pstage" key=${s.id}>
            <div class="sr-pstage-h"><span>${i + 1}. ${s.name}</span>
              <span class=${`pill ${s.complete ? "green" : i === si ? "blue" : "slate"}`}>${s.done} of ${s.applicable}</span></div>
            ${s.tasks.map((t) => {
              const [cls, mark, label] = icon(t);
              return html`<button type="button" key=${t.id} class=${`sr-ptask${t.id === current?.id ? " cur" : ""}`} onClick=${() => onPick(t.id)}>
                <span class=${`sr-ic ${cls}`}>${mark}</span><span class="sr-pt">${t.title}</span><span class="muted">${label}</span>
              </button>`;
            })}
          </div>`)}
        </div>`
      : null}
  </div>`;
}

// ── in-card actions: the steps that can be done here ─────────────────────────

/** Whether a step can be done inside the card, and how to say so. */
export const INLINE: Record<string, string> = {
  "setup.branding": "Fill it in here",
  "scope.report": "Choose here",
  "scope.system": "Write it here",
  "scope.commitments": "Write it here",
  "scope.categories": "Tick here",
  "controls.owners": "Do it here",
  "audit.book": "Fill it in here",
  "report.issued": "Fill it in here",
  "report.next": "Fill it in here",
};

const CATS: { key: string; name: string; themes: string[]; locked?: boolean }[] = [
  { key: "security", name: "Security (always in)", themes: [], locked: true },
  { key: "A1", name: "Availability", themes: ["A1"] },
  { key: "C1", name: "Confidentiality", themes: ["C1"] },
  { key: "PI1", name: "Processing integrity", themes: ["PI1"] },
  { key: "P", name: "Privacy", themes: ["P"] },
  { key: "CO", name: "SOC 1 control objectives", themes: ["CO"] },
];
const OWNER_GROUPS: { name: string; themes: string[] }[] = [
  { name: "CC1–CC5 Governance", themes: ["CC1", "CC2", "CC3", "CC4", "CC5"] },
  { name: "CC6 Access", themes: ["CC6"] },
  { name: "CC7 Operations", themes: ["CC7"] },
  { name: "CC8 Change", themes: ["CC8"] },
  { name: "CC9 Vendors and continuity", themes: ["CC9"] },
  { name: "Availability", themes: ["A1"] },
  { name: "Confidentiality", themes: ["C1"] },
  { name: "Processing integrity", themes: ["PI1"] },
  { name: "Privacy", themes: ["P"] },
  { name: "SOC 1 objectives", themes: ["CO"] },
];

export function InlineAction({ taskId, canEdit, onDone }: {
  taskId: string;
  canEdit: boolean;
  /** Called after the records changed, with a line saying what happened. */
  onDone: (said: string) => void;
}): VNode | null {
  const [text, setText] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("Not in our customer commitments");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string) => (e: Event) => setVals((v) => ({ ...v, [k]: (e.target as HTMLInputElement).value }));

  useEffect(() => {
    setErr("");
    if (taskId === "scope.system" || taskId === "scope.commitments") {
      programme.get().then((p) => setText((taskId === "scope.system" ? p.scope : p.methodology) ?? "")).catch(() => {});
    }
    if (taskId === "setup.branding") organisation.get().then((n) => setVals({ org: n })).catch(() => {});
    if (taskId === "scope.categories") setTicks({ A1: true, C1: false, PI1: false, P: false, CO: false });
    if (taskId === "audit.book") setVals({ firm: "", report: "SOC 2", type: "Type II", start: "", end: "" });
    if (taskId === "scope.report") setTicks({ "SOC 2": true, "SOC 1": false, "SOC 3": false });
  }, [taskId]);

  if (!INLINE[taskId]) return null;
  if (!canEdit) return html`<p class="muted">Your role can read this but not change it.</p>`;

  const run = async (fn: () => Promise<string>): Promise<void> => {
    setBusy(true); setErr("");
    try { onDone(await fn()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const latest = async (issued: boolean) => {
    const all = await engagements.list();
    const pick = all.find((e) => (issued ? e["status"] === "Report issued" : e["status"] !== "Report issued" && e["status"] !== "Cancelled"));
    return pick ?? all[0];
  };
  const save = (label = "Save and next") => html`<button class="btn primary" disabled=${busy} onClick=${() => void submit()}>${busy ? "Saving…" : label}</button>`;

  async function submit(): Promise<void> {
    switch (taskId) {
      case "scope.system":
      case "scope.commitments":
        if (!text.trim()) { setErr("Write a sentence or two first."); return; }
        return run(async () => {
          await programme.update(taskId === "scope.system" ? { scope: text.trim() } : { methodology: text.trim() });
          return taskId === "scope.system" ? "System description saved" : "Service commitments saved";
        });
      case "setup.branding":
        if (!(vals["org"] ?? "").trim()) { setErr("Type your organisation's name first."); return; }
        return run(async () => { await organisation.set(vals["org"]!.trim()); return "Organisation name saved. Add your logo in Reports."; });
      case "scope.categories": {
        const out = CATS.filter((c) => !c.locked && !ticks[c.key]);
        if (out.length && !reason.trim()) { setErr("Say why the unticked ones are out of scope."); return; }
        return run(async () => {
          for (const c of out) for (const t of c.themes) await socReadiness.bulk({ theme: t, outOfScope: reason.trim() });
          return out.length ? `${out.map((c) => c.name).join(", ")} marked out of scope` : "Every category kept in scope";
        });
      }
      case "controls.owners": {
        const chosen = OWNER_GROUPS.filter((g) => (vals[g.name] ?? "").trim());
        if (!chosen.length) { setErr("Type an owner for at least one group."); return; }
        return run(async () => {
          let n = 0;
          for (const g of chosen) for (const t of g.themes) n += (await socReadiness.bulk({ theme: t, owner: vals[g.name]!.trim() })).updated;
          return `${n} criteria now have an owner`;
        });
      }
      case "scope.report": {
        const picked = Object.entries(ticks).filter(([, on]) => on).map(([k]) => k);
        if (!picked.length) { setErr("Choose at least one report."); return; }
        return run(async () => {
          const year = new Date().getFullYear() + 1;
          const have = (await engagements.list()).map((e) => String(e["report"]));
          for (const r of picked.filter((p) => !have.includes(p))) {
            await engagements.create({ title: `${r} ${r === "SOC 3" ? "" : "Type II, "}${year}`.replace("  ", " "), report: r,
              reportType: r === "SOC 3" ? "Not applicable" : "Type II", status: "Planning", categories: "Security" });
          }
          return `${picked.join(" and ")} recorded in SOC reports`;
        });
      }
      case "audit.book":
        if (!(vals["firm"] ?? "").trim() || !vals["end"]) { setErr("Fill in the CPA firm and when the period ends."); return; }
        return run(async () => {
          const body = { title: `${vals["report"]} ${vals["type"]}, ${vals["end"]!.slice(0, 4)}`, report: vals["report"], reportType: vals["type"],
            auditor: vals["firm"]!.trim(), periodStart: vals["type"] === "Type II" ? vals["start"] || null : null, periodEnd: vals["end"], status: "Readiness" };
          const cur = await latest(false);
          if (cur && cur["status"] !== "Report issued") await engagements.update(String(cur["id"]), body);
          else await engagements.create(body);
          return `${vals["firm"]} booked, period ends ${vals["end"]}`;
        });
      case "report.issued":
        if (!vals["date"] || !vals["opinion"]) { setErr("Fill in the date and the opinion."); return; }
        return run(async () => {
          const cur = await latest(false);
          if (!cur) throw new Error("Record the report in SOC reports first.");
          await engagements.update(String(cur["id"]), { status: "Report issued", reportDate: vals["date"], opinion: vals["opinion"] });
          return `${cur["title"]} recorded as issued`;
        });
      case "report.next":
        if (!vals["due"]) { setErr("Choose a date."); return; }
        return run(async () => {
          const cur = await latest(true);
          if (!cur) throw new Error("Record the issued report first.");
          await engagements.update(String(cur["id"]), { nextDue: vals["due"] });
          return `Next report due ${vals["due"]}. A reminder goes out before then.`;
        });
    }
  }

  const body = (): VNode => {
    switch (taskId) {
      case "scope.system":
        return html`<textarea rows="4" value=${text} onInput=${(e: Event) => setText((e.target as HTMLTextAreaElement).value)}
          placeholder="Acme Payroll is a cloud service that runs payroll for UK employers. It runs on AWS and is built and operated by our engineering team. Internal tools that never touch customer data are outside the boundary."></textarea>`;
      case "scope.commitments":
        return html`<textarea rows="4" value=${text} onInput=${(e: Event) => setText((e.target as HTMLTextAreaElement).value)}
          placeholder="99.9% monthly uptime. Customer data encrypted at rest and in transit. Support answers within one business day."></textarea>`;
      case "setup.branding":
        return html`<div class="sr-form"><label>Organisation name<input value=${vals["org"] ?? ""} onInput=${set("org")} /></label></div>`;
      case "scope.categories":
        return html`<div>
          ${CATS.map((c) => html`<label class="sr-check" key=${c.key}>
            <input type="checkbox" checked=${c.locked || Boolean(ticks[c.key])} disabled=${c.locked}
              onChange=${(e: Event) => setTicks((t) => ({ ...t, [c.key]: (e.target as HTMLInputElement).checked }))} /> ${c.name}</label>`)}
          <label class="sr-form" style="margin-top:8px">Why the unticked ones are out of scope
            <input value=${reason} onInput=${(e: Event) => setReason((e.target as HTMLInputElement).value)} /></label>
        </div>`;
      case "controls.owners":
        return html`<table class="sr-table"><tbody>
          ${OWNER_GROUPS.map((g) => html`<tr key=${g.name}><td>${g.name}</td>
            <td><input placeholder="Owner's name" value=${vals[g.name] ?? ""} onInput=${set(g.name)} /></td></tr>`)}
        </tbody></table>`;
      case "scope.report":
        return html`<div>${[
          ["SOC 2", "Security of your service. What most customers ask for"],
          ["SOC 1", "Your service affects customers' financial statements"],
          ["SOC 3", "Public summary, issued with a SOC 2 Type II"],
        ].map(([k, d]) => html`<label class="sr-opt" key=${k}><input type="checkbox" checked=${Boolean(ticks[k!])}
            onChange=${(e: Event) => setTicks((t) => ({ ...t, [k!]: (e.target as HTMLInputElement).checked }))} />
          <span><b>${k}</b><br /><span class="muted">${d}</span></span></label>`)}</div>`;
      case "audit.book":
        return html`<div class="sr-form">
          <label>CPA firm<input value=${vals["firm"] ?? ""} onInput=${set("firm")} placeholder="Example CPA LLP" /></label>
          <label>Report<select value=${vals["report"]} onChange=${set("report")}><option>SOC 2</option><option>SOC 1</option></select></label>
          <label>Type<select value=${vals["type"]} onChange=${set("type")}><option>Type II</option><option>Type I</option></select></label>
          ${vals["type"] === "Type II" ? html`<label>Period starts<input type="date" value=${vals["start"] ?? ""} onInput=${set("start")} /></label>` : null}
          <label>${vals["type"] === "Type II" ? "Period ends" : "As of"}<input type="date" value=${vals["end"] ?? ""} onInput=${set("end")} /></label>
        </div>`;
      case "report.issued":
        return html`<div class="sr-form">
          <label>Issued on<input type="date" value=${vals["date"] ?? ""} onInput=${set("date")} /></label>
          <label>Opinion<select value=${vals["opinion"] ?? ""} onChange=${set("opinion")}>
            <option value="">Choose…</option><option>Unmodified</option><option>Qualified</option><option>Adverse</option><option>Disclaimer</option></select></label>
        </div>`;
      case "report.next":
        return html`<div class="sr-form"><label>Next report due<input type="date" value=${vals["due"] ?? ""} onInput=${set("due")} /></label></div>`;
      default:
        return html`<span></span>`;
    }
  };

  return html`<div class="sr-inline">
    ${body()}
    ${err ? html`<div class="err" role="alert" style="margin-top:8px">${err}</div>` : null}
    <div style="margin-top:10px">${save()}</div>
  </div>`;
}

// ── "If the auditor came today" ──────────────────────────────────────────────

const PILL: Record<LikelyException["label"], string> = { Fail: "red", Gap: "red", Partial: "amber", Stale: "amber" };

export function AuditorToday({ ready, canEdit, onRerun }: {
  ready: SocReadiness | null;
  canEdit: boolean;
  onRerun: () => Promise<void>;
}): VNode {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [before, setBefore] = useState<number | null>(null);
  const [panel, setPanel] = useState<LikelyException | null>(null);

  if (!ready) return html`<div class="card pad muted">Working out what an auditor would find…</div>`;
  const list = all ? ready.exceptions : ready.exceptions.slice(0, 4);

  const rerun = async (): Promise<void> => {
    setBefore(ready.exceptions.length);
    setRunning(true);
    try { await onRerun(); } finally { setRunning(false); }
  };

  return html`<div class="card pad">
    <div class="sr-lbl">If the auditor came today</div>
    <div class="sr-big" style=${`color:${ready.exceptions.length ? "var(--red)" : "var(--green)"}`}>${ready.exceptions.length}</div>
    <div class="muted" style="font-size:13px;margin-bottom:6px">likely exception${ready.exceptions.length === 1 ? "" : "s"}${before !== null && before !== ready.exceptions.length ? `, was ${before}` : ""}</div>
    ${ready.exceptions.length === 0
      ? html`<p class="muted">Nothing an auditor would obviously write up. Keep the evidence coming as each control runs.</p>`
      : html`<div class=${all ? "sr-scroll" : ""}>
          ${list.map((x) => html`<div key=${x.id}>
            <button type="button" class=${`sr-exc${open === x.id ? " sel" : ""}`} onClick=${() => setOpen(open === x.id ? null : x.id)}>
              <span><span class="sr-chev">${open === x.id ? "▾" : "▸"}</span><b>${x.ref}</b> · ${x.title}</span>
              <span class=${`pill ${PILL[x.label]}`}>${x.label}</span>
            </button>
            ${open === x.id
              ? html`<div class="sr-howto">
                  <p><b>What the auditor will say:</b> ${x.says}</p>
                  <p><b>How to fix it:</b> ${x.fix}</p>
                  <div class="row-actions">
                    <button class="btn small primary" onClick=${() => setPanel(x)}>${x.action.label}</button>
                  </div>
                </div>`
              : null}
          </div>`)}
        </div>`}
    ${ready.exceptions.length > 4
      ? html`<button type="button" class="linkish" style="margin-top:8px" onClick=${() => setAll((v) => !v)}>
          ${all ? "Show fewer" : `Show all ${ready.exceptions.length}`}</button>`
      : null}
    <div class="muted" style="font-size:12px;margin-top:8px">Last checked ${new Date(ready.ranAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
    <button class="btn" style="margin-top:10px" disabled=${running} onClick=${() => void rerun()}>${running ? "Checking your records…" : "Run a mock audit"}</button>
    ${panel ? html`<${FixPanel} x=${panel} canEdit=${canEdit} onClose=${() => setPanel(null)} onFixed=${async () => { setPanel(null); await rerun(); }} />` : null}
  </div>`;
}

/**
 * Where an exception is fixed. A failed test is retested right here; anything
 * else opens the screen where its records live.
 */
function FixPanel({ x, canEdit, onClose, onFixed }: {
  x: LikelyException; canEdit: boolean; onClose: () => void; onFixed: () => Promise<void>;
}): VNode {
  const [tester, setTester] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState("Pass");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const retest = Boolean(x.controlId) && canEdit;

  const record = async (): Promise<void> => {
    if (!note.trim()) { setErr("Say what you looked at, for example 'the 5 leavers in March'."); return; }
    setBusy(true); setErr("");
    try {
      await controlTests.add(x.controlId!, { testedOn: new Date().toISOString().slice(0, 10), tester: tester.trim(), result, note: note.trim() });
      await onFixed();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return html`<div class="sr-modal" onClick=${(e: Event) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="sr-modal-box" role="dialog" aria-modal="true">
      <div class="sr-lbl">Fix this exception</div>
      <h3 style="margin:2px 0 10px"><b>${x.ref}</b> · ${x.title}</h3>
      <p class="muted" style="margin:0 0 12px">${x.fix}</p>
      ${retest
        ? html`<div class="sr-form">
            <label>Result<select value=${result} onChange=${(e: Event) => setResult((e.target as HTMLSelectElement).value)}>
              <option>Pass</option><option>Partial</option><option>Fail</option></select></label>
            <label>Tested by<input value=${tester} onInput=${(e: Event) => setTester((e.target as HTMLInputElement).value)} /></label>
            <label style="grid-column:1/-1">What you looked at<input value=${note} onInput=${(e: Event) => setNote((e.target as HTMLInputElement).value)} /></label>
          </div>`
        : html`<p>This is fixed on the <b>${x.action.route}</b> screen. When the records change, this list updates on its own.</p>`}
      ${err ? html`<div class="err" role="alert">${err}</div>` : null}
      <div class="row-actions" style="justify-content:flex-end;margin-top:14px">
        <button class="btn" onClick=${onClose}>Cancel</button>
        ${retest
          ? html`<button class="btn primary" disabled=${busy} onClick=${() => void record()}>${busy ? "Saving…" : "Record the test"}</button>`
          : html`<button class="btn primary" onClick=${() => go(x.action.route)}>${x.action.label}</button>`}
      </div>
    </div>
  </div>`;
}

// ── fix first, quick wins, bulk ──────────────────────────────────────────────

export function FixFirst({ ready }: { ready: SocReadiness | null }): VNode | null {
  if (!ready || !ready.fixFirst.length) return null;
  const removed = ready.fixFirst.reduce((n, x) => n + x.weight, 0);
  const all = ready.exceptions.reduce((n, x) => n + x.weight, 0);
  return html`<div class="card pad">
    <div class="sr-lbl">Fix these first · ranked by what they clear</div>
    ${ready.fixFirst.map((x) => html`<div class="sr-fix" key=${x.id}>
      <span class="sr-n">−${x.weight}</span>
      <span><b>${x.title}</b><br /><span class="muted">${x.ref} · ${x.fix}</span></span>
      <button class="btn small" onClick=${() => go(x.action.route)}>${x.action.label}</button>
    </div>`)}
    <p class="muted" style="font-size:12px;margin:10px 0 0">These three clear ${removed} of the ${all} gaps an auditor would find today.</p>
  </div>`;
}

export function QuickWins({ ready }: { ready: SocReadiness | null }): VNode | null {
  if (!ready) return null;
  if (!ready.quickWins.length) {
    return html`<div class="card pad"><div class="sr-lbl">Quick fixes</div>
      <p class="muted" style="margin:0">Nothing quick is waiting: every criterion has an owner, and policies, evidence and vendors all have their dates.</p></div>`;
  }
  const mins = ready.quickWins.reduce((n, w) => n + Math.min(w.count, 10) * w.minutes, 0);
  return html`<div class="card pad">
    <div class="sr-lbl">Got ${mins <= 15 ? "15" : "30"} minutes?</div>
    <div class="sr-big" style="font-size:20px">${ready.quickWins.reduce((n, w) => n + w.count, 0)} quick fixes</div>
    ${ready.quickWins.map((w) => html`<div class="sr-qw" key=${w.id}>
      <span>${w.title}</span><span class="muted">${w.count} · about ${w.minutes} min each</span>
      <button class="btn small" onClick=${() => go(w.route)}>Do it</button>
    </div>`)}
  </div>`;
}

export function BulkActions({ themes, canEdit, onDone }: {
  themes: Record<string, string>;
  canEdit: boolean;
  onDone: (said: string) => void;
}): VNode | null {
  const keys = Object.keys(themes);
  const [ownerTheme, setOwnerTheme] = useState(keys[0] ?? "");
  const [owner, setOwner] = useState("");
  const [outTheme, setOutTheme] = useState(keys.includes("P") ? "P" : keys[0] ?? "");
  const [reason, setReason] = useState("Not in our customer commitments");
  const [err, setErr] = useState("");
  if (!canEdit || !keys.length) return null;

  const apply = async (body: { theme: string; owner?: string; outOfScope?: string }, said: (n: number) => string): Promise<void> => {
    setErr("");
    try { onDone(said((await socReadiness.bulk(body)).updated)); } catch (e) { setErr((e as Error).message); }
  };
  const pick = (val: string, on: (v: string) => void) => html`<select value=${val} onChange=${(e: Event) => on((e.target as HTMLSelectElement).value)}>
    ${keys.map((k) => html`<option value=${k} key=${k}>${themes[k]}</option>`)}</select>`;

  return html`<div class="card pad" style="margin-top:16px">
    <div class="sr-lbl">Do it in bulk</div>
    <div class="sr-blk"><span>Give every criterion in</span>${pick(ownerTheme, setOwnerTheme)}<span>the owner</span>
      <input value=${owner} placeholder="Owner's name" onInput=${(e: Event) => setOwner((e.target as HTMLInputElement).value)} />
      <button class="btn" onClick=${() => owner.trim() ? void apply({ theme: ownerTheme, owner: owner.trim() }, (n) => `${n} criteria in ${themes[ownerTheme]} now owned by ${owner.trim()}`) : setErr("Type the owner's name.")}>Apply</button></div>
    <div class="sr-blk"><span>Mark out of scope</span>${pick(outTheme, setOutTheme)}<span>because</span>
      <input value=${reason} onInput=${(e: Event) => setReason((e.target as HTMLInputElement).value)} />
      <button class="btn" onClick=${() => void apply({ theme: outTheme, outOfScope: reason }, (n) => `${n} criteria in ${themes[outTheme]} marked out of scope`)}>Apply</button></div>
    ${err ? html`<div class="err" role="alert" style="margin-top:8px">${err}</div>` : null}
  </div>`;
}
