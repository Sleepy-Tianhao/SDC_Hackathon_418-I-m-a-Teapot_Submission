/** Overview: the landing page and the personal readiness dashboard. */

import { api } from "../core/api.js";
import { radarChart } from "../core/charts.js";
import { fmt, html, icon } from "../core/dom.js";
import * as store from "../core/store.js";
import { momentumBadge, progressBar, scoreRing, statCard, toast } from "../core/ui.js";

async function loadSignals(limit) {
  try {
    return await api.listSignals({ limit, sort: "recent" });
  } catch {
    return { items: [], total: 0, lastRefreshedAt: null };
  }
}

function heroAside(matches) {
  const top = matches.matches[0];
  return html`<div class="hero__aside">
    ${scoreRing(matches.summary.readinessScore, { size: 128, label: "Readiness" })}
    <div>
      <p class="hero__aside-label">Best-fit future role</p>
      <p class="hero__aside-role">${top.title}<span>${top.fitScore}/100 fit · ${top.family}</span></p>
    </div>
  </div>`;
}

function heroStats(items) {
  return html`<div class="hero__stats">
    ${items.map((item) => html`<div class="hero__stat"><strong>${item.value}</strong><span>${item.label}</span></div>`)}
  </div>`;
}

function landing(signalData) {
  const items = signalData.items || [];
  const total = signalData.total || items.length;
  const steps = [
    { icon: "user", step: "01", title: "Capture your skills", body: "A five-minute profile of what you can actually do, not what your job title says." },
    { icon: "activity", step: "02", title: "Read dated signals", body: "Every trend carries a publisher, a date and an evidence link — no undated claims." },
    { icon: "target", step: "03", title: "Match future roles", body: "See fit scores, the exact skills gap and how each scenario changes the ranking." },
    { icon: "route", step: "04", title: "Walk a pathway", body: "A sequenced plan with courses, cost, weeks and portfolio evidence, mapped to the SDGs." },
  ];

  return html`<section class="hero">
    <div class="hero__content">
      <p class="hero__eyebrow">${icon("sparkles", 12)} Domain 1 · Future-ready workforce</p>
      <h1 class="hero__title">Navigate the next version of work, <em>with evidence</em>.</h1>
      <p class="hero__lead">
        AI Career Navigator tracks dated signals about AI and labour markets, matches your real skills to future roles,
        and builds a reskilling pathway that shows how your next job connects to the SDGs — across more than one future.
      </p>
      <div class="hero__actions">
        <a class="btn btn--primary btn--lg" href="#/intake">${icon("user", 17)} Build my skills profile</a>
        <button class="btn btn--secondary btn--lg" type="button" data-action="use-sample">
          ${icon("play", 16)} Explore with a sample profile
        </button>
      </div>
      ${heroStats([
        { value: total + " signals", label: "Dated & sourced" },
        { value: "12 roles", label: "Future-role catalogue" },
        { value: "3 futures", label: "2028 scenarios" },
        { value: "17 SDGs", label: "Role-level mapping" },
      ])}
    </div>
    <div class="hero__aside">
      <span class="hero__aside-label">How it works</span>
      <div class="stack" style="--gap:10px;width:100%">
        ${steps.slice(0, 3).map(
          (step) => html`<div class="row" style="--gap:10px;align-items:flex-start;text-align:left">
            <span class="badge badge--brand">${step.step}</span>
            <div>
              <p class="hero__aside-role">${step.title}</p>
              <p class="tiny" style="color:#8fa7b8;line-height:1.5">${step.body}</p>
            </div>
          </div>`,
        )}
      </div>
      <a class="btn btn--secondary btn--sm btn--block" href="#/signals">See the signal layer ${icon("arrowRight", 14)}</a>
    </div>
  </section>

  <div class="kpi-grid">
    ${statCard({ label: "Signal records", value: total, icon: "activity", hint: "Each record links to its publisher and date." })}
    ${statCard({ label: "Future roles", value: (store.getState().catalog?.roles || []).length, icon: "target", hint: "Modelled demand, salary band and required skills." })}
    ${statCard({ label: "Scenarios", value: (store.getState().catalog?.scenarios || []).length, icon: "compare", hint: "Change the assumptions, not just the numbers." })}
    ${statCard({ label: "SDGs mapped", value: (store.getState().catalog?.sdgs || []).length, icon: "globe", hint: "Every role carries a weighted SDG contribution." })}
  </div>

  <div class="section-head" style="margin-bottom:12px">
    <div>
      <h2 class="section-title">From signal to plan in four steps</h2>
      <p class="section-desc">Every must-have in the brief is a working screen.</p>
    </div>
  </div>
  <div class="grid grid--4">
    ${steps.map(
      (step, index) => html`<article class="panel reveal" style="--i:${index + 1}">
        <div class="row row--between" style="margin-bottom:10px">
          <span class="stat-card__icon">${icon(step.icon, 17)}</span>
          <span class="mono faint">${step.step}</span>
        </div>
        <h3 class="panel__title">${step.title}</h3>
        <p class="small muted" style="margin-top:6px">${step.body}</p>
      </article>`,
    )}
  </div>

  <div class="split" style="margin-top:18px">
    <section class="panel">
      <div class="panel__head">
        <div>
          <h2 class="panel__title">Latest signals</h2>
          <p class="panel__hint">Sourced, dated and ready to be challenged.</p>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/signals">All signals ${icon("arrowRight", 14)}</a>
      </div>
      ${items.length
        ? items.map(
            (signal) => html`<a class="signal-mini" href="#/signals?highlight=${signal.id}">
              <span class="signal-mini__title">${signal.title}</span>
              <span class="signal-mini__meta">
                ${momentumBadge(signal.momentum)}
                <span>${signal.publisher}</span>
                <span>·</span>
                <span>${fmt.date(signal.publishedAt)}</span>
              </span>
            </a>`,
          )
        : html`<p class="small muted">Connect the API to load signals.</p>`}
    </section>
    <div>
      <section class="panel">
        <h2 class="panel__title">Why this is different</h2>
        <ul class="stack" style="--gap:12px;margin-top:12px">
          <li class="row" style="align-items:flex-start;--gap:9px">
            <span style="color:var(--brand);margin-top:2px">${icon("calendar", 16)}</span>
            <span class="small muted"><strong class="strong">Dated sources.</strong> No undated trend claims: every insight carries a publisher, a date and a link.</span>
          </li>
          <li class="row" style="align-items:flex-start;--gap:9px">
            <span style="color:var(--brand);margin-top:2px">${icon("compare", 16)}</span>
            <span class="small muted"><strong class="strong">Scenario-aware.</strong> The same profile scores differently under acceleration and regulation — so plans survive more than one future.</span>
          </li>
          <li class="row" style="align-items:flex-start;--gap:9px">
            <span style="color:var(--brand);margin-top:2px">${icon("globe", 16)}</span>
            <span class="small muted"><strong class="strong">SDG-linked.</strong> Roles connect to the 17 goals with rationale, not a decorative logo strip.</span>
          </li>
        </ul>
      </section>
      <section class="panel" style="margin-top:12px">
        <h2 class="panel__title">Running without the backend</h2>
        <p class="small muted" style="margin-top:6px">
          The interface ships with a complete demo transport. If <code class="mono">/api/v1/health</code> does not answer, it
          falls back to dated fixtures and shows a clear demo badge.
        </p>
        <a class="btn btn--secondary btn--sm" style="margin-top:12px" href="#/connect">
          ${icon("plug", 15)} Integration status
        </a>
      </section>
    </div>
  </div>`;
}

const RADAR_LABELS = {
  "Data & AI": "Data & AI",
  "Digital & Systems": "Digital",
  "Human & Social": "Human",
  "Domain & Policy": "Domain",
};

function categoryRadar(profile, catalog) {
  const categories = [...new Set((catalog.skills || []).map((skill) => skill.category))];
  return categories
    .map((category) => {
      const ids = (catalog.skills || []).filter((skill) => skill.category === category).map((skill) => skill.id);
      const levels = (profile.skills || []).filter((skill) => ids.includes(skill.skillId)).map((skill) => skill.level);
      const average = levels.length ? levels.reduce((sum, level) => sum + level, 0) / levels.length : 0;
      return { label: RADAR_LABELS[category] || category, value: Math.round((average / 5) * 100) };
    })
    .filter((axis) => axis.value > 0);
}

function scenarioSensitivity(match, catalog) {
  return (catalog.scenarios || []).map((scenario) => {
    const delta = scenario.roleAdjustments?.[match.roleId]?.fitDelta || 0;
    const fit = Math.max(3, Math.min(99, (match.baselineFit || match.fitScore) + delta));
    return { scenario, fit, delta };
  });
}

function sdgPreview(sdgMap) {
  if (!sdgMap) return html`<p class="small muted">SDG mapping is unavailable.</p>`;
  const goals = [...sdgMap.goals].sort((a, b) => b.score - a.score).slice(0, 3);
  return html`<div class="gauge-stack">
    ${goals.map(
      (goal) => html`<div>
        <div class="gauge-row__top">
          <span class="row" style="--gap:6px">
            <span class="badge badge--neutral" style="background:${goal.color}1f;color:${goal.color}">SDG ${goal.number}</span>
            ${goal.shortName}
          </span>
          <strong>${goal.score}</strong>
        </div>
        ${progressBar(goal.score, { tone: "brand", className: "bar--sm", label: goal.name })}
      </div>`,
    )}
  </div>`;
}

function analysisPanel(analysis) {
  if (analysis && analysis.narrative) {
    return html`<div class="analysis-panel" data-role="analysis-panel">
      <div class="analysis-panel__head">
        <span class="badge badge--brand">${icon("sparkles", 12)} AI briefing</span>
        <span class="analysis-panel__model">${analysis.model || "model"} · ${fmt.dateTime(analysis.generatedAt)}</span>
      </div>
      <p class="analysis-text" data-role="analysis-text">${analysis.narrative}</p>
      <div class="analysis-actions">
        <button class="btn btn--secondary btn--sm" type="button" data-action="generate-briefing">${icon("refresh", 14)} Regenerate</button>
        <button class="btn btn--ghost btn--sm" type="button" data-copy="${analysis.narrative}">${icon("copy", 14)} Copy</button>
      </div>
    </div>`;
  }
  return html`<div class="analysis-panel" data-role="analysis-panel">
    <div class="analysis-panel__head">
      <span class="badge badge--brand">${icon("sparkles", 12)} AI briefing</span>
      <span class="analysis-panel__model">LLM narrative · grounded in this workspace</span>
    </div>
    <p class="small muted" data-role="analysis-text">
      Turn this matched profile, skills gap and scenario into a short written briefing you can paste into a conversation
      with a manager, a mentor or a careers adviser.
    </p>
    <div class="analysis-actions">
      <button class="btn btn--primary btn--sm" type="button" data-action="generate-briefing">
        ${icon("sparkles", 15)} Generate briefing
      </button>
      <span class="tiny faint">Streams from the backend; demo mode replays a generated narrative.</span>
    </div>
  </div>`;
}

function dashboard(state, matches, signals, sdgMap) {
  const profile = state.profile;
  const catalog = state.catalog;
  const top = matches.matches[0];
  const scenario = (catalog.scenarios || []).find((item) => item.id === matches.scenarioId) || catalog.scenarios[0];
  const sensitivity = scenarioSensitivity(top, catalog);
  const radar = categoryRadar(profile, catalog);
  const related = (signals.items || []).filter((signal) =>
    (signal.affectedRoles || []).some((role) => role.roleId === top.roleId),
  );
  const signalList = (related.length ? related : signals.items || []).slice(0, 3);
  const confidence = scenario.confidence ? Math.round(scenario.confidence * 100) + "% confidence" : "scenario";

  return html`<section class="hero">
    <div class="hero__content">
      <p class="hero__eyebrow">${icon("sparkles", 12)} ${scenario.name} · ${confidence}</p>
      <h1 class="hero__title">${profile.name.split(" ")[0]}, your strongest move is <em>${top.title}</em>.</h1>
      <p class="hero__lead">
        ${top.fitScore}/100 fit against ${top.matchedSkills.length} skills you already have, with ${matches.summary.skillsToClose}
        skills to close. ${top.scenarioNote || "The plan below adapts when the scenario changes."}
      </p>
      <div class="hero__actions">
        <a class="btn btn--primary btn--lg" href="#/matches">${icon("target", 17)} See all matches</a>
        <a class="btn btn--secondary btn--lg" href="#/pathway">${icon("route", 16)} Open my pathway</a>
      </div>
      ${heroStats([
        { value: matches.matches.length, label: "Roles scored" },
        { value: top.demandIndex, label: "Demand index" },
        {
          value: fmt.money(top.salary.min, top.salary.currency) + "–" + fmt.money(top.salary.max, top.salary.currency),
          label: "Salary band",
        },
        { value: fmt.relative(signals.lastRefreshedAt), label: "Signals refreshed" },
      ])}
    </div>
    ${heroAside(matches)}
  </section>

  <div class="kpi-grid">
    ${statCard({
      label: "Readiness score",
      value: matches.summary.readinessScore + "/100",
      icon: "activity",
      tone: "brand",
      hint: "Weighted fit across your top three adjacent roles.",
    })}
    ${statCard({ label: "Best-fit role", value: top.fitScore + "%", icon: "target", hint: top.title })}
    ${statCard({
      label: "Skills to close",
      value: matches.summary.skillsToClose,
      icon: "layers",
      hint: "Distinct gaps across your top three matches.",
    })}
    ${statCard({
      label: "Signals tracked",
      value: signals.total || (signals.items || []).length,
      icon: "activity",
      hint: "Each with a publisher, date and source link.",
    })}
  </div>

  <div class="grid grid--2">
    <section class="panel">
      <div class="panel__head">
        <div>
          <h2 class="panel__title">Top future roles</h2>
          <p class="panel__hint">Ranked by fit for this profile and scenario.</p>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/matches">Compare ${icon("arrowRight", 14)}</a>
      </div>
      ${matches.matches.slice(0, 4).map(
        (match, index) => html`<div class="mini-role">
          <span class="mini-role__rank">${String(index + 1).padStart(2, "0")}</span>
          <div class="mini-role__body">
            <a class="mini-role__title" href="#/matches?role=${match.roleId}">${match.title}</a>
            <span class="mini-role__meta">${match.family} · ${match.demandTrend} demand · ${match.skillsGap.length} gaps</span>
          </div>
          <div class="mini-role__score">${match.fitScore}<span>fit</span></div>
        </div>`,
      )}
    </section>

    <section class="panel">
      <div class="panel__head">
        <div>
          <h2 class="panel__title">Capability profile</h2>
          <p class="panel__hint">Average self-rated level per skill family.</p>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/intake">${icon("sliders", 14)} Edit</a>
      </div>
      <div class="row" style="justify-content:center">
        ${radar.length >= 3 ? radarChart(radar, { size: 250, label: "Capability radar" }) : html`<p class="small muted">Add skills to see the radar.</p>`}
      </div>
      <p class="tiny faint" style="text-align:center;margin-top:6px">
        Self-assessment, not certification. The pathway starts by verifying your real level.
      </p>
    </section>
  </div>

  <div class="split" style="margin-top:18px">
    ${analysisPanel(state.analysis)}

    <div>
      <section class="panel">
        <div class="panel__head">
          <div>
            <h2 class="panel__title">Scenario sensitivity</h2>
            <p class="panel__hint">${top.title} across three 2028 futures.</p>
          </div>
        </div>
        <div class="gauge-stack">
          ${sensitivity.map(
            (item) => html`<a href="#/scenarios" style="color:inherit;text-decoration:none;display:block">
              <div class="gauge-row__top">
                <span>${item.scenario.shortName}</span>
                <strong>${item.fit}
                  ${item.delta
                    ? html`<span class="tiny ${item.delta > 0 ? "delta--up" : "delta--down"}">${item.delta > 0 ? "+" : ""}${item.delta}</span>`
                    : ""}
                </strong>
              </div>
              ${progressBar(item.fit, { tone: item.delta >= 0 ? "brand" : "warning", className: "bar--sm" })}
            </a>`,
          )}
        </div>
      </section>

      <section class="panel" style="margin-top:12px">
        <div class="panel__head">
          <div>
            <h2 class="panel__title">SDG footprint</h2>
            <p class="panel__hint">Where this work creates public value.</p>
          </div>
          <a class="btn btn--ghost btn--sm" href="#/sdg">All 17 ${icon("arrowRight", 13)}</a>
        </div>
        ${sdgPreview(sdgMap)}
      </section>
    </div>
  </div>

  <section class="panel" style="margin-top:18px">
    <div class="panel__head">
      <div>
        <h2 class="panel__title">Signals behind your top match</h2>
        <p class="panel__hint">Evidence that moved ${top.title} up the ranking.</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="#/signals?roleId=${top.roleId}">Filter signals ${icon("arrowRight", 14)}</a>
    </div>
    <div class="grid grid--3">
      ${signalList.length
        ? signalList.map(
            (signal) => html`<a class="signal-mini" href="#/signals?highlight=${signal.id}">
              <span class="signal-mini__title">${signal.title}</span>
              <span class="signal-mini__meta">
                ${momentumBadge(signal.momentum)}<span>${signal.publisher}</span><span>·</span><span>${fmt.date(signal.publishedAt)}</span>
              </span>
            </a>`,
          )
        : html`<p class="small muted">No signals are linked to this role yet.</p>`}
    </div>
  </section>`;
}

async function generateBriefing(root) {
  const state = store.getState();
  const panel = root.querySelector('[data-role="analysis-panel"]');
  const textEl = root.querySelector('[data-role="analysis-text"]');
  if (!panel || !textEl) return;
  const buttons = Array.from(panel.querySelectorAll("button"));
  buttons.forEach((button) => {
    button.disabled = true;
  });
  textEl.classList.remove("small", "muted");
  textEl.classList.add("analysis-text");
  textEl.textContent = "";
  const cursor = document.createElement("span");
  cursor.className = "analysis-cursor";
  textEl.appendChild(cursor);

  try {
    const result = await api.analysis(
      {
        profile: state.profile,
        scenarioId: state.scenarioId,
        context: {
          catalog: state.catalog,
          matches: store.getState().matches,
          pathway: store.getState().pathway,
          sdgMap: store.getState().sdgMap,
        },
      },
      (event) => {
        if (event.type === "token") {
          const marker = textEl.querySelector(".analysis-cursor");
          if (marker) marker.insertAdjacentText("beforebegin", event.text);
          else textEl.append(event.text);
        }
        if (event.type === "meta" && event.meta && event.meta.model) {
          const model = panel.querySelector(".analysis-panel__model");
          if (model) model.textContent = "Streaming · " + event.meta.model;
        }
      },
    );
    textEl.textContent = result.narrative;
    const model = panel.querySelector(".analysis-panel__model");
    if (model) model.textContent = (result.model || "model") + " · " + fmt.dateTime(result.generatedAt);
    const actions = panel.querySelector(".analysis-actions");
    if (actions) {
      actions.innerHTML = html`<button class="btn btn--secondary btn--sm" type="button" data-action="generate-briefing">${icon("refresh", 14)} Regenerate</button>
        <button class="btn btn--ghost btn--sm" type="button" data-copy="${result.narrative}">${icon("copy", 14)} Copy</button>`.value;
    }
    toast("Briefing ready. Ask a mentor to challenge it.", { tone: "success", title: "AI briefing" });
  } catch (error) {
    textEl.textContent = "The briefing could not be generated: " + (error.message || "unknown error");
    toast(error.message || "Briefing failed.", { tone: "danger", title: "Generation failed" });
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

export const overviewView = {
  id: "overview",
  title: "Overview",
  icon: "compass",
  loadingMessage: "Loading your workspace…",

  async render({ state }) {
    if (!state.profile) {
      const signals = await loadSignals(3);
      return landing(signals);
    }
    let matches = store.getState().matches;
    if (!matches || matches.scenarioId !== state.scenarioId) {
      matches = await api.match(state.profile, state.scenarioId);
    }
    let sdgMap = store.getState().sdgMap;
    if (!sdgMap || sdgMap.scenarioId !== state.scenarioId) {
      try {
        sdgMap = await api.sdgMap(state.profile, state.scenarioId);
      } catch {
        sdgMap = null;
      }
    }
    const signals = await loadSignals(4);
    return dashboard(store.getState(), matches, signals, sdgMap);
  },

  mount(root) {
    root.addEventListener("click", (event) => {
      const target =
        event.target instanceof Element ? event.target.closest('[data-action="generate-briefing"]') : null;
      if (!target) return;
      event.preventDefault();
      generateBriefing(root);
    });
  },
};