/** Scenario lab: three defensible 2028 futures and their effect on the plan. */

import { api } from "../core/api.js";
import { fmt, html, icon } from "../core/dom.js";
import { refreshRoute } from "../core/router.js";
import * as store from "../core/store.js";
import { progressBar, scoreTone, toast } from "../core/ui.js";

function scenarioCard(scenario, active, catalog) {
  const keywords = (scenario.drivers || []).slice(0, 3);
  const rising = (scenario.rolesRising || [])
    .map((roleId) => (catalog.roles || []).find((role) => role.id === roleId))
    .filter(Boolean)
    .slice(0, 3);
  const declining = (scenario.rolesDeclining || [])
    .map((roleId) => (catalog.roles || []).find((role) => role.id === roleId))
    .filter(Boolean);

  return html`<article class="scenario-card ${active ? "is-active" : ""}" data-scenario-card="${scenario.id}">
    <div class="scenario-card__top">
      <div>
        <h2 class="scenario-card__name">${scenario.name}</h2>
        <p class="scenario-card__horizon">Horizon ${scenario.horizon}</p>
      </div>
      ${active ? html`<span class="badge badge--brand">${icon("check", 11)} Active</span>` : ""}
    </div>
    <p class="scenario-card__summary">${fmt.short(scenario.summary, 140)}</p>
    ${keywords.length
      ? html`<div class="scenario-keywords" aria-label="Key forces in this scenario">
          ${keywords.map((driver) => html`<span class="scenario-keyword scenario-keyword--${driver.direction}">
            <span aria-hidden="true">${driver.direction === "up" ? "↑" : "↓"}</span>${driver.name}
          </span>`)}
        </div>`
      : ""}
    <div class="scenario-card__metrics">
      <div class="scenario-metric"><span>Net employment</span><strong>${scenario.metrics.netEmploymentChangePct > 0 ? "+" : ""}${scenario.metrics.netEmploymentChangePct}%</strong></div>
      <div class="scenario-metric"><span>Task automation</span><strong>${scenario.metrics.taskAutomationPct}%</strong></div>
      <div class="scenario-metric"><span>Reskilling demand</span><strong>${scenario.metrics.reskillingDemandIndex}/100</strong></div>
      <div class="scenario-metric"><span>Wage polarisation</span><strong>${scenario.metrics.wagePolarisationIndex}/100</strong></div>
    </div>
    <div class="confidence">
      <span>Likelihood</span>
      ${progressBar(Math.round(scenario.confidence * 100), { className: "bar--sm", tone: "neutral" })}
      <strong class="mono">${Math.round(scenario.confidence * 100)}%</strong>
    </div>
    <div class="stack" style="--gap:7px">
      ${scenario.drivers.map(
        (driver) => html`<div class="driver driver--${driver.direction}">
          ${icon(driver.direction === "up" ? "trendUp" : "trendDown", 14)}
          <span><strong>${driver.name}.</strong> ${fmt.short(driver.detail, 95)}</span>
        </div>`,
      )}
    </div>
    ${rising.length
      ? html`<div>
          <p class="tiny faint" style="margin-bottom:5px">Roles rising</p>
          <div class="tag-row">
            ${rising.map((role) => html`<a class="tag" href="#/matches?role=${role.id}">${role.title}</a>`)}
            ${(scenario.rolesRising || []).length > rising.length
              ? html`<span class="tag tag--muted">+${scenario.rolesRising.length - rising.length}</span>`
              : ""}
          </div>
        </div>`
      : ""}
    ${declining.length
      ? html`<div>
          <p class="tiny faint" style="margin-bottom:5px">Roles under pressure</p>
          <div class="tag-row">${declining.map((role) => html`<a class="tag tag--gap" href="#/matches?role=${role.id}">${role.title}</a>`)}</div>
        </div>`
      : ""}
    <button class="btn ${active ? "btn--secondary" : "btn--primary"} btn--sm btn--block" type="button"
      data-action="select-scenario" data-scenario="${scenario.id}" ${active ? "disabled" : ""}>
      ${active ? "Currently active" : "Model this future"}
    </button>
  </article>`;
}

function impactPanel(matches, catalog, activeId) {
  const role = matches.matches[0];
  const rows = (catalog.scenarios || []).map((scenario) => {
    const delta = scenario.roleAdjustments?.[role.roleId]?.fitDelta || 0;
    const fit = Math.max(3, Math.min(99, (role.baselineFit || role.fitScore) + delta));
    return { scenario, fit, delta, active: scenario.id === activeId };
  });

  return html`<section class="panel">
    <div class="panel__head">
      <div>
        <h2 class="panel__title">Top match by future</h2>
      </div>
      <span class="badge badge--neutral">${rows.length} scenarios</span>
    </div>
    <div class="stack" style="--gap:13px">
      ${rows.map(
        (row) => html`<div>
          <div class="gauge-row__top">
            <span class="row" style="--gap:8px">
              <span class="${row.active ? "strong" : ""}">${row.scenario.shortName}</span>
              ${row.active ? html`<span class="badge badge--brand">active</span>` : ""}
            </span>
            <strong>${row.fit}/100
              ${row.delta ? html`<span class="tiny ${row.delta > 0 ? "delta--up" : "delta--down"}">${row.delta > 0 ? "+" : ""}${row.delta}</span>` : ""}
            </strong>
          </div>
          ${progressBar(row.fit, { className: "bar--sm", tone: row.delta > 0 ? "success" : row.delta < 0 ? "warning" : "brand" })}
          ${row.scenario.roleAdjustments?.[role.roleId]?.note
            ? html`<p class="tiny faint" style="margin-top:4px">${row.scenario.roleAdjustments[role.roleId].note}</p>`
            : ""}
        </div>`,
      )}
    </div>
  </section>`;
}

function comparisonTable(catalog, activeId, matches) {
  const metrics = [
    { key: "netEmploymentChangePct", label: "Net employment change", suffix: "%" },
    { key: "taskAutomationPct", label: "Tasks automated", suffix: "%" },
    { key: "reskillingDemandIndex", label: "Reskilling demand index", suffix: "/100" },
    { key: "wagePolarisationIndex", label: "Wage polarisation", suffix: "/100" },
  ];
  const top = matches.matches[0];

  return html`<div class="table-wrap">
    <table class="table compare-table">
      <thead>
        <tr>
          <th>Metric</th>
          ${(catalog.scenarios || []).map(
            (scenario) => html`<th class="${scenario.id === activeId ? "is-active" : ""}">${scenario.shortName}</th>`,
          )}
        </tr>
      </thead>
      <tbody>
        ${metrics.map(
          (metric) => html`<tr>
            <td>${metric.label}</td>
            ${(catalog.scenarios || []).map(
              (scenario) => html`<td class="${scenario.id === activeId ? "is-active" : ""}">
                <strong>${scenario.metrics[metric.key]}${metric.suffix}</strong>
              </td>`,
            )}
          </tr>`,
        )}
        <tr>
          <td>Your fit · ${top.title}</td>
          ${(catalog.scenarios || []).map((scenario) => {
            const delta = scenario.roleAdjustments?.[top.roleId]?.fitDelta || 0;
            const fit = Math.max(3, Math.min(99, (top.baselineFit || top.fitScore) + delta));
            return html`<td class="${scenario.id === activeId ? "is-active" : ""}">
              <strong style="color:var(--${scoreTone(fit)})">${fit}</strong>
            </td>`;
          })}
        </tr>
        <tr>
          <td>Skills in demand</td>
          ${(catalog.scenarios || []).map(
            (scenario) => html`<td class="${scenario.id === activeId ? "is-active" : ""}">
              ${(scenario.skillsInDemand || [])
                .slice(0, 3)
                .map((skillId) => (catalog.skills.find((skill) => skill.id === skillId) || {}).name)
                .filter(Boolean)
                .join(", ")}
            </td>`,
          )}
        </tr>
      </tbody>
    </table>
  </div>`;
}

function page(state, matches) {
  const catalog = state.catalog;
  const active = (catalog.scenarios || []).find((scenario) => scenario.id === state.scenarioId) || catalog.scenarios[0];

  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("compare", 14)} Foresight · More than one future</p>
      <div class="page-head__row">
        <h1 class="page-title">Three futures, compared</h1>
        <div class="page-head__actions">
          <a class="btn btn--secondary btn--sm" href="#/signals">${icon("activity", 15)} Signal evidence</a>
        </div>
      </div>
      <p class="page-lead">
        Each scenario changes adoption, regulation and climate assumptions, then re-scores your matches.
      </p>
      <div class="page-meta">
        <span>${icon("check", 13)} Active: <strong>${active.name}</strong></span>
        <span>${icon("calendar", 13)} Horizon ${active.horizon}</span>
        <span>${icon("clock", 13)} Signals ${fmt.relative(state.meta?.lastRefreshedAt)}</span>
      </div>
    </div>

    <div class="scenario-cards">
      ${(catalog.scenarios || []).map((scenario) => scenarioCard(scenario, scenario.id === state.scenarioId, catalog))}
    </div>

    <div class="split" style="margin-top:18px">
      ${impactPanel(matches, catalog, state.scenarioId)}
      <section class="panel">
        <div class="panel__head">
          <div>
            <h2 class="panel__title">Assumptions behind the active scenario</h2>
          </div>
        </div>
        <ul class="stack" style="--gap:9px">
          ${active.assumptions.map(
            (assumption) => html`<li class="row" style="align-items:flex-start;--gap:8px">
              <span style="color:var(--brand);margin-top:3px">${icon("check", 13)}</span>
              <span class="small muted">${assumption}</span>
            </li>`,
          )}
        </ul>
      </section>
    </div>

    <section class="panel" style="margin-top:18px">
      <div class="panel__head">
        <div>
          <h2 class="panel__title">Scenario comparison</h2>
        </div>
      </div>
      ${comparisonTable(catalog, state.scenarioId, matches)}
    </section>`;
}

function bind(root) {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;
    if (target.getAttribute("data-action") !== "select-scenario") return;
    const scenarioId = target.getAttribute("data-scenario");
    if (!scenarioId || scenarioId === store.getState().scenarioId) return;
    store.setScenario(scenarioId);
    const scenario = (store.getState().catalog.scenarios || []).find((item) => item.id === scenarioId);
    toast("Now modelling " + (scenario ? scenario.name : scenarioId) + ". Matches and pathway will be recomputed.", {
      tone: "brand",
      title: "Scenario changed",
    });
    refreshRoute();
  });
}

export const scenariosView = {
  id: "scenarios",
  title: "Scenario lab",
  icon: "compare",
  loadingMessage: "Modelling scenarios…",

  async render({ state }) {
    if (!state.profile) {
      return html`<div class="page-head reveal">
          <p class="eyebrow">${icon("compare", 14)} Foresight · More than one future</p>
          <h1 class="page-title">Three futures, modelled separately</h1>
          <p class="page-lead">
            Compare how each future changes the assumptions and your matches.
          </p>
        </div>
        <div class="scenario-cards">
          ${(state.catalog.scenarios || []).map((scenario) => scenarioCard(scenario, scenario.id === state.scenarioId, state.catalog))}
        </div>
        <div class="notice" style="margin-top:16px">
          ${icon("user", 16)}
          <span>Build a <a href="#/intake">skills profile</a> to see the personal impact of each scenario.</span>
        </div>`;
    }
    let matches = store.getState().matches;
    if (!matches || matches.scenarioId !== state.scenarioId) {
      matches = await api.match(state.profile, state.scenarioId);
    }
    return page(store.getState(), matches);
  },

  mount(root) {
    if (!root.dataset.scenariosBound) {
      root.dataset.scenariosBound = "1";
      bind(root);
    }
  },
};
