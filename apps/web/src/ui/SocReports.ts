import { useEffect, useState } from "preact/hooks";
import type { VNode } from "preact";
import { html } from "./html.js";
import { engagements, organisation, socReadiness, socReports, type AuditorRequest, type RegisterRow, type SocDashboard } from "../persistence/apiClient.js";

/**
 * Below the SOC reports register: when to start the next period, what the CPA
 * firm will ask for, and the public trust page.
 */

const DAY = 86_400_000;
const t = (d: string): number => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const monthLong = (d: string): string =>
  new Date(t(d)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const dayShort = (d: string): string =>
  new Date(t(d)).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/** The first of each of the next six months. */
function starts(): string[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => iso(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1)));
}

function WhatIf({ d }: { d: SocDashboard | null }): VNode {
  const options = starts();
  const [i, setI] = useState(1);
  const [months, setMonths] = useState(6);
  const start = options[i]!;
  const endMs = Date.UTC(new Date(t(start)).getUTCFullYear(), new Date(t(start)).getUTCMonth() + months, 0);
  const report = iso(endMs + 60 * DAY);
  const ready = d?.projectedReady ?? null;
  const done = (d?.readyPct ?? 0) >= 100;

  let pill: [string, string];
  if (done || (ready && t(ready) <= t(start) - 14 * DAY)) {
    const slack = done ? null : Math.round((t(start) - t(ready!)) / DAY);
    pill = ["green", done ? "Every criterion in scope is already in place." : `Ready ${slack} days before it starts.`];
  } else if (ready && t(ready) <= t(start)) {
    pill = ["amber", `Tight: ready only ${Math.round((t(start) - t(ready)) / DAY)} days before it starts.`];
  } else if (ready) {
    pill = ["red", `Too soon: at this pace you are ready on ${dayShort(ready)}, after it starts. Controls not working yet would show as exceptions.`];
  } else {
    pill = ["amber", "No pace to forecast from yet, so this cannot say whether you'll be ready. It builds up as the nightly snapshot runs."];
  }
  const label = { green: "Safe", amber: "Check", red: "Too soon" }[pill[0]];

  return html`<div class="card pad">
    <div class="sr-lbl">What if the period started…</div>
    <input type="range" min="0" max=${options.length - 1} step="1" value=${i} style="width:100%"
      onInput=${(e: Event) => setI(Number((e.target as HTMLInputElement).value))} aria-label="Period start month" />
    <div class="sp-ticks">${options.map((o) => html`<span>${dayShort(o)}</span>`)}</div>
    <div class="sp-row">
      <label class="muted">Type II period
        <select value=${months} onChange=${(e: Event) => setMonths(Number((e.target as HTMLSelectElement).value))}>
          <option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option>
        </select></label>
    </div>
    <div class="sr-big" style="font-size:22px;margin-top:8px">Report around ${monthLong(report)}</div>
    <p style="margin:4px 0 0;font-size:13px"><span class=${`pill ${pill[0]}`}>${label}</span> ${pill[1]}</p>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Period ${dayShort(start)} to ${dayShort(iso(endMs))}. Reports usually arrive about two months after the period ends.</p>
  </div>`;
}

function AuditorAsks(): VNode {
  const [data, setData] = useState<{ period: { start: string; end: string; label: string }; requests: AuditorRequest[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { socReports.requests().then(setData).catch((e: Error) => setErr(e.message)); }, []);
  if (err) return html`<div class="card pad err">${err}</div>`;
  if (!data) return html`<div class="card pad muted">Loading…</div>`;
  const ready = data.requests.filter((r) => r.ready).length;
  return html`<div class="card pad">
    <div class="sr-lbl">What your auditor will ask for</div>
    <div class="sr-big" style="font-size:24px">${ready} of ${data.requests.length} ready</div>
    <p class="muted" style="font-size:12.5px;margin:2px 0 8px">For ${data.period.label}, ${dayShort(data.period.start)} to ${dayShort(data.period.end)}.</p>
    <div class="sp-reqs">
      ${data.requests.map((r) => html`<a class="sp-req" href=${`#/${r.route}`} key=${r.id} title=${r.criteria}>
        <i class=${r.ready ? "ok" : "no"}>${r.ready ? "✓" : "!"}</i>
        <span><b>${r.request}</b><br /><span class="muted">${r.criteria} · ${r.detail}</span></span>
      </a>`)}
    </div>
    <a class="btn" style="margin-top:10px" href=${socReports.requestsCsvUrl} download="auditor-request-list.csv">Export the list (CSV)</a>
  </div>`;
}

function TrustPage(): VNode {
  // Drawn here from the same records the downloaded page is built from: the
  // app does not allow itself to be framed, so an <iframe> preview stays blank.
  const [org, setOrg] = useState("");
  const [issued, setIssued] = useState<RegisterRow[]>([]);
  useEffect(() => {
    organisation.get().then(setOrg).catch(() => {});
    engagements.list().then((all) => setIssued(all.filter((e) => e["status"] === "Report issued"))).catch(() => {});
  }, []);
  const day = (d: unknown): string => (d ? dayShort(String(d)) + " " + String(d).slice(0, 4) : "");
  return html`<div class="card pad">
    <div class="sr-lbl">Your public trust page</div>
    <p class="muted" style="font-size:13px;margin:0 0 10px">One page for your website, built from the issued reports above: what you hold, the period, the categories, when the next is due, and how to ask for the full report under NDA. Prospects can check it without a questionnaire.</p>
    <div class="sp-trust">
      <div class="sp-trust-h">${org || "Your company"} · Security and compliance</div>
      <div class="muted" style="font-size:12.5px;margin-bottom:10px">Independent CPA firms examine our controls every year. These are our current reports.</div>
      ${issued.length
        ? issued.map((r) => html`<div class="sp-trust-r" key=${String(r["id"])}>
            <div style="display:flex;justify-content:space-between;gap:8px"><b>${String(r["report"])}${r["report_type"] === "Not applicable" ? "" : ` ${String(r["report_type"])}`}</b>
              <span class="pill green">${r["opinion"] === "Unmodified" ? "Clean opinion" : String(r["opinion"])}</span></div>
            <div class="muted" style="font-size:12px">${String(r["categories"] || "Security")} · ${r["report_type"] === "Type II" && r["period_start"] ? `${day(r["period_start"])} to ${day(r["period_end"])}` : `as of ${day(r["period_end"])}`}${r["next_due"] ? ` · next due ${day(r["next_due"])}` : ""}</div>
          </div>`)
        : html`<div class="sp-trust-r muted">Our first SOC report is in progress.</div>`}
    </div>
    <div class="row-actions" style="margin-top:10px">
      <a class="btn primary" href=${`${socReports.trustPageUrl}?download=1`} download="trust.html">Download the page</a>
      <a class="btn" href=${socReports.trustPageUrl} target="_blank" rel="noopener">Open it full size</a>
    </div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Put trust.html on your website, for example at /trust. Download it again whenever a new report is issued. The contact address comes from Policies → Templates → About your company.</p>
  </div>`;
}

export function SocReportsExtras(): VNode {
  const [d, setD] = useState<SocDashboard | null>(null);
  useEffect(() => { socReadiness.dashboard().then(setD).catch(() => setD(null)); }, []);
  return html`<div class="sr-cols">
    <div class="sr-col">
      <${WhatIf} d=${d} />
      <${TrustPage} />
    </div>
    <div class="sr-col" style="position:static">
      <${AuditorAsks} />
    </div>
  </div>`;
}
