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

function cards(goals, selected) {
  return html`<div class="sdg-grid">
    ${goals.map(
      (goal) => html`<button type="button" class="sdg-card sdg-card--${goal.tier} ${goal.number === selected ? "is-selected" : ""}"
        style="--sdg:${goal.color}" data-action="select-sdg" data-sdg="${goal.number}"
        aria-pressed="${goal.number === selected}">
        <div class="sdg-card__top">
          <span class="sdg-card__num">SDG ${goal.number}</span>
          <span class="sdg-card__tier">${tierLabel(goal.tier)}</span>
        </div>
        <p class="sdg-card__name">${goal.shortName}</p>
        <div class="sdg-card__bottom">
          <div class="bar bar--sm" style="background:var(--surface-3)">
            <span class="bar__fill" style="width:${goal.score}%;background:${goal.color}"></span>
          </div>
          <span class="sdg-card__score">${goal.score}</span>
        </div>
      </button>`,
    )}
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

function page(state, mapping) {
  const goals = [...mapping.goals].sort((a, b) => a.number - b.number);
  const selected = selectedNumber || mapping.summary.topGoal || 1;
  const goal = goals.find((item) => item.number === selected) || goals[0];
  const primary = mapping.summary.primaryGoals || [];
  const top = goals.find((item) => item.number === mapping.summary.topGoal);

  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("globe", 14)} Step 05 · SDG mapping</p>
      <div class="page-head__row">
        <h1 class="page-title">Where your next role lands in the 2030 agenda</h1>
        <div class="page-head__actions">
          <a class="btn btn--secondary btn--sm" href="#/pathway">${icon("route", 15)} Back to pathway</a>
        </div>
      </div>
      <p class="page-lead">
        The same role can create very different public value. Each of the 17 goals is scored from the SDG weights of your
        matched roles and the signals that support them — with a written rationale rather than a logo row.
      </p>
      <div class="page-meta">
        <span>${icon("target", 13)} ${primary.length} primary goal${primary.length === 1 ? "" : "s"}</span>
        ${top ? html`<span>${icon("target", 13)} Strongest: SDG ${top.number} — ${top.shortName} (${top.score})</span>` : ""}
        <span>${icon("clock", 13)} Generated ${fmt.relative(mapping.generatedAt)}</span>
      </div>
    </div>

    <div class="split">
      <section class="panel">
        <div class="panel__head">
          <div>
            <h2 class="panel__title">All 17 goals</h2>
            <p class="panel__hint">Select a goal to see the evidence behind the score.</p>
          </div>
          <span class="badge badge--neutral">${goals.filter((item) => item.tier !== "contextual").length} linked</span>
        </div>
        ${cards(goals, selected)}
        <div class="matrix-legend" style="margin-top:12px">
          <span><i style="background:var(--success-soft)"></i> primary</span>
          <span><i style="background:var(--brand-soft)"></i> supporting</span>
          <span><i style="background:var(--surface-3)"></i> contextual</span>
        </div>
      </section>

      <aside class="sdg-detail">
        <div class="side-card" data-role="sdg-detail">${detailBody(goal, state, mapping)}</div>
      </aside>
    </div>`;
}

function genericPage(state) {
  const goals = state.catalog.sdgs.map((goal) => ({
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

  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("globe", 14)} SDG mapping</p>
      <h1 class="page-title">How the 17 goals connect to future work</h1>
      <p class="page-lead">
        Every future role in the catalogue carries a weighted SDG contribution with a written rationale. Build a profile
        to see where <em>your</em> path scores.
      </p>
    </div>
    <div class="split">
      <section class="panel">
        <div class="panel__head">
          <div>
            <h2 class="panel__title">The 17 goals</h2>
            <p class="panel__hint">Select a goal to see which roles carry it.</p>
          </div>
        </div>
        ${cards(goals, goal.number)}
      </section>
      <aside class="sdg-detail">
        <div class="side-card" data-role="sdg-detail">
          <div class="sdg-detail__banner" style="--sdg:${goal.color}">
            <span class="sdg-detail__num">${goal.number}</span>
            <div>
              <p class="sdg-detail__title">${goal.name}</p>
              <p class="sdg-detail__focus">${goal.focus}</p>
            </div>
          </div>
          <div style="margin-top:14px">
            <p class="side-card__title" style="margin-bottom:6px">Roles in the catalogue</p>
            ${goal.roleIds.length
              ? goal.roleIds.map(
                  (roleId) => html`<div class="sdg-list-item"><span class="dot" style="--sdg:${goal.color}"></span><span>${(state.catalog.roles.find((role) => role.id === roleId) || {}).title}</span></div>`,
                )
              : html`<p class="small muted">No role in the catalogue carries this goal directly.</p>`}
          </div>
          <div class="empty empty--compact" style="margin-top:16px">
            <p class="small muted">Build a skills profile to turn this catalogue view into your personal contribution map.</p>
            <a class="btn btn--primary btn--sm" href="#/intake">Build my profile</a>
          </div>
        </div>
      </aside>
    </div>`;
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
    root.querySelectorAll("[data-sdg]").forEach((card) => {
      if (card.classList.contains("sdg-card")) {
        const active = Number(card.getAttribute("data-sdg")) === number;
        card.classList.toggle("is-selected", active);
        card.setAttribute("aria-pressed", String(active));
      }
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