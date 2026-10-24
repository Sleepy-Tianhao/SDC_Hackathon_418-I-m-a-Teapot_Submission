/** Signal layer: dated, source-linked AI trend signals with filters and evidence detail. */

import { api } from "../core/api.js";
import { fmt, html, icon } from "../core/dom.js";
import { MOMENTUM_OPTIONS, SIGNAL_TYPES, SORT_OPTIONS } from "../core/options.js";
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
      <input class="input" type="search" placeholder="Search signals" value="${filters.query}"
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
  const direction =
    signal.momentum === "declining" ? "down" : signal.momentum === "stable" ? "steady" : "up";
  const label = direction === "down" ? "Declining" : direction === "steady" ? "Steady" : "Rising";
  const iconName = direction === "down" ? "trendDown" : direction === "steady" ? "arrowRight" : "trendUp";
  const published = signal.publishedAt ? "Published " + fmt.date(signal.publishedAt) : "Source";
  return html`<article class="signal-card signal-card--${direction}"
    data-action="signal-detail" data-signal="${signal.id}"
    role="button" tabindex="0"
    aria-label="${signal.title}. ${label}. Source ${signal.publisher}.">
    <div class="signal-card__trend">
      <span class="signal-card__arrow" aria-hidden="true">${icon(iconName, 30)}</span>
      <span class="signal-card__label">${label}</span>
    </div>
    <h3 class="signal-card__title">${signal.title}</h3>
    <a class="signal-card__source" href="${signal.sourceUrl}" target="_blank" rel="noopener noreferrer"
      title="${published}">
      ${icon("external", 12)}<span>${signal.publisher}</span>
    </a>
  </article>`;
}

function listHtml(data) {
  if (!data || !data.items.length) {
    return html`<div class="empty">
      ${icon("search", 24)}
      <h3 class="empty__title">No signals match these filters</h3>
      <p class="empty__body">Adjust filters or clear the search.</p>
      <button class="btn btn--secondary btn--sm" type="button" data-action="clear-filters">Reset filters</button>
    </div>`;
  }
  return html`<div class="signal-grid">${data.items.map(signalCard)}</div>`;
}

function pageShell(data) {
  return html`<div class="page-head reveal">
      <div class="page-head__row">
        <h1 class="page-title">Signal layer</h1>
        <div class="page-head__actions">
          <a class="btn btn--secondary btn--sm" href="#/scenarios">${icon("compare", 15)} Scenario lab</a>
          <button class="btn btn--secondary btn--sm" type="button" data-action="refresh-signals">
            ${icon("refresh", 14)} Refresh
          </button>
        </div>
      </div>
    </div>
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
  listEl.innerHTML = html`<div class="signal-grid">
    ${Array.from({ length: 6 }, () => html`<div class="skeleton skeleton-card" style="height:170px"></div>`)}
  </div>`.value;
  try {
    const data = await fetchData();
    listEl.innerHTML = listHtml(data).value;
    const filtersEl = root.querySelector('[data-role="filters"]');
    if (filtersEl && options.rebuildFilters !== false) filtersEl.outerHTML = filterBar(data).value;
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
    if (event.target instanceof Element && event.target.closest(".signal-card__source")) return;
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
          target.innerHTML = html`${icon("refresh", 14)} Refresh`.value;
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

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target instanceof Element ? event.target.closest(".signal-card[data-action]") : null;
    if (!card || event.target.closest("a")) return;
    event.preventDefault();
    card.click();
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