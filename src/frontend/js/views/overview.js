/** Overview: the landing page and the personal readiness dashboard. */

import { api } from "../core/api.js";
import { radarChart } from "../core/charts.js";
import { fmt, html, icon } from "../core/dom.js";
import * as store from "../core/store.js";
import { momentumBadge, progressBar, statCard, toast } from "../core/ui.js";

async function loadSignals(limit) {
  try {
    return await api.listSignals({ limit, sort: "recent" });
  } catch {
    return { items: [], total: 0, lastRefreshedAt: null };
  }
}

function animateLifeTree(root) {
  const stage = root.querySelector("[data-tree-stage]");
  const canvas = stage?.querySelector(".life-tree__art");
  const context = canvas?.getContext("2d", { alpha: true });
  if (!stage || !canvas || !context) return;

  const images = {
    colorful: new Image(),
    harvest: new Image(),
    botanical: new Image(),
  };
  images.colorful.src = new URL("../../assets/tree-colorful.png", import.meta.url).href;
  images.harvest.src = new URL("../../assets/tree-harvest.jpg", import.meta.url).href;
  images.botanical.src = new URL("../../assets/tree-botanical-preview.png", import.meta.url).href;

  const startedAt = performance.now();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function frame(now) {
    if (!canvas.isConnected) return;
    const { width, height } = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const image = images[stage.dataset.treeStyle] || images.colorful;
    if (image.complete && image.naturalWidth) {
      const elapsed = now - startedAt;
      const growth = reduceMotion || stage.dataset.treeStyle === "botanical" ? 1 : clamp((elapsed - 150) / 2800, 0, 1);
      const phase = now * 0.00062;
      const imageHeight = height * 1.1;
      const imageWidth = imageHeight * (image.naturalWidth / image.naturalHeight);
      const imageY = (height - imageHeight) / 2;
      const bandHeight = 8;
      const animateArtwork = stage.dataset.treeStyle === "colorful" && !reduceMotion;

      context.save();
      context.beginPath();
      context.rect(0, height * (1 - growth), width, height * growth);
      context.clip();
      context.globalAlpha = growth;

      for (let sourceY = 0; sourceY < image.naturalHeight; sourceY += bandHeight) {
        const sourceHeight = Math.min(bandHeight + 1, image.naturalHeight - sourceY);
        const y = sourceY / image.naturalHeight;
        const crownWeight = clamp((0.72 - y) / 0.42, 0, 1);
        const rootWeight = clamp((y - 0.72) / 0.28, 0, 1);
        const branchWave = animateArtwork ? Math.sin(phase + y * 3.4) : 0;
        const rootWave = animateArtwork ? Math.sin(phase * 0.82 + y * 2.1) : 0;
        const spread = 1 + crownWeight * branchWave * 0.022 + rootWeight * (animateArtwork ? 0.022 + rootWave * 0.018 : 0);
        const drift = crownWeight * branchWave * 9 + rootWeight * rootWave * 4;
        const destinationY = imageY + y * imageHeight;
        const destinationHeight = (sourceHeight / image.naturalHeight) * imageHeight + 1;
        const destinationWidth = imageWidth * spread;
        const destinationX = (width - destinationWidth) / 2 + drift;
        context.drawImage(
          image,
          0, sourceY, image.naturalWidth, sourceHeight,
          destinationX, destinationY, destinationWidth, destinationHeight,
        );
      }
      context.restore();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function lifeTreeOverview({ name = "there", signalTotal = 0, hasProfile = false, topRole = null } = {}) {
  const modules = [
    { title: "Profile", detail: "Your starting point", href: "#/intake", state: hasProfile ? "done" : "active" },
    { title: "Skill trends", detail: "Signals and evidence", href: "#/signals", state: hasProfile ? "active" : "locked" },
    { title: "Career matches", detail: "Fit and skill gaps", href: "#/matches", state: "locked" },
    { title: "Future scenarios", detail: "Compare possible outcomes", href: "#/scenarios", state: "locked" },
    { title: "Pathway", detail: "Learning modules and SDGs", href: "#/pathway", state: "locked" },
  ];
  const completed = hasProfile ? 1 : 0;

  return html`<section class="life-tree" aria-labelledby="life-tree-title">
    <div class="life-tree__head">
      <div>
        <p class="life-tree__eyebrow">Hey ${name}, take a moment to get to know yourself.</p>
        <h1 id="life-tree-title">Explore yourself. Grow toward what’s next.</h1>
        <p class="life-tree__lead">Start with your interests, strengths and values to find a direction that feels like yours.</p>
      </div>
      <a class="life-tree__journal" href="#/pathway">${icon("calendar", 16)} Growth journal</a>
    </div>

    <div class="life-tree__progress" aria-label="Self-discovery progress">
      <div class="life-tree__count"><strong>${completed}</strong><span>/ 5 steps complete</span></div>
      <div class="life-tree__progress-main"><div class="life-tree__progress-label"><span>Your journey through the tree</span><span>${Math.round((completed / modules.length) * 100)}%</span></div>
        <div class="life-tree__segments">${modules.map((_, index) => html`<i class="${index < completed ? "is-filled" : ""}"></i>`)}</div>
      </div>
    </div>

    <div class="life-tree__switch" role="group" aria-label="Tree artwork options">
      <button type="button" data-tree-variant="colorful" aria-pressed="false">Option 1 · Colorful canopy</button>
      <button type="button" data-tree-variant="harvest" aria-pressed="false">Option 2 · Harvest tree</button>
      <button type="button" class="is-selected" data-tree-variant="botanical" aria-pressed="true">Option 3 · Botanical tree</button>
    </div>

    <div class="life-tree__stage" data-tree-style="botanical" data-tree-stage>
      <canvas class="life-tree__art" role="img" aria-label="Botanical tree of life illustration"></canvas>
      ${modules.map((module, index) => html`<a class="life-tree__module life-tree__module--step-${index + 1} is-${module.state}" href="${module.href}" aria-label="Step ${index + 1}: ${module.title}. ${module.detail}. ${module.state === "done" ? "Complete" : module.state === "active" ? "In progress" : "Locked"}">
        <span class="life-tree__module-step">0${index + 1}</span>
        <span><strong>${module.title}</strong><small>${module.detail}</small></span>
      </a>`) }
    </div>
    <p class="life-tree__caption">Start at the roots and follow upward: Profile → Skill trends → Career matches → Future scenarios → Pathway</p>
    <div class="life-tree__legend"><span>Complete</span><span>In progress</span><span>Locked</span></div>

    <div class="life-tree__focus">
      <div class="life-tree__focus-copy">
        <span class="life-tree__focus-kicker">${hasProfile ? "Growing now · Step 2 of 5" : "Start here · Step 1 of 5"}</span>
        <h2>${hasProfile ? "Skill trends" : "Build your profile"}</h2>
        <p>${hasProfile ? "See which skills are gaining demand, and open the evidence behind each trend." : "Set your baseline so each trend, career match and learning step can connect back to you."}</p>
      </div>
      <div class="life-tree__focus-meta">${completed}<small> / 5 steps</small></div>
      <a class="btn btn--primary life-tree__continue" href="${hasProfile ? "#/signals" : "#/intake"}"><span>${hasProfile ? "Explore skill trends" : "Build your profile"}<small>${hasProfile ? "Step 2 · Signals and evidence" : "Step 1 · Your starting point"}</small></span>${icon("arrowRight", 18)}</a>
    </div>

    <div class="life-tree__below">
      <div class="life-tree__note">${icon("activity", 14)} ${hasProfile ? "Your profile is ready. Keep exploring your values and career directions." : "Build your skills profile to start lighting up your interests and strengths."}</div>
      ${topRole ? html`<a class="life-tree__role" href="#/matches"><span><small>Current career match</small><strong>${topRole.title}</strong></span><b>${topRole.fitScore}<small> / 100</small></b></a>` : html`<button class="life-tree__sample" type="button" data-action="use-sample">${icon("play", 14)} Preview the complete tree with a sample profile</button>`}
      <a class="life-tree__signals" href="#/signals">${icon("activity", 14)} ${signalTotal} sourced career signals <span>Explore signals ${icon("arrowRight", 13)}</span></a>
    </div>
  </section>`;
}

function landing(signalData) {
  const total = signalData.total || (signalData.items || []).length;
  return lifeTreeOverview({ signalTotal: total });
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
  const sensitivity = scenarioSensitivity(top, catalog);
  const radar = categoryRadar(profile, catalog);
  const related = (signals.items || []).filter((signal) =>
    (signal.affectedRoles || []).some((role) => role.roleId === top.roleId),
  );
  const signalList = (related.length ? related : signals.items || []).slice(0, 3);

  return html`${lifeTreeOverview({ name: profile.name.split(" ")[0], signalTotal: signals.total || (signals.items || []).length, hasProfile: true, topRole: top })}
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
    animateLifeTree(root);
    root.addEventListener("click", (event) => {
      const element = event.target instanceof Element ? event.target : null;
      const variant = element?.closest("[data-tree-variant]");
      if (variant) {
        const stage = root.querySelector("[data-tree-stage]");
        if (stage) stage.dataset.treeStyle = variant.dataset.treeVariant;
        root.querySelectorAll("[data-tree-variant]").forEach((button) => {
          const selected = button === variant;
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-pressed", String(selected));
        });
        return;
      }

      const target = element?.closest('[data-action="generate-briefing"]');
      if (target) {
        event.preventDefault();
        generateBriefing(root);
      }
    });
  },
};
