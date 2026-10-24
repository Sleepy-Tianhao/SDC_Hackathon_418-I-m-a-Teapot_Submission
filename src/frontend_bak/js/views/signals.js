/** Signal layer: dated, source-linked AI trend signals with filters and evidence detail. */

import { api } from "../core/api.js";
import { fmt, html, icon } from "../core/dom.js";
import { MOMENTUM_OPTIONS, SIGNAL_TYPES, SORT_OPTIONS } from "../core/options.js";
import { currentRoute } from "../core/router.js";
import * as store from "../core/store.js";
import { momentumBadge, openModal, progressBar, toast } from "../core/ui.js";

const filters = {
  query: "",
  momentum: "",
  type: "",
  region: "",
  roleId: "",
  sort: "recent",
};

let loaded = null;
let searchTimer = null;

function roleName(roleId) {
  const role = (store.getState().catalog?.roles || []).find((item) => item.id === roleId);
  return role ? role.title : roleId;
}

function skillName(skillId) {
  const skill = (store.getState().catalog?.skills || []).find((item) => item.id === skillId);
  return skill ? skill.name : skillId;
}

function activeFilters() {
  return Object.entries(filters).filter(([key, value]) => value && key !== "sort");
}

function filterBar(data) {
  const regions = Object.keys(data?.facets?.region || {}).sort();
  const types = SIGNAL_TYPES;
  return html`<div class="filter-bar" data-role="filters">
    <div class="search-field">
      ${icon("search", 16)}
      <input class="input" type="search" placeholder="Search signals, publishers, tags" value="${filters.query}"
        data-filter-input="query" aria-label="Search signals" />
    </div>
    <div class="filter-bar__group">
      <span class="filter-bar__label">Momentum</span>
      <button type="button" class="chip ${filters.momentum ? "" : "is-active"}" data-filter-momentum="">All</button>
      ${MOMENTUM_OPTIONS.map(
        (option) => html`<button type="button" class="chip ${filters.momentum === option.id ? "is-active" : ""}"
          data-filter-momentum="${option.id}">${option.label}</button>`,
      )}
    </div>
    <div class="filter-divider"></div>
    <select class="select" data-filter-select="type" aria-label="Signal type">
      <option value="">All types</option>
      ${types.map((type) => html`<option value="${type.id}" ${filters.type === type.id ? "selected" : ""}>${type.label}</option>`)}
    </select>
    <select class="select" data-filter-select="region" aria-label="Region">
      <option value="">All regions</option>
      ${regions.map((region) => html`<option value="${region}" ${filters.region === region ? "selected" : ""}>${region}</option>`)}
    </select>
    <select class="select" data-filter-select="sort" aria-label="Sort order">
      ${SORT_OPTIONS.map((option) => html`<option value="${option.id}" ${filters.sort === option.id ? "selected" : ""}>${option.label}</option>`)}
    </select>
    ${activeFilters().length
      ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="clear-filters">${icon("x", 14)} Reset</button>`
      : ""}
  </div>`;
}

function signalCard(signal) {
  const roles = (signal.affectedRoles || []).slice(0, 3);
  return html`<article class="signal-item">
    <div class="signal-item__top">
      <div class="signal-item__main">
        <div class="row row--wrap" style="--gap:6px;margin-bottom:7px">
          ${momentumBadge(signal.momentum)}
          <span class="tag">${SIGNAL_TYPES.find((type) => type.id === signal.type)?.label || signal.type}</span>
          <span class="tag">${signal.region}</span>
          <span class="tag tag--muted">${signal.velocity}</span>
        </div>
        <h3 class="signal-item__title">${signal.title}</h3>
        <p class="signal-item__summary">${signal.summary}</p>
      </div>
      <div class="signal-item__side">
        <span class="signal-item__impact">${signal.impact}<small>impact</small></span>
        <span class="tiny faint">${Math.round(signal.confidence * 100)}% confidence</span>
      </div>
    </div>
    <div class="signal-item__foot">
      <a class="signal-source" href="${signal.sourceUrl}" target="_blank" rel="noopener noreferrer">
        ${icon("external", 12)} <strong>${signal.publisher}</strong> · ${fmt.date(signal.publishedAt)}
      </a>
      <div class="signal-tags">
        ${(signal.tags || []).slice(0, 2).map((tag) => html`<span class="tag tag--muted">${tag}</span>`)}
      </div>
      <div class="signal-affected">
        ${roles.map((role) => html`<span class="tag">${roleName(role.roleId)} ${role.direction === "demand-up" ? "↑" : "↓"}</span>`)}
      </div>
      <button class="btn btn--ghost btn--sm" type="button" data-action="signal-detail" data-signal="${signal.id}">
        Evidence ${icon("arrowRight", 13)}
      </button>
    </div>
  </article>`;
}

function listHtml(data) {
  if (!data || !data.items.length) {
    return html`<div class="empty">
      ${icon("search", 24)}
      <h3 class="empty__title">No signals match these filters</h3>
      <p class="empty__body">Broaden the momentum, type or region filter, or clear the search term.</p>
      <button class="btn btn--secondary btn--sm" type="button" data-action="clear-filters">Reset filters</button>
    </div>`;
  }
  return html`<div class="signal-list">${data.items.map(signalCard)}</div>
    <p class="tiny faint" style="margin-top:14px">
      Showing ${data.items.length} of ${data.total} signals · sorted by ${filters.sort === "impact" ? "impact" : "most recent"}.
      Each row links to the original publisher.
    </p>`;
}

function pipelineHtml(data) {
  if (!data) return "";
  const pipeline = data.pipeline || {};
  return html`<div class="pipeline-strip" data-role="pipeline">
    <span class="row" style="--gap:7px"><span class="dot"></span><strong>Signal layer</strong> refreshed ${fmt.dateTime(data.lastRefreshedAt)}</span>
    <span>${icon("database", 13)} ${pipeline.sourcesScanned || "—"} sources scanned</span>
    <span>${icon("layers", 13)} ${fmt.int(pipeline.recordsIngested || 0)} records ingested</span>
    <span>${icon("activity", 13)} ${data.total} signals surfaced</span>
    <span class="grow"></span>
    <span class="tiny faint">window ${fmt.date(data.window?.from)} → ${fmt.date(data.window?.to)} · model ${pipeline.model || "signal-extractor"}</span>
    <button class="btn btn--secondary btn--sm" type="button" data-action="refresh-signals">
      ${icon("refresh", 14)} Refresh signals
    </button>
  </div>`;
}

function trendSummary(data) {
  const counts = { rising: 0, stable: 0, declining: 0 };
  (data?.items || []).forEach((signal) => {
    if (Object.prototype.hasOwnProperty.call(counts, signal.momentum)) counts[signal.momentum] += 1;
  });
  const max = Math.max(1, ...Object.values(counts));
  const rows = [
    { key: "rising", label: "Rising", arrow: "↑", note: "More signals point upward", tone: "up" },
    { key: "stable", label: "Steady", arrow: "→", note: "Signals remain broadly level", tone: "steady" },
    { key: "declining", label: "Declining", arrow: "↓", note: "More signals point downward", tone: "down" },
  ];
  return html`<section class="trend-summary" data-role="signal-trends" aria-label="Signal momentum summary">
    <div class="trend-summary__head"><div><p class="eyebrow">Market direction</p><h2>What is moving?</h2></div><span>${data?.items?.length || 0} signals in this view</span></div>
    <div class="trend-summary__grid">
      ${rows.map((row) => html`<article class="trend-summary__item trend-summary__item--${row.tone}">
        <div class="trend-summary__top"><span class="trend-summary__arrow" aria-hidden="true">${row.arrow}</span><strong>${row.label}</strong><b>${counts[row.key]}</b></div>
        <div class="trend-summary__bar"><i style="width:${Math.round((counts[row.key] / max) * 100)}%"></i></div>
        <p>${row.note}</p>
      </article>`)}
    </div>
    <p class="trend-summary__foot">Counts reflect the dated, source-linked signals below; they describe this snapshot, not a time-series forecast.</p>
  </section>`;
}

function pageShell(data) {
  const state = store.getState();
  const roleFilter = filters.roleId ? roleName(filters.roleId) : "";
  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("activity", 14)} Step 02 · AI-trend signal layer</p>
      <div class="page-head__row">
        <h1 class="page-title">Signals you can date, cite and challenge</h1>
        <div class="page-head__actions">
          <a class="btn btn--secondary btn--sm" href="#/scenarios">${icon("compare", 15)} Scenario lab</a>
        </div>
      </div>
      <p class="page-lead">
        Labour-market, policy and technology signals extracted from reports, job-posting data and regulators.
        Every record has a publisher, a publication date and a source link, so the forecast can be audited rather than trusted.
      </p>
      <div class="page-meta">
        <span>${icon("calendar", 13)} Window ${fmt.date(data?.window?.from || state.meta?.signalWindow?.from)} → ${fmt.date(data?.window?.to || state.meta?.signalWindow?.to)}</span>
        <span>${icon("database", 13)} Dataset ${state.meta?.datasetVersion || "—"}</span>
        ${roleFilter ? html`<span class="badge badge--brand">${icon("target", 12)} Filtered to ${roleFilter}</span>` : ""}
      </div>
    </div>
    ${pipelineHtml(data)}
    ${trendSummary(data)}
    ${filterBar(data)}
    <div data-role="signal-list">${listHtml(data)}</div>`;
}

function openSignal(signal) {
  store.recordJourney("signalViewed", signal.id);
  const catalog = store.getState().catalog;
  const roles = (signal.affectedRoles || []).map((role) => ({
    ...role,
    title: roleName(role.roleId),
  }));
  const skills = (signal.affectedSkills || []).map((skill) => ({
    ...skill,
    name: skillName(skill.skillId),
  }));

  openModal({
    title: signal.title,
    eyebrow: "Signal evidence",
    size: "lg",
    body: html`<div class="stack" style="--gap:18px">
      <div class="row row--wrap" style="--gap:8px">
        ${momentumBadge(signal.momentum)}
        <span class="tag">${SIGNAL_TYPES.find((type) => type.id === signal.type)?.label || signal.type}</span>
        <span class="tag">${signal.region}</span>
        <span class="tag tag--muted">${signal.velocity} velocity</span>
        <span class="tag tag--muted">${Math.round(signal.confidence * 100)}% confidence</span>
      </div>
      <p class="small" style="color:var(--ink-2);line-height:1.7">${signal.summary}</p>

      <div class="grid grid--2" style="gap:14px">
        <div class="side-card">
          <p class="side-card__title">Source</p>
          <a class="signal-source" href="${signal.sourceUrl}" target="_blank" rel="noopener noreferrer">
            ${icon("external", 13)} <strong>${signal.publisher}</strong>
          </a>
          <p class="tiny faint" style="margin-top:5px">Published ${fmt.date(signal.publishedAt)}</p>
          <a class="btn btn--secondary btn--sm" style="margin-top:9px" href="${signal.sourceUrl}" target="_blank" rel="noopener noreferrer">
            Open original ${icon("arrowUpRight", 13)}
          </a>
        </div>
        <div class="side-card">
          <p class="side-card__title">Signal score</p>
          <div class="gauge-row__top"><span>Impact</span><strong>${signal.impact}/100</strong></div>
          ${progressBar(signal.impact, { className: "bar--sm" })}
          <div class="gauge-row__top" style="margin-top:10px"><span>Confidence</span><strong>${Math.round(signal.confidence * 100)}%</strong></div>
          ${progressBar(Math.round(signal.confidence * 100), { className: "bar--sm", tone: "neutral" })}
        </div>
      </div>

      <div>
        <p class="side-card__title" style="margin-bottom:8px">Affected skills</p>
        <div class="stack" style="--gap:8px">
          ${skills.map(
            (skill) => html`<div class="row" style="--gap:8px">
              <span class="tag ${skill.direction === "demand-up" ? "tag--match" : "tag--gap"}">
                ${skill.direction === "demand-up" ? "↑" : "↓"} ${skill.name}
              </span>
              <span class="bar bar--sm" style="flex:1"><span class="bar__fill" style="width:${(skill.magnitude / 5) * 100}%"></span></span>
              <span class="mono faint">${skill.magnitude}/5</span>
            </div>`,
          )}
        </div>
      </div>

      <div>
        <p class="side-card__title" style="margin-bottom:8px">Roles affected</p>
        <div class="chip-group">
          ${roles.map(
            (role) => html`<span class="chip">${role.title} <span class="${role.direction === "demand-up" ? "delta--up" : "delta--down"}">${role.direction === "demand-up" ? "↑" : "↓"}</span></span>`,
          )}
        </div>
      </div>

      <div class="notice">
        ${icon("info", 15)}
        <span>Signals are inputs to a model, not facts about your future. The scenario lab shows how sensitive your match is to them.</span>
      </div>
    </div>`,
    footer: html`<button class="btn btn--ghost" type="button" data-modal-close="true">Close</button>
      <a class="btn btn--primary" href="#/signals?roleId=${roles[0]?.roleId || ""}" data-modal-close="true">
        Explore this role ${icon("arrowRight", 14)}
      </a>`,
  });
}

async function fetchData() {
  const data = await api.listSignals({
    query: filters.query,
    momentum: filters.momentum,
    type: filters.type,
    region: filters.region,
    roleId: filters.roleId,
    sort: filters.sort,
    limit: 50,
  });
  loaded = data;
  return data;
}

async function updateList(root, options = {}) {
  const listEl = root.querySelector('[data-role="signal-list"]');
  if (!listEl) return;
  listEl.innerHTML = html`<div class="stack" style="--gap:11px">
    <div class="skeleton skeleton-card" style="height:100px"></div>
    <div class="skeleton skeleton-card" style="height:100px"></div>
  </div>`.value;
  try {
    const data = await fetchData();
    listEl.innerHTML = listHtml(data).value;
    const filtersEl = root.querySelector('[data-role="filters"]');
    if (filtersEl && options.rebuildFilters !== false) filtersEl.outerHTML = filterBar(data).value;
    const pipelineEl = root.querySelector('[data-role="pipeline"]');
    if (pipelineEl) pipelineEl.outerHTML = pipelineHtml(data).value;
    const trendsEl = root.querySelector('[data-role="signal-trends"]');
    if (trendsEl) trendsEl.outerHTML = trendSummary(data).value;
  } catch (error) {
    listEl.innerHTML = html`<div class="error-panel" role="alert">
      <span class="error-panel__icon">${icon("alert", 20)}</span>
      <div>
        <h3>Signals could not be loaded</h3>
        <p>${error.message}</p>
        <button class="btn btn--secondary btn--sm" type="button" data-action="retry-signals">Retry</button>
      </div>
    </div>`.value;
  }
}

function bind(root) {
  root.addEventListener("click", (event) => {
    const momentumButton = event.target instanceof Element ? event.target.closest("[data-filter-momentum]") : null;
    if (momentumButton) {
      filters.momentum = momentumButton.getAttribute("data-filter-momentum") || "";
      updateList(root);
      return;
    }

    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;
    const action = target.getAttribute("data-action");

    if (action === "signal-detail") {
      const id = target.getAttribute("data-signal");
      const signal = (loaded?.items || []).find((item) => item.id === id);
      if (signal) openSignal(signal);
    } else if (action === "refresh-signals") {
      target.disabled = true;
      target.innerHTML = html`<span class="spinner" style="width:14px;height:14px"></span> Refreshing…`.value;
      api
        .refreshSignals()
        .then((result) => {
          const meta = store.getState().meta;
          if (meta) store.setState({ meta: { ...meta, lastRefreshedAt: result.refreshedAt } }, { persist: false });
          toast(
            "Re-verified " + (result.updated || 0) + " signals across " + (result.scanned || 0) + " sources in " + (result.durationSeconds || 0) + "s.",
            { tone: "success", title: "Signal layer updated" },
          );
          return updateList(root, { rebuildFilters: false });
        })
        .catch((error) => {
          toast(error.message || "Refresh failed.", { tone: "danger", title: "Refresh failed" });
        })
        .finally(() => {
          target.disabled = false;
          target.innerHTML = html`${icon("refresh", 14)} Refresh signals`.value;
        });
    } else if (action === "clear-filters") {
      filters.query = "";
      filters.momentum = "";
      filters.type = "";
      filters.region = "";
      filters.roleId = "";
      filters.sort = "recent";
      updateList(root);
    } else if (action === "retry-signals") {
      updateList(root, { rebuildFilters: false });
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.getAttribute("data-filter-input") !== "query") return;
    filters.query = target.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => updateList(root, { rebuildFilters: false }), 280);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const key = target.getAttribute("data-filter-select");
    if (!key) return;
    filters[key] = target.value;
    updateList(root);
  });
}

export const signalsView = {
  id: "signals",
  title: "Signal layer",
  icon: "activity",
  loadingMessage: "Loading the signal layer…",

  async render({ route }) {
    if (route.query.roleId && route.query.roleId !== filters.roleId) filters.roleId = route.query.roleId;
    if (route.query.momentum) filters.momentum = route.query.momentum;
    const data = await fetchData();
    return pageShell(data);
  },

  mount(root, { route }) {
    if (!root.dataset.signalsBound) {
      root.dataset.signalsBound = "1";
      bind(root);
    }
    if (route.query.highlight) {
      const signal = (loaded?.items || []).find((item) => item.id === route.query.highlight);
      if (signal) window.setTimeout(() => openSignal(signal), 120);
    }
  },
};