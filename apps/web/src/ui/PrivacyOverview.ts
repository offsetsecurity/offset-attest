import { useEffect, useState } from "preact/hooks";
import type { VNode } from "preact";
import { html } from "./html.js";
import { privacy, type AttentionItem } from "../persistence/apiClient.js";

/**
 * The top of the dashboard for a GDPR product: the records in numbers, and
 * everything that is late, nearly late, or missing.
 *
 * The list is the point. A privacy lead opens this on a Monday to find the
 * request that is due on Thursday and the breach whose clock is still
 * running, not to admire a chart.
 */

type Overview = Awaited<ReturnType<typeof privacy.overview>>;

const LEVEL: Record<AttentionItem["level"], { label: string; cls: string }> = {
  overdue: { label: "Late", cls: "red" },
  soon: { label: "Due soon", cls: "amber" },
  gap: { label: "Missing", cls: "slate" },
};

function card(label: string, value: string | number, note: VNode | string, accent: string, goTo: string): VNode {
  return html`
    <a class="card pad stat" href=${`#/${goTo}`} style=${`border-left:3px solid ${accent}`}>
      <div class="go" aria-hidden="true">›</div>
      <div class="lbl">${label}</div>
      <div class="val">${value}</div>
      <div class="delta">${note}</div>
    </a>`;
}

/** "16 Oct 2026" or "16 Oct 2026, 09:30", from what the API sends. */
const due = (s: string): string => {
  if (!s) return "";
  const d = new Date(s.length > 10 ? s : `${s}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString(undefined, {
        day: "numeric", month: "short", year: "numeric",
        ...(s.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
};

export function PrivacyOverview(): VNode {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    privacy.overview()
      .then((d) => live && setData(d))
      .catch((err: Error) => live && setError(err.message));
    return () => { live = false; };
  }, []);

  if (error) return html`<div class="card pad err">${error}</div>`;
  if (!data) return html`<div class="card pad muted">Loading…</div>`;

  const c = data.counts;
  const late = data.attention.filter((a) => a.level === "overdue").length;
  const unsigned = (c["processors"] ?? 0) - (c["processorsSigned"] ?? 0);

  return html`<>
    <div class="grid cards">
      ${card("Data map", c["activities"] ?? 0,
        c["highRisk"]
          ? `${c["highRisk"]} high risk · ${c["dpias"] ?? 0} DPIA${c["dpias"] === 1 ? "" : "s"}`
          : "processing activities recorded",
        "#1e3a8a", "datamap")}
      ${card("Open requests", c["requestsOpen"] ?? 0,
        `${c["requestsYear"] ?? 0} in the last 12 months`, "#4338ca", "requests")}
      ${card("Open breaches", c["breachesOpen"] ?? 0,
        `${c["breachesYear"] ?? 0} in the last 12 months`, "#b91c1c", "breaches")}
      ${card("Processors", c["processors"] ?? 0,
        unsigned > 0
          ? html`<span style="color:var(--red)">${unsigned} without a signed DPA</span>`
          : c["processors"] ? "every one has a signed DPA" : "none recorded yet",
        "#0f766e", "vendors")}
    </div>

    <div class="card pad" style="margin-top:16px">
      <div class="section-title">
        <h2>Needs attention</h2>
        <span class="muted" style="font-size:12px">
          ${data.attention.length
            ? `${data.attention.length} item${data.attention.length === 1 ? "" : "s"}${late ? `, ${late} late` : ""}`
            : ""}
        </span>
      </div>
      ${data.attention.length
        ? html`<table>
            <thead><tr>
              <th style="width:90px"></th><th>What</th><th style="width:170px">Kind</th>
              <th style="width:170px">Due</th>
            </tr></thead>
            <tbody>
              ${data.attention.map((a) => html`
                <tr key=${`${a.kind}:${a.id}`} class="clickable"
                    onClick=${() => { window.location.hash = `#/${a.screen}`; }}>
                  <td><span class=${`pill ${LEVEL[a.level].cls}`}>${LEVEL[a.level].label}</span></td>
                  <td>
                    <div>${a.title}</div>
                    <div class="muted" style="font-size:11.5px">${a.detail}</div>
                  </td>
                  <td class="muted">${a.kind}</td>
                  <td class=${a.level === "overdue" ? "" : "muted"}
                      style=${a.level === "overdue" ? "color:var(--red);font-weight:700" : ""}>${due(a.due) || "—"}</td>
                </tr>`)}
            </tbody>
          </table>`
        : html`<p class="muted" style="margin:0">
            Nothing late, nothing due this week, and nothing missing. Well done.
          </p>`}
    </div>

    <h2 class="section-h" style="margin:22px 0 10px">GDPR duties</h2>
  </>`;
}
