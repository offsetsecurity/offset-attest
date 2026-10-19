import { useState } from "preact/hooks";
import type { VNode } from "preact";
import { html } from "./html.js";
import type { SocDashboard } from "../persistence/apiClient.js";

/**
 * The SOC parts of the Dashboard: the flight path to the report, the
 * auditor's-eye view, the readiness forecast, evidence month by month across
 * the period, and who is carrying the work. Things to look at, not to do:
 * every number links to the screen where it is improved.
 */

const DAY = 86_400_000;
const t = (d: string): number => Date.parse(`${d}T00:00:00Z`);
const longDay = (d: string): string =>
  new Date(t(d)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDay = (d: string): string =>
  new Date(t(d)).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const monthName = (m: string): string =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });

export function FlightPath({ d }: { d: SocDashboard }): VNode {
  const e = d.engagement;
  const today = new Date().toISOString().slice(0, 10);
  const R = 72, C = 2 * Math.PI * R;
  const ring = html`<div class="sd-ring">
    <svg width="170" height="170" viewBox="0 0 170 170" style="transform:rotate(-90deg)">
      <circle cx="85" cy="85" r=${R} fill="none" stroke="#eef2f7" stroke-width="14" />
      <circle cx="85" cy="85" r=${R} fill="none" stroke="#16a34a" stroke-width="14" stroke-linecap="round"
        stroke-dasharray=${C} stroke-dashoffset=${C - (C * d.readyPct) / 100} />
    </svg>
    <div class="sd-ring-c"><b>${d.readyPct}%</b><span>criteria in place</span></div>
  </div>`;

  if (!e || !e.periodEnd) {
    return html`<div class="card pad sd-flight">
      <div>
        <div class="sr-lbl">Your flight path</div>
        <div class="sr-big">No SOC report booked yet</div>
        <p class="muted">Record the report you are aiming for, with its period, and this shows how many days you have and whether you will be ready in time.</p>
        <a class="btn small" href="#/engagements">Go to SOC reports</a>
      </div>
      ${ring}
    </div>`;
  }

  // Positions along the line: from 30 days before the period (or today) to 60 days after it ends.
  const start = e.periodStart ?? e.periodEnd;
  const from = Math.min(t(today), t(start)) - 30 * DAY;
  const to = t(e.periodEnd) + 75 * DAY;
  const x = (d0: string): number => 20 + ((t(d0) - from) / (to - from)) * 720;
  const report = new Date(t(e.periodEnd) + 60 * DAY).toISOString().slice(0, 10);
  const ready = d.projectedReady;
  const inPeriod = today >= start && today <= e.periodEnd;
  const lead = e.daysToEnd !== null && e.daysToEnd >= 0
    ? `${e.daysToEnd} days to the end of your period`
    : `Period ended ${longDay(e.periodEnd)}`;
  const sub = ready
    ? ready <= start
      ? html`At this pace you're control-ready on <b style="color:var(--green)">${longDay(ready)}</b>, before your period starts.`
      : html`At this pace you're control-ready on <b style="color:var(--amber)">${longDay(ready)}</b>${inPeriod ? ", during the period" : ", after the period starts"}.`
    : d.readyPct >= 100
      ? html`Every criterion in scope is in place. Keep the evidence coming as each control runs.`
      : html`Not enough history yet to forecast a ready date. It builds up as the nightly snapshot runs.`;

  return html`<div class="card pad sd-flight">
    <div style="min-width:0">
      <div class="sr-lbl">Your flight path · ${e.title}</div>
      <div class="sr-big">${lead}</div>
      <p class="muted" style="margin:4px 0 0">${sub}</p>
      <svg viewBox="0 0 760 92" width="100%" style="margin-top:14px" role="img" aria-label="Timeline from today to the report">
        <line x1="20" y1="40" x2="740" y2="40" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round" />
        <rect x=${x(start)} y="31" width=${Math.max(6, x(e.periodEnd) - x(start))} height="18" rx="9" fill="#dcfce7" stroke="#86efac" />
        <text x=${(x(start) + x(e.periodEnd)) / 2} y=${inPeriod ? 22 : 44} text-anchor="middle" font-size="11" font-weight="700" fill="#166534">${e.reportType === "Type II" ? "Observation period" : "As of"}</text>
        <line x1="20" y1="40" x2=${x(today)} y2="40" stroke="#16a34a" stroke-width="6" stroke-linecap="round" />
        <circle cx=${x(today)} cy="40" r="10" fill="#16a34a" stroke="#fff" stroke-width="3" />
        <text x=${x(today)} y="80" font-size="12" font-weight="700" fill="#0f172a" text-anchor="middle">Today</text>
        ${ready && t(ready) < to
          ? html`<circle cx=${x(ready)} cy="40" r="8" fill="#fff" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="4 3" />
              <text x=${x(ready)} y=${inPeriod ? 66 : 16} font-size="11" fill="#166534" text-anchor="middle">Ready ${shortDay(ready)}</text>`
          : null}
        <text x=${x(start)} y="80" font-size="11" fill="#64748b" text-anchor="middle">${shortDay(start)}</text>
        <text x=${x(e.periodEnd)} y="80" font-size="11" fill="#64748b" text-anchor="middle">${shortDay(e.periodEnd)}</text>
        <circle cx=${x(report)} cy="40" r="10" fill="#5b4bd6" />
        <text x=${x(report)} y="80" font-size="12" font-weight="700" fill="#3730a3" text-anchor="middle">Report ~${shortDay(report)}</text>
      </svg>
    </div>
    ${ring}
  </div>`;
}

export function LensSwitch({ d }: { d: SocDashboard }): VNode {
  const [on, setOn] = useState(false);
  return html`<div>
    <button type="button" class=${`sd-switch${on ? " on" : ""}`} aria-pressed=${on} onClick=${() => setOn((v) => !v)}>
      <i></i>See it as your auditor would
    </button>
    ${on
      ? html`<div class="card pad sd-lens">
          <div class="sr-lbl">Auditor's-eye view · ${d.lens.total} criteria in scope</div>
          <div class="sd-lcols">
            <a href="#/controls" style="background:#dcfce7;color:#14532d"><b>${d.lens.ready}</b>Ready to sample<span>in place, recent evidence, tested</span></a>
            <a href="#/evidence" style="background:#fef3c7;color:#78350f"><b>${d.lens.questions}</b>Will ask questions<span>evidence old, or never tested</span></a>
            <a href="#/getready" style="background:#fee2e2;color:#7f1d1d"><b>${d.lens.exceptions}</b>Will write an exception<span>not in place, failed, or no evidence</span></a>
          </div>
        </div>`
      : null}
  </div>`;
}

export function Forecast({ d }: { d: SocDashboard }): VNode {
  const pts = d.trend;
  const W = 520, H = 170, L = 40, T = 20, B = 140;
  const startDay = d.engagement?.periodStart ?? null;
  const first = pts[0] ? t(pts[0].day) : Date.now();
  const last = Math.max(Date.now(), d.projectedReady ? t(d.projectedReady) : 0, startDay ? t(startDay) : 0) + 7 * DAY;
  const x = (day: string): number => L + ((t(day) - first) / Math.max(DAY, last - first)) * (W - L - 10);
  const y = (pct: number): number => B - (pct / 100) * (B - T);
  const line = pts.map((p) => `${x(p.day).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const now = pts[pts.length - 1];
  return html`<div class="card pad">
    <div class="sr-lbl">Readiness forecast</div>
    ${pts.length < 2
      ? html`<p class="muted">The forecast needs a few days of history. A snapshot is taken every night, so check back in a week.</p>`
      : html`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Readiness so far and forecast">
          ${[0, 50, 100].map((v) => html`<line x1=${L} y1=${y(v)} x2=${W - 10} y2=${y(v)} stroke="#eef2f7" />
            <text x=${L - 8} y=${y(v) + 4} font-size="10" fill="#64748b" text-anchor="end">${v}%</text>`)}
          ${startDay ? html`<line x1=${x(startDay)} y1=${T - 8} x2=${x(startDay)} y2=${B} stroke="#5b4bd6" stroke-dasharray="4 3" />
            <text x=${x(startDay)} y=${H - 10} font-size="10.5" fill="#3730a3" text-anchor="middle">Period starts</text>` : null}
          <polyline points=${line} fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          ${now && d.projectedReady
            ? html`<polyline points=${`${x(now.day)},${y(now.pct)} ${x(d.projectedReady)},${y(100)}`} fill="none" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="6 5" />
                <circle cx=${x(d.projectedReady)} cy=${y(100)} r="5" fill="#fff" stroke="#16a34a" stroke-width="2" />`
            : null}
          ${now ? html`<circle cx=${x(now.day)} cy=${y(now.pct)} r="5" fill="#16a34a" />` : null}
        </svg>`}
    <p style="font-size:12.5px;margin:4px 0 0" class="muted">
      ${d.weekChange > 0 ? html`<b style="color:var(--green)">+${d.weekChange} points</b> this week. ` : d.weekChange < 0 ? html`<b style="color:var(--red)">${d.weekChange} points</b> this week. ` : "No change this week. "}
      ${d.projectedReady ? `At this pace: ready ${longDay(d.projectedReady)}.` : "No pace to forecast from yet."}
    </p>
  </div>`;
}

export function EvidenceTimeline({ d }: { d: SocDashboard }): VNode {
  const { months, rows, currentMonth } = d.timeline;
  const cell = (n: number, i: number): VNode => {
    const past = currentMonth < 0 ? true : i < currentMonth;
    const cls = n > 0 ? "in" : i === currentMonth ? "now" : past ? "miss" : "due";
    return html`<span class=${`sd-cell ${cls}`} title=${n ? `${n} piece${n === 1 ? "" : "s"} of evidence` : past ? "No evidence that month" : "Coming up"}>${n > 0 ? n : cls === "miss" ? "!" : ""}</span>`;
  };
  return html`<div class="card pad">
    <div class="sd-tl-head">
      <div class="sr-lbl" style="margin:0">Evidence month by month${d.engagement?.periodStart ? " · across your period" : " · last six months"}</div>
      <span class="sd-legend"><span class="sd-cell in"></span>Evidence in <span class="sd-cell miss"></span>None that month <span class="sd-cell now"></span>This month <span class="sd-cell due"></span>Coming</span>
    </div>
    ${rows.length
      ? html`<div class="sd-tl" style=${`grid-template-columns:minmax(160px,1.6fr) repeat(${months.length},1fr)`}>
          <span></span>${months.map((m) => html`<span class="sd-m">${monthName(m)}</span>`)}
          ${rows.map((r) => html`<span class="sd-ref" title=${r.title}><b>${r.ref}</b> ${r.title}</span>${r.counts.map(cell)}`)}
        </div>
        <p class="muted" style="font-size:12px;margin:10px 0 0">For a Type II, the auditor samples across the whole period. A month with nothing for a control that runs monthly is an exception waiting to happen.</p>`
      : html`<p class="muted">No dated evidence linked to criteria yet. Add evidence with the date it was produced and link it to the criteria it proves.</p>`}
  </div>`;
}

export function Team({ d }: { d: SocDashboard }): VNode {
  const max = Math.max(1, ...d.team.map((m) => m.total));
  return html`<div class="card pad">
    <div class="sr-lbl">Who's carrying it</div>
    ${d.team.map((m) => html`<div class="sd-team">
      <span class="sd-av">${m.owner.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
      <span class="sd-name">${m.owner}</span>
      <span class="sd-bar"><i style=${`width:${(m.total / max) * 100}%`}></i><i class="done" style=${`width:${(m.implemented / max) * 100}%`}></i></span>
      <span class="muted">${m.implemented}/${m.total}</span>
    </div>`)}
    ${d.weakest
      ? html`<div class="sd-weak">
          <span class="sr-lbl" style="margin:0">Most behind</span>
          <b>${d.weakest.name}</b><span class="muted">${d.weakest.implemented} of ${d.weakest.total} in place</span>
          <a class="btn small" href="#/controls">Focus on it</a>
        </div>`
      : null}
  </div>`;
}
