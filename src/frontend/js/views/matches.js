/** Future-role matching with skills gap analysis, scenario deltas and role detail. */

import { api } from "../core/api.js";
import { fmt, html, icon } from "../core/dom.js";
import { navigate } from "../core/router.js";
import * as store from "../core/store.js";
import { emptyState, levelDots, openModal, progressBar, scoreRing, scoreTone, toast, trendBadge } from "../core/ui.js";

let sortBy = "fit";
let layoutMode = "bubbles";

const BUBBLE_MIN = 100;
const BUBBLE_MAX = 230;
const GOLDEN_ANGLE = (137.508 * Math.PI) / 180;
const VBOX_W = 1000;
const VBOX_H = 700;

/** Greedy circle packing in a virtual box: biggest first, spiral search, shrink on
 *  collision so every bubble lands somewhere without overlapping another one. */
function packBubbles(diameters) {
  const placed = [];
  const gap = 12;
  const maxRadius = Math.min(VBOX_W, VBOX_H) * 0.56;

  diameters.forEach((diameter, index) => {
    let radius = diameter / 2;
    let spot = null;

    for (let attempt = 0; attempt < 10 && !spot; attempt += 1) {
      for (let step = 0; step < 1400; step += 1) {
        const progress = step / 1400;
        const distance = (radius + gap) * 0.2 + Math.sqrt(progress) * maxRadius;
        const angle = index * GOLDEN_ANGLE + step * 0.35;
        const x = VBOX_W / 2 + distance * Math.cos(angle);
        const y = VBOX_H / 2 + distance * Math.sin(angle);
        if (x - radius < 4 || x + radius > VBOX_W - 4 || y - radius < 4 || y + radius > VBOX_H - 4) continue;
        if (placed.some((item) => Math.hypot(item.x - x, item.y - y) < item.r + radius + gap)) continue;
        spot = { x, y, r: radius };
        break;
      }
      if (!spot) radius *= 0.9;
    }

    placed.push(spot || { x: VBOX_W / 2, y: VBOX_H / 2, r: radius });
  });

  return placed;
}

function sortedMatches(matches) {
  const list = [...matches.matches];
  if (sortBy === "demand") list.sort((a, b) => b.demandIndex - a.demandIndex);
  else if (sortBy === "salary") list.sort((a, b) => b.salary.max - a.salary.max);
  else list.sort((a, b) => b.fitScore - a.fitScore);
  return list;
}

function matchCard(match, index, scenario) {
  const tone = scoreTone(match.fitScore);
  const gaps = match.skillsGap.slice(0, 4);
  return html`<article class="match-card ${index === 0 ? "match-card--top" : ""}" data-role-id="${match.roleId}">
    <div>
      <div class="row row--wrap" style="--gap:8px">
        ${index === 0 ? html`<span class="badge badge--brand">${icon("sparkles", 11)} Best fit</span>` : ""}
        <span class="badge badge--neutral">${match.family}</span>
        <span class="tiny faint">${match.sector}</span>
      </div>
      <h3 class="match-card__title" style="margin-top:7px">${match.title}</h3>
      <div class="match-card__meta">
        ${trendBadge(match.demandTrend)}
        <span>Demand ${match.demandIndex}/100</span>
        <span>Automation risk ${match.automationRisk}%</span>
        <span>${fmt.range(match.salary.min, match.salary.max, match.salary.currency)}</span>
      </div>
      <p class="match-card__summary">${fmt.short(match.summary, 150)}</p>
      <div class="match-card__reasons">
        ${match.reasons.map((reason) => html`<span class="match-card__reason">${reason}</span>`)}
      </div>
      <div class="tag-row" style="margin-top:10px">
        ${match.skillsGap.length === 0
          ? html`<span class="tag tag--match">${icon("check", 11)} No skill gaps</span>`
          : gaps.map((gap) => html`<span class="tag tag--gap">${gap.name} ${gap.currentLevel}→${gap.requiredLevel}</span>`)}
        ${match.skillsGap.length > 4 ? html`<span class="tag tag--muted">+${match.skillsGap.length - 4} more</span>` : ""}
      </div>
      <div class="match-card__foot">
        <button class="btn btn--secondary btn--sm" type="button" data-action="view-role" data-role="${match.roleId}">
          ${icon("eye", 14)} Role detail
        </button>
        <button class="btn btn--ghost btn--sm" type="button" data-action="build-pathway" data-role="${match.roleId}">
          ${icon("route", 14)} Build pathway
        </button>
        <a class="btn btn--ghost btn--sm" href="#/signals?roleId=${match.roleId}">${icon("activity", 14)} Signals</a>
      </div>
    </div>
    <div class="match-card__score">
      <strong style="color:var(--${tone})">${match.fitScore}</strong>
      <span>fit score</span>
      ${match.fitDelta
        ? html`<span class="tiny ${match.fitDelta > 0 ? "delta--up" : "delta--down"}">${match.fitDelta > 0 ? "+" : ""}${match.fitDelta} vs baseline</span>`
        : html`<span class="tiny faint">baseline</span>`}
    </div>
  </article>`;
}

function gapMatrix(matches, catalog) {
  const top = matches.matches.slice(0, 5);
  const priority = new Map();
  top.forEach((match) => {
    match.skillsGap.forEach((gap) => {
      priority.set(gap.skillId, (priority.get(gap.skillId) || 0) + gap.priority);
    });
  });
  const skillIds = [...priority.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([skillId]) => skillId);
  if (!skillIds.length) return html`<p class="small muted">No gaps across the top roles.</p>`;

  const header = skillIds.map((skillId) => {
    const skill = (catalog.skills || []).find((item) => item.id === skillId);
    return html`<th title="${skill?.name || skillId}">${(skill?.name || skillId).split(" ")[0]}</th>`;
  });

  const rows = top.map((match) => {
    const cells = skillIds.map((skillId) => {
      const gap = match.skillsGap.find((item) => item.skillId === skillId);
      const level = gap ? gap.gap : 0;
      return html`<td><span class="gap-cell gap-cell--${Math.min(level, 3)}">${gap ? level : "✓"}</span></td>`;
    });
    return html`<tr><td><strong>${match.title}</strong></td>${cells}</tr>`;
  });

  return html`<div class="table-wrap">
    <table class="table gap-matrix">
      <thead><tr><th>Role</th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="matrix-legend">
    <span><i style="background:var(--success-soft)"></i> met</span>
    <span><i style="background:var(--gold-soft)"></i> 1 level</span>
    <span><i style="background:var(--warning-soft)"></i> 2 levels</span>
    <span><i style="background:var(--danger-soft)"></i> 3+ levels</span>
  </div>`;
}

function sideColumn(state, matches) {
  const catalog = state.catalog;
  const top = matches.matches[0];
  const scenario = (catalog.scenarios || []).find((item) => item.id === matches.scenarioId) || catalog.scenarios[0];
  const topGaps = [...top.skillsGap].sort((a, b) => b.priority - a.priority).slice(0, 5);

  return html`<aside class="sticky">
    <section class="side-card">
      <div class="row" style="--gap:14px;align-items:center">
        ${scoreRing(matches.summary.readinessScore, { size: 104, stroke: 9, label: "Readiness" })}
        <div>
          <p class="side-card__title" style="margin-bottom:4px">Profile summary</p>
          <p class="strong" style="font-size:13px">${top.title}</p>
          <p class="tiny faint">Top fit ${top.fitScore}/100 · ${matches.matches.length} roles scored</p>
        </div>
      </div>
      <div class="kv" style="margin-top:14px">
        <div class="kv__row"><dt>Skills to close</dt><dd>${matches.summary.skillsToClose}</dd></div>
        <div class="kv__row"><dt>Scenario</dt><dd>${scenario.shortName}</dd></div>
        <div class="kv__row"><dt>Generated</dt><dd>${fmt.dateTime(matches.generatedAt)}</dd></div>
        <div class="kv__row"><dt>Matcher</dt><dd class="mono">${matches.model || "career-match"}</dd></div>
      </div>
      <button class="btn btn--primary btn--block" type="button" data-action="build-pathway" data-role="${top.roleId}" style="margin-top:14px">
        ${icon("route", 15)} Build my pathway
      </button>
    </section>

    <section class="side-card">
      <p class="side-card__title">Biggest gaps for ${top.title}</p>
      ${topGaps.length
        ? html`<div class="stack" style="--gap:11px">
          ${topGaps.map(
            (gap) => html`<div>
              <div class="gauge-row__top">
                <span>${gap.name}</span>
                <strong>${gap.currentLevel} → ${gap.requiredLevel}</strong>
              </div>
              ${progressBar((gap.currentLevel / 5) * 100, { className: "bar--sm", tone: "warning" })}
            </div>`,
          )}
        </div>`
        : html`<p class="small muted">No gaps — this profile already meets the bar.</p>`}
    </section>

    <section class="side-card">
      <p class="side-card__title">Gap matrix · top five roles</p>
      ${gapMatrix(matches, catalog)}
    </section>

    <section class="side-card">
      <p class="side-card__title">How the score works</p>
      <p class="small muted">
        Fit is a weighted overlap between your self-rated levels and each role's required levels, adjusted by sector,
        experience, interests and the selected scenario.
      </p>
      <div class="row row--wrap" style="--gap:8px;margin-top:10px">
        <button class="btn btn--ghost btn--sm" type="button" data-action="method">${icon("info", 14)} Method</button>
        <button class="btn btn--ghost btn--sm" type="button" data-action="recompute">${icon("refresh", 14)} Re-score</button>
      </div>
    </section>
  </aside>`;
}

const TONE_LABEL = {
  success: "strong fit",
  brand: "good fit",
  gold: "stretch",
  danger: "distant",
};

function layoutToggle() {
  return html`<div class="segmented" role="group" aria-label="Match layout">
    <button type="button" class="segmented__item ${layoutMode === "bubbles" ? "is-active" : ""}" data-action="layout" data-layout="bubbles">
      ${icon("target", 13)} Bubbles
    </button>
    <button type="button" class="segmented__item ${layoutMode === "cards" ? "is-active" : ""}" data-action="layout" data-layout="cards">
      ${icon("layers", 13)} Cards
    </button>
  </div>`;
}

function bubbleField(matches) {
  const list = sortedMatches(matches);
  const fits = list.map((match) => match.fitScore);
  const lo = Math.min(...fits);
  const hi = Math.max(...fits);
  const span = Math.max(1, hi - lo);

  /* Diameters live in the same virtual units as the packing box, then become a
     percentage of the container width so the cloud scales with the layout. */
  const diameters = list.map((match) => BUBBLE_MIN + ((match.fitScore - lo) / span) * (BUBBLE_MAX - BUBBLE_MIN));
  const spots = packBubbles(diameters);

  const bubbles = list.map((match, index) => {
    const spot = spots[index];
    const diameter = spot.r * 2;
    const sizePct = (diameter / VBOX_W) * 100;
    const x = (spot.x / VBOX_W) * 100;
    const y = (spot.y / VBOX_H) * 100;
    const compact = sizePct < 15.5;
    const hero = sizePct >= 19;
    const tone = scoreTone(match.fitScore);
    const duration = (6.4 + (index % 5) * 0.85).toFixed(2);
    const delay = (-index * 0.68).toFixed(2);
    const driftX = (((index % 3) - 1) * 5).toFixed(0);
    const driftY = ((((index + 1) % 3) - 1) * 4).toFixed(0);

    return html`<button
      type="button"
      class="bubble bubble--${tone}${compact ? " bubble--compact" : ""}${hero ? " bubble--hero" : ""}"
      style="--size:${sizePct.toFixed(2)}%;--x:${x.toFixed(2)}%;--y:${y.toFixed(2)}%;--fit:${(sizePct * 0.3).toFixed(2)}cqw;--name:${(sizePct * 0.12).toFixed(2)}cqw;--dur:${duration}s;--delay:${delay}s;--dx:${driftX}px;--dy:${driftY}px"
      data-action="view-role"
      data-role="${match.roleId}"
      title="${match.title} · fit ${match.fitScore}/100 · ${match.family}"
      aria-label="${match.title}, ${match.fitScore} out of 100 fit, ${match.family}"
    >
      <span class="bubble__fit">${match.fitScore}</span>
      <span class="bubble__name">${match.title}</span>
    </button>`;
  });

  const tones = ["success", "brand", "gold", "danger"];

  return html`<section class="bubble-card">
    <div class="bubble-card__head">
      <div>
        <p class="eyebrow">${icon("target", 14)} Role constellation</p>
        <h2 class="bubble-card__title">Role constellation</h2>
        <p class="bubble-card__hint">
          Click a bubble for gaps. Use <strong>Cards</strong> for details.
        </p>
      </div>
      <div class="bubble-legend">
        ${tones.map((tone) => html`<span class="bubble-legend__item"
          ><i class="bubble-legend__dot bubble-legend__dot--${tone}"></i>${TONE_LABEL[tone]}</span
        >`)}
      </div>
    </div>
    <div class="bubble-field" role="group" aria-label="Future roles sized by fit score">${bubbles}</div>
    <p class="bubble-card__foot tiny faint">
      ${icon("info", 12)} Bubble size = fit. Ranking follows the <strong>${sortBy === "fit" ? "best fit" : sortBy === "demand" ? "demand" : "salary"}</strong> sort.
    </p>
  </section>`;
}

function page(state, matches) {
  const catalog = state.catalog;
  const scenario = (catalog.scenarios || []).find((item) => item.id === matches.scenarioId) || catalog.scenarios[0];
  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("target", 14)} Step 03 · Matches</p>
      <div class="page-head__row">
        <h1 class="page-title">Roles scored against your skills</h1>
        <div class="page-head__actions">
          <a class="btn btn--secondary btn--sm" href="#/intake">${icon("sliders", 15)} Adjust profile</a>
          <a class="btn btn--primary btn--sm" href="#/pathway">${icon("route", 15)} Pathway</a>
        </div>
      </div>
      <p class="page-lead">
        See fit, gaps and how the scenario changes the ranking.
      </p>
      <div class="page-meta">
        <span>${icon("compare", 13)} ${scenario.name}</span>
        <span>${icon("clock", 13)} Scored ${fmt.relative(matches.generatedAt)}</span>
        <span>${icon("user", 13)} ${state.profile.name} · ${state.profile.currentRole || "no current role"}</span>
      </div>
    </div>

    <div class="row row--between row--wrap" style="margin-bottom:14px">
      <div class="row row--wrap" style="--gap:10px">
        <div class="segmented" role="group" aria-label="Sort matches">
          <button type="button" class="segmented__item ${sortBy === "fit" ? "is-active" : ""}" data-action="sort" data-sort="fit">Best fit</button>
          <button type="button" class="segmented__item ${sortBy === "demand" ? "is-active" : ""}" data-action="sort" data-sort="demand">Demand</button>
          <button type="button" class="segmented__item ${sortBy === "salary" ? "is-active" : ""}" data-action="sort" data-sort="salary">Salary</button>
        </div>
        ${layoutToggle()}
      </div>
      <p class="tiny faint">Scores update when you change the scenario in the top bar.</p>
    </div>

    <div class="match-layout">
      ${layoutMode === "bubbles"
        ? bubbleField(matches)
        : html`<div class="match-list" data-role="match-list">
            ${sortedMatches(matches).map((match, index) => matchCard(match, index, scenario))}
          </div>`}
      ${sideColumn(state, matches)}
    </div>`;
}

function roleModal(match, state) {
  store.recordJourney("roleExplored", match.roleId);
  const catalog = state.catalog;
  const role = (catalog.roles || []).find((item) => item.id === match.roleId);
  const gaps = [...match.skillsGap].sort((a, b) => b.priority - a.priority);
  const met = match.matchedSkills;

  openModal({
    title: match.title,
    eyebrow: match.family + " · " + match.sector,
    size: "lg",
    body: html`<div class="stack" style="--gap:18px">
      <div class="row row--wrap" style="--gap:8px">
        <span class="badge badge--brand">${match.fitScore}/100 fit</span>
        ${trendBadge(match.demandTrend)}
        <span class="tag">Demand ${match.demandIndex}</span>
        <span class="tag">Automation risk ${match.automationRisk}%</span>
        <span class="tag">${fmt.range(match.salary.min, match.salary.max, match.salary.currency)}</span>
      </div>
      <p class="small" style="color:var(--ink-2);line-height:1.7">${role?.summary || match.summary}</p>
      <p class="small muted" style="line-height:1.7">${role?.outlook || match.outlook}</p>

      <div>
        <p class="side-card__title" style="margin-bottom:8px">Skills gap · ${gaps.length} to close</p>
        <div class="stack" style="--gap:9px">
          ${gaps.length
            ? gaps.map(
                (gap) => html`<div class="skill-gap-line">
                  <div>
                    <div class="skill-gap-line__label">${gap.name} ${levelDots(gap.currentLevel)}</div>
                    ${progressBar((gap.currentLevel / gap.requiredLevel) * 100, { className: "bar--sm", tone: "warning" })}
                  </div>
                  <span class="skill-gap-line__levels">${gap.currentLevel} → ${gap.requiredLevel}</span>
                </div>`,
              )
            : html`<p class="small muted">All required skills are met.</p>`}
        </div>
        ${met.length
          ? html`<p class="tiny faint" style="margin-top:10px">Already met: ${met.map((skill) => skill.name).join(", ")}</p>`
          : ""}
      </div>

      <div>
        <p class="side-card__title" style="margin-bottom:8px">SDG contribution</p>
        <div class="tag-row">
          ${(match.sdgs || []).map(
            (sdg) => html`<span class="tag" style="border-left:3px solid ${(catalog.sdgs || []).find((goal) => goal.number === sdg.number)?.color || "var(--brand)"}">
              SDG ${sdg.number} · ${sdg.tier}
            </span>`,
          )}
        </div>
      </div>
    </div>`,
    footer: html`<button class="btn btn--ghost" type="button" data-modal-close="true">Close</button>
      <a class="btn btn--secondary" href="#/signals?roleId=${match.roleId}" data-modal-close="true">${icon("activity", 14)} Signals</a>
      <button class="btn btn--primary" type="button" data-modal-close="true" data-action="build-pathway" data-role="${match.roleId}">
        ${icon("route", 15)} Build pathway
      </button>`,
  });
}

function methodModal() {
  openModal({
    title: "How scoring works",
    eyebrow: "Transparency",
    body: html`<div class="stack" style="--gap:14px">
      <p class="small" style="color:var(--ink-2);line-height:1.7">
        Fit is simple and inspectable:
      </p>
      <ol class="stack" style="--gap:10px;list-style:decimal;padding-left:18px">
        <li class="small muted">Roles define target levels and skill weights.</li>
        <li class="small muted">Your level ÷ target (capped at 1) × importance.</li>
        <li class="small muted">The weighted overlap is scaled to 0–100, with small sector, experience and interest adjustments.</li>
        <li class="small muted">The scenario adds a role-specific delta.</li>
      </ol>
      <div class="notice">${icon("info", 15)}<span>Self-assessment is noisy; the pathway starts with a diagnostic.</span></div>
    </div>`,
    footer: html`<button class="btn btn--primary" type="button" data-modal-close="true">Got it</button>`,
  });
}

function bind(root) {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;
    const action = target.getAttribute("data-action");
    const state = store.getState();
    const matches = state.matches;

    if (action === "sort" || action === "layout") {
      if (action === "sort") sortBy = target.getAttribute("data-sort") || "fit";
      else layoutMode = target.getAttribute("data-layout") || "bubbles";
      if (matches) root.innerHTML = page(store.getState(), matches).value;
    } else if (action === "view-role" && matches) {
      const match = matches.matches.find((item) => item.roleId === target.getAttribute("data-role"));
      if (match) roleModal(match, state);
    } else if (action === "build-pathway") {
      const roleId = target.getAttribute("data-role");
      if (roleId) store.recordJourney("roleExplored", roleId);
      navigate("/pathway" + (roleId ? "?role=" + roleId : ""));
    } else if (action === "method") {
      methodModal();
    } else if (action === "recompute") {
      target.disabled = true;
      api
        .match(state.profile, state.scenarioId)
        .then((result) => {
          toast("Matches recalculated for " + (state.catalog.scenarios.find((item) => item.id === result.scenarioId)?.shortName || result.scenarioId) + ".", {
            tone: "success",
            title: "Re-scored",
          });
          root.innerHTML = page(state, result).value;
        })
        .catch((error) => toast(error.message || "Re-scoring failed.", { tone: "danger" }))
        .finally(() => {
          target.disabled = false;
        });
    }
  });
}

export const matchesView = {
  id: "matches",
  title: "Role matches",
  icon: "target",
  loadingMessage: "Scoring future roles…",

  async render({ state }) {
    if (!state.profile) {
      return html`${emptyState({
        icon: "user",
        title: "Start with a skills profile",
        body: "Add your skills, sector and interests. Takes about five minutes.",
        action: html`<div class="row" style="justify-content:center;--gap:8px">
          <a class="btn btn--primary" href="#/intake">Build my profile</a>
          <button class="btn btn--secondary" type="button" data-action="use-sample">Use sample profile</button>
        </div>`,
      })}`;
    }
    let matches = store.getState().matches;
    if (!matches || matches.scenarioId !== state.scenarioId) {
      matches = await api.match(state.profile, state.scenarioId);
    }
    return page(store.getState(), matches);
  },

  mount(root, { route }) {
    if (!root.dataset.matchesBound) {
      root.dataset.matchesBound = "1";
      bind(root);
    }
    if (route.query.role) {
      const state = store.getState();
      const match = state.matches?.matches.find((item) => item.roleId === route.query.role);
      if (match) window.setTimeout(() => roleModal(match, state), 120);
    }
  },
};