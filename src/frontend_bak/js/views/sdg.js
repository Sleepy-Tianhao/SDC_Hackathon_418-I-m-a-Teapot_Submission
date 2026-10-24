/** SDG mapping: how the matched roles connect to the 17 Sustainable Development Goals. */

import { api } from "../core/api.js";
import { fmt, html, icon } from "../core/dom.js";
import * as store from "../core/store.js";
import { progressBar } from "../core/ui.js";

let selectedNumber = null;

function tierLabel(tier) {
  if (tier === "primary") return "Primary link";
  if (tier === "secondary") return "Supporting link";
  return "Contextual";
}

const SDG_POSITIONS = [[12,10],[30,12],[50,9],[70,12],[88,10],[18,31],[42,33],[66,32],[84,34],[12,56],[32,58],[53,56],[74,59],[88,57],[20,83],[50,85],[80,83]];
const SDG_MAP_IMAGE = new URL("../../assets/sdg-watercolor-map.jpg", import.meta.url).href;
const SDG_PIN_IMAGE = new URL("../../assets/sdg-pin-gold.png", import.meta.url).href;

function mapMarkers(goals, selected) {
  return html`<div class="sdg-map-board" style="--sdg-map:url('${SDG_MAP_IMAGE}')" role="group" aria-label="SDG contribution map">
    ${goals.map((goal, index) => {
      const [x, y] = SDG_POSITIONS[index] || [50, 50];
      const score = Math.max(0, Math.min(100, Number(goal.score) || 0));
      const strength = score / 100;
      const opacity = (0.22 + strength * 0.78).toFixed(2);
      return html`<button type="button" class="sdg-marker ${goal.number === selected ? "is-selected" : ""}"
        data-action="select-sdg" data-sdg="${goal.number}" aria-pressed="${goal.number === selected}"
        aria-label="${goal.name}, ${score} out of 100 match"
        style="--x:${x}%;--y:${y}%;--strength:${strength};--pin-opacity:${opacity};--pin-image:url('${SDG_PIN_IMAGE}')">
        <span class="sdg-marker__art" aria-hidden="true"></span>
        <span class="sdg-marker__name">${goal.shortName || goal.name}</span>
      </button>`;
    })}
    <span class="sdg-map-caption">Brighter warm light = stronger match</span>
  </div>`;
}

function detailBody(goal, state, mapping) {
  const matches = store.getState().matches;
  const roles = (goal.roleIds || []).map((roleId) => {
    const match = matches?.matches.find((item) => item.roleId === roleId);
    const role = (state.catalog.roles || []).find((item) => item.id === roleId);
    return { roleId, title: role?.title || roleId, fit: match?.fitScore };
  });
  const skills = (goal.skillIds || []).map((skillId) => (state.catalog.skills || []).find((skill) => skill.id === skillId)).filter(Boolean);

  return html`<div class="sdg-detail__banner" style="--sdg:${goal.color}">
      <span class="sdg-detail__num">${goal.number}</span>
      <div>
        <p class="sdg-detail__title">${goal.name}</p>
        <p class="sdg-detail__focus">${goal.focus}</p>
      </div>
    </div>

    <div class="row row--between" style="margin-top:14px">
      <div>
        <p class="side-card__title" style="margin-bottom:2px">Contribution score</p>
        <p class="strong" style="font-size:22px;letter-spacing:-0.02em">${goal.score}<span class="tiny faint">/100</span></p>
      </div>
      <span class="badge badge--${goal.tier === "primary" ? "success" : goal.tier === "secondary" ? "brand" : "neutral"}">${tierLabel(goal.tier)}</span>
    </div>
    ${progressBar(goal.score, { className: "bar--sm", tone: goal.tier === "primary" ? "success" : "brand" })}

    <p class="small" style="margin-top:14px;color:var(--ink-2);line-height:1.7">${goal.rationale}</p>

    <div style="margin-top:16px">
      <p class="side-card__title" style="margin-bottom:6px">Roles carrying this goal</p>
      ${roles.length
        ? roles.map(
            (role) => html`<a class="sdg-list-item" href="#/matches?role=${role.roleId}">
              <span class="dot" style="--sdg:${goal.color}"></span>
              <span class="grow">${role.title}</span>
              ${role.fit ? html`<span class="mono faint">${role.fit} fit</span>` : ""}
            </a>`,
          )
        : html`<p class="small muted">No matched role carries this goal directly.</p>`}
    </div>

    ${skills.length
      ? html`<div style="margin-top:14px">
          <p class="side-card__title" style="margin-bottom:7px">Skills in play</p>
          <div class="tag-row">${skills.map((skill) => html`<span class="tag">${skill.name}</span>`)}</div>
        </div>`
      : ""}

    ${goal.evidence && goal.evidence.length
      ? html`<div style="margin-top:16px">
          <p class="side-card__title" style="margin-bottom:4px">Evidence signals</p>
          ${goal.evidence.map(
            (item) => html`<a class="evidence-item" href="#/signals?highlight=${item.signalId}">
              <strong>${item.title}</strong>
              <span>${item.publisher} · ${fmt.date(item.publishedAt)}</span>
            </a>`,
          )}
        </div>`
      : ""}

    <p class="tiny faint" style="margin-top:16px;line-height:1.6">${mapping.summary.note}</p>`;
}

function mapPage(state, mapping, goals, selected, profileReady) {
  const goal = goals.find((item) => item.number === selected) || goals[0];
  const primary = mapping.summary.primaryGoals || [];
  const top = goals.find((item) => item.number === mapping.summary.topGoal);
  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("globe", 14)} SDG mapping · 17 themes</p>
      <div class="page-head__row">
        <h1 class="page-title">Where could your work make a difference?</h1>
        <div class="page-head__actions"><a class="btn btn--secondary btn--sm" href="#/pathway">${icon("route", 15)} Reskilling pathway</a></div>
      </div>
      <p class="page-lead">Select a glowing theme to see how your roles and skills connect to it. The light shows match strength; the explanation shows why.</p>
      <div class="page-meta">
        ${profileReady ? html`<span>${icon("target", 13)} ${primary.length} strongest links</span>` : html`<span>${icon("info", 13)} Example catalogue view · build your profile for a personal map</span>`}
        ${top ? html`<span>${icon("target", 13)} Strongest: ${top.shortName} · ${top.score}/100</span>` : ""}
        ${mapping.generatedAt ? html`<span>${icon("clock", 13)} Updated ${fmt.relative(mapping.generatedAt)}</span>` : ""}
      </div>
    </div>
    <div class="sdg-map-layout">
      <section class="sdg-map-wrap" aria-label="SDG map">
        ${mapMarkers(goals, goal.number)}
      </section>
      <aside class="sdg-detail-panel" aria-label="Selected SDG details">
        <div class="side-card" data-role="sdg-detail">${detailBody(goal, state, mapping)}</div>
      </aside>
    </div>`;
}

function page(state, mapping) {
  const goals = [...mapping.goals].sort((a, b) => a.number - b.number);
  const selected = selectedNumber || mapping.summary.topGoal || 1;
  return mapPage(state, mapping, goals, selected, true);
}

function genericPage(state) {
  const goals = (state.catalog.sdgs || []).map((goal) => ({
    ...goal,
    score: 0,
    tier: "contextual",
    roleIds: (state.catalog.roles || []).filter((role) => (role.sdgs || []).some((sdg) => sdg.number === goal.number)).map((role) => role.id),
    skillIds: [],
    rationale: goal.focus,
    evidence: [],
  }));
  const selected = selectedNumber || 4;
  const goal = goals.find((item) => item.number === selected) || goals[0];
  const mapping = { goals, summary: { note: "Build a skills profile to calculate a personal contribution map.", primaryGoals: [], topGoal: null }, generatedAt: null };
  return mapPage(state, mapping, goals, goal?.number || 4, false);
}

function bind(root) {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;
    if (target.getAttribute("data-action") !== "select-sdg") return;
    const number = Number(target.getAttribute("data-sdg"));
    const state = store.getState();
    const mapping = state.sdgMap;
    if (!mapping) return;
    selectedNumber = number;
    const goal = mapping.goals.find((item) => item.number === number);
    const detail = root.querySelector('[data-role="sdg-detail"]');
    if (detail && goal) detail.innerHTML = detailBody(goal, state, mapping).value;
    root.querySelectorAll(".sdg-marker[data-sdg]").forEach((marker) => {
      const active = Number(marker.getAttribute("data-sdg")) === number;
      marker.classList.toggle("is-selected", active);
      marker.setAttribute("aria-pressed", String(active));
    });
  });
}

export const sdgView = {
  id: "sdg",
  title: "SDG map",
  icon: "globe",
  loadingMessage: "Mapping roles to the SDGs…",

  async render({ state }) {
    if (!state.profile) return genericPage(state);
    let mapping = store.getState().sdgMap;
    if (!mapping || mapping.scenarioId !== state.scenarioId) {
      mapping = await api.sdgMap(state.profile, state.scenarioId);
    }
    return page(store.getState(), mapping);
  },

  mount(root) {
    if (!root.dataset.sdgBound) {
      root.dataset.sdgBound = "1";
      bind(root);
    }
  },
};
