/** Personalised reskilling pathway: phases, modules, milestones, coverage and cost. */

import { api } from "../core/api.js";
import { copyText, fmt, html, icon } from "../core/dom.js";
import { FORMAT_LABELS, LEVEL_LABELS } from "../core/options.js";
import { navigate } from "../core/router.js";
import * as store from "../core/store.js";
import { emptyState, progressBar, scoreRing, toast } from "../core/ui.js";

function moduleRow(module, index) {
  const title = module.url
    ? html`<a href="${module.url}" target="_blank" rel="noopener noreferrer">${module.title} ${icon("external", 11)}</a>`
    : html`${module.title}`;
  return html`<div class="module">
    <span class="module__index">${String(index + 1).padStart(2, "0")}</span>
    <div class="module__body">
      <p class="module__title">${title}</p>
      <p class="module__meta">
        <span>${module.provider}</span>
        <span>${FORMAT_LABELS[module.format] || module.format}</span>
        <span>${module.credential || ""}</span>
      </p>
      ${module.targets && module.targets.length
        ? html`<div class="tag-row" style="margin-top:6px">
            ${module.targets.map(
              (target) => html`<span class="tag tag--gap">${target.name} ${target.fromLevel}→${target.toLevel}</span>`,
            )}
          </div>`
        : ""}
    </div>
    <div class="module__side">
      <span class="module__cost">${Number(module.cost) ? fmt.money(module.cost, module.currency || "USD") : "Free"}</span>
      <span class="module__level">${module.hours}h · ${LEVEL_LABELS[module.level] || module.level}</span>
    </div>
  </div>`;
}

function phaseCard(phase, index) {
  return html`<section class="phase">
    <span class="phase__marker">${index + 1}</span>
    <div class="phase__head">
      <div>
        <h3 class="phase__title">${phase.title}</h3>
        <p class="phase__goal">${phase.goal}</p>
      </div>
      <div class="phase__weeks">
        <strong>${phase.weeks}w</strong>
        <span>weeks ${phase.startWeek}–${phase.endWeek}</span>
        <span>${phase.hours}h · ${phase.cost ? fmt.money(phase.cost) : "free"}</span>
      </div>
    </div>
    <div style="margin-top:12px">
      ${phase.modules.length
        ? phase.modules.map((module, moduleIndex) => moduleRow(module, moduleIndex))
        : html`<p class="small muted">No module is assigned to this phase yet.</p>`}
    </div>
    <div class="milestones">
      ${phase.milestones.map(
        (milestone) => html`<div class="milestone">
          ${icon("check", 13)}
          <div>
            <strong>${milestone.title}</strong>
            <span class="milestone__week" style="margin-left:6px">week ${milestone.week}</span>
            <p class="tiny" style="color:var(--faint);margin-top:1px">${milestone.detail}</p>
          </div>
        </div>`,
      )}
    </div>
  </section>`;
}

function coverageList(pathway) {
  const covers = [...pathway.covers].sort((a, b) => Number(a.covered) - Number(b.covered));
  return html`<div class="covers-list">
    ${covers.map(
      (cover) => html`<div class="cover-row">
        <div>
          <p class="cover-row__name">${cover.name} ${cover.covered ? "" : html`<span class="tag tag--gap" style="margin-left:4px">uncovered</span>`}</p>
        </div>
        <div class="cover-row__track">
          <span>${cover.fromLevel}→${cover.toLevel}</span>
          ${progressBar((cover.toLevel / 5) * 100, { className: "bar--sm", tone: cover.covered ? "brand" : "warning" })}
        </div>
      </div>`,
    )}
  </div>`;
}

function roleOptions(matches, selectedId) {
  return [...matches.matches]
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 8)
    .map(
      (match) => html`<option value="${match.roleId}" ${match.roleId === selectedId ? "selected" : ""}>
        ${match.title} · ${match.fitScore} fit
      </option>`,
    );
}

function page(state, path, matches) {
  const catalog = state.catalog;
  const scenario = (catalog.scenarios || []).find((item) => item.id === path.scenarioId) || catalog.scenarios[0];
  const covered = path.covers.filter((cover) => cover.covered).length;
  const share = path.covers.length ? Math.round((covered / path.covers.length) * 100) : 100;

  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("route", 14)} Step 04 · Personalised reskilling pathway</p>
      <div class="page-head__row">
        <h1 class="page-title">A plan built from your gaps, not a catalogue</h1>
        <div class="page-head__actions">
          <button class="btn btn--secondary btn--sm" type="button" data-action="print-pathway">${icon("printer", 15)} Print</button>
          <button class="btn btn--primary btn--sm" type="button" data-action="copy-pathway">${icon("copy", 15)} Copy plan</button>
        </div>
      </div>
      <p class="page-lead">${path.rationale}</p>
      <div class="page-meta">
        <span>${icon("compare", 13)} ${scenario.name}</span>
        <span>${icon("clock", 13)} ${path.hoursPerWeek}h per week</span>
        <span>${icon("calendar", 13)} Starts ${fmt.date(path.generatedAt)}</span>
        <span>${icon("shield", 13)} ${covered} of ${path.covers.length} gaps covered</span>
      </div>
    </div>

    <div class="plan-layout">
      <div>
        <section class="plan-head">
          <div class="plan-head__body">
            <p class="plan-head__eyebrow">Target role · ${scenario.shortName}</p>
            <h2 class="plan-head__title">${path.roleTitle}</h2>
            <div class="plan-head__meta">
              <span class="badge badge--brand">${path.horizonWeeks} weeks</span>
              <span class="badge badge--neutral">${path.totalHours} study hours</span>
              <span class="badge badge--neutral">${path.totalCost ? fmt.money(path.totalCost) : "No cost"}</span>
              <span class="badge badge--success">${share}% of gaps covered</span>
            </div>
            <div class="plan-stats">
              <div class="plan-stat"><strong>${path.readinessFrom} → ${path.readinessTo}</strong><span>Readiness</span></div>
              <div class="plan-stat"><strong>${path.phases.length}</strong><span>Phases</span></div>
              <div class="plan-stat"><strong>${path.phases.reduce((sum, phase) => sum + phase.modules.length, 0)}</strong><span>Modules &amp; artefacts</span></div>
            </div>
          </div>
          ${scoreRing(path.readinessTo, { size: 118, stroke: 10, label: "Projected" })}
        </section>

        <div class="row row--between row--wrap" style="margin:16px 0 0">
          <div class="row" style="--gap:9px">
            <label class="field__label" for="pathway-role" style="margin:0">Target role</label>
            <select class="select" id="pathway-role" data-role-select style="height:36px;min-width:230px">
              ${roleOptions(matches, path.roleId)}
            </select>
          </div>
          <a class="btn btn--ghost btn--sm" href="#/intake">${icon("sliders", 14)} Change hours or budget</a>
        </div>

        <div class="timeline">
          ${path.phases.map((phase, index) => phaseCard(phase, index))}
        </div>

        <div class="notice" style="margin-top:16px">
          ${icon("info", 16)}
          <span>
            <strong>Plan integrity.</strong> This pathway is assembled from the gaps in your top match and the curated module
            catalogue. Costs and hours are estimates; confirm before enrolling.
          </span>
        </div>
      </div>

      <aside class="sticky">
        <section class="side-card">
          <div class="row" style="--gap:13px;align-items:center">
            ${scoreRing(path.readinessTo, { size: 92, stroke: 9, tone: "success", label: "Ready" })}
            <div>
              <p class="side-card__title" style="margin-bottom:4px">Projected readiness</p>
              <p class="strong" style="font-size:13px">${path.readinessFrom} → ${path.readinessTo}/100</p>
              <p class="tiny faint">After ${path.horizonWeeks} weeks at ${path.hoursPerWeek}h/week</p>
            </div>
          </div>
          <div class="kv" style="margin-top:14px">
            <div class="kv__row"><dt>Total study hours</dt><dd>${path.totalHours}h</dd></div>
            <div class="kv__row"><dt>Estimated cost</dt><dd>${path.totalCost ? fmt.money(path.totalCost) : "Free"}</dd></div>
            <div class="kv__row"><dt>Phase budget</dt><dd>${fmt.money(state.profile?.constraints?.budget || 0)}</dd></div>
            <div class="kv__row"><dt>Generated</dt><dd>${fmt.relative(path.generatedAt)}</dd></div>
          </div>
        </section>

        <section class="side-card">
          <p class="side-card__title">Gap coverage</p>
          ${coverageList(path)}
        </section>

        ${path.notes && path.notes.length
          ? html`<section class="side-card">
              <p class="side-card__title">Notes &amp; caveats</p>
              <div class="stack" style="--gap:8px">
                ${path.notes.map((note) => html`<p class="small muted">${note}</p>`)}
              </div>
            </section>`
          : ""}

        <section class="side-card">
          <p class="side-card__title">Next actions</p>
          <div class="stack" style="--gap:8px">
            <a class="btn btn--secondary btn--sm" href="#/sdg">${icon("globe", 14)} See the SDG impact</a>
            <a class="btn btn--secondary btn--sm" href="#/signals">${icon("activity", 14)} Check the signals</a>
            <button class="btn btn--ghost btn--sm" type="button" data-action="copy-pathway">${icon("copy", 14)} Copy as text</button>
          </div>
        </section>
      </aside>
    </div>`;
}

function pathwayText(state, path) {
  const scenario = (state.catalog.scenarios || []).find((item) => item.id === path.scenarioId) || {};
  const lines = [];
  lines.push("AI Career Navigator — reskilling pathway");
  lines.push("Profile: " + state.profile.name + " · scenario: " + (scenario.name || path.scenarioId));
  lines.push("Target role: " + path.roleTitle);
  lines.push("Horizon: " + path.horizonWeeks + " weeks at " + path.hoursPerWeek + "h/week · cost $" + path.totalCost);
  lines.push("Projected readiness: " + path.readinessFrom + " → " + path.readinessTo + "/100");
  lines.push("");
  path.phases.forEach((phase) => {
    lines.push(phase.title + " (weeks " + phase.startWeek + "–" + phase.endWeek + ")");
    phase.modules.forEach((module) => {
      lines.push("  - " + module.title + " · " + module.provider + " · " + module.hours + "h · $" + module.cost);
    });
    phase.milestones.forEach((milestone) => {
      lines.push("  * " + milestone.title + " (week " + milestone.week + ")");
    });
    lines.push("");
  });
  lines.push("Gaps to close:");
  path.covers.forEach((cover) => {
    lines.push("  - " + cover.name + ": " + cover.fromLevel + " → " + cover.requiredLevel + (cover.covered ? "" : " (not covered by catalogue)"));
  });
  return lines.join("\n");
}

export const pathwayView = {
  id: "pathway",
  title: "Reskilling pathway",
  icon: "route",
  loadingMessage: "Assembling your pathway…",

  async render({ state, route }) {
    if (!state.profile) {
      return html`${emptyState({
        icon: "route",
        title: "No pathway without a profile",
        body: "The plan is assembled from your skills gap. Build a profile (or load the sample) and the navigator will sequence the modules.",
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
    const roleId = route.query.role || matches.summary.topRoleId;
    let path = store.getState().pathway;
    if (!path || path.roleId !== roleId || path.scenarioId !== state.scenarioId) {
      path = await api.pathway(state.profile, state.scenarioId, roleId);
    }
    return page(store.getState(), path, matches);
  },

  mount(root) {
    const select = root.querySelector("[data-role-select]");
    if (select && !select.dataset.bound) {
      select.dataset.bound = "1";
      select.addEventListener("change", () => navigate("/pathway?role=" + select.value));
    }

    if (!root.dataset.pathwayBound) {
      root.dataset.pathwayBound = "1";
      root.addEventListener("click", async (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
        if (!target) return;
        const action = target.getAttribute("data-action");
        const state = store.getState();
        const path = state.pathway;
        if (!path) return;

        if (action === "print-pathway") {
          window.print();
        } else if (action === "copy-pathway") {
          const ok = await copyText(pathwayText(state, path));
          toast(ok ? "Pathway copied as plain text." : "Copy failed — print instead.", {
            tone: ok ? "success" : "danger",
            duration: 2600,
          });
        }
      });
    }

  },
};
