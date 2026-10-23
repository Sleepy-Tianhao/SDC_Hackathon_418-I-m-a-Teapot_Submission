/** Skills profile intake: a four-step wizard that produces the matching input. */

import { api } from "../core/api.js";
import { fmt, html, icon, setHtml } from "../core/dom.js";
import * as demo from "../core/mock.js";
import { currentRoute, navigate, refreshRoute } from "../core/router.js";
import { BUDGET_OPTIONS, EDUCATION, HOURS_OPTIONS, INTERESTS, SECTORS, SKILL_LEVELS, WORK_PREFERENCES } from "../core/options.js";
import * as store from "../core/store.js";
import { toast } from "../core/ui.js";

const STEPS = [
  { short: "About you", label: "Context & intent", hint: "Who you are, where you work, where you want to go." },
  { short: "Skills", label: "Skills assessment", hint: "Rate 23 capabilities across five families." },
  { short: "Preferences", label: "Interests & constraints", hint: "Time, budget and the problems you want to work on." },
  { short: "Review", label: "Review & analyse", hint: "Save the profile and run the first match." },
];

let draft = null;

function blankDraft() {
  return {
    step: 1,
    name: "",
    headline: "",
    currentRole: "",
    sector: "Public sector",
    region: "Singapore",
    yearsExperience: 5,
    education: "Diploma / vocational",
    goal: "",
    levels: {},
    interests: [],
    hoursPerWeek: 8,
    budget: 300,
    remoteOnly: false,
    skillQuery: "",
    error: "",
    baseId: null,
    dirty: false,
  };
}

function fromProfile(profile) {
  const next = blankDraft();
  next.name = profile.name || "";
  next.headline = profile.headline || "";
  next.currentRole = profile.currentRole || "";
  next.sector = profile.sector || next.sector;
  next.region = profile.region || next.region;
  next.yearsExperience = profile.yearsExperience || 0;
  next.education = profile.education || next.education;
  next.goal = profile.goal || "";
  (profile.skills || []).forEach((skill) => {
    next.levels[skill.skillId] = Number(skill.level) || 0;
  });
  next.interests = [...(profile.interests || [])];
  next.hoursPerWeek = profile.constraints?.hoursPerWeek || 8;
  next.budget = profile.constraints?.budget ?? 300;
  next.remoteOnly = Boolean(profile.constraints?.remoteOnly);
  next.baseId = profile.id || null;
  return next;
}

function fromSample() {
  const next = fromProfile(demo.SAMPLE_PROFILE);
  next.baseId = null;
  return next;
}

function ensureDraft(state) {
  if (!draft) {
    draft = state.profile ? fromProfile(state.profile) : blankDraft();
  }
  return draft;
}

function ratedSkills(catalog) {
  return Object.entries(draft.levels)
    .filter(([, level]) => Number(level) > 0)
    .map(([skillId, level]) => {
      const meta = (catalog.skills || []).find((skill) => skill.id === skillId) || {};
      return { skillId, name: meta.name || skillId, category: meta.category || "Other", level: Number(level) };
    });
}

function validate(step) {
  if (step === 1) {
    if (!draft.name.trim()) return "Add your name so the pathway can be addressed to you.";
    if (!draft.currentRole.trim()) return "Add your current role — even an informal one helps the matching.";
  }
  if (step === 2 && ratedSkills(store.getState().catalog).length < 3) {
    return "Rate at least three skills so the match is meaningful.";
  }
  if (step === 3 && draft.interests.length === 0) {
    return "Pick at least one interest area so role families can be prioritised.";
  }
  return "";
}

function skillGroups(catalog, query) {
  const q = query.trim().toLowerCase();
  const groups = new Map();
  (catalog.skills || []).forEach((skill) => {
    if (q && !(skill.name + " " + skill.blurb + " " + skill.category).toLowerCase().includes(q)) return;
    if (!groups.has(skill.category)) groups.set(skill.category, []);
    groups.get(skill.category).push(skill);
  });
  return [...groups.entries()];
}

function skillRows(skills) {
  return skills
    .map((skill) => {
      const level = Number(draft.levels[skill.id]) || 0;
      return html`<div class="skill-row" data-skill-row="${skill.id}">
        <div class="skill-row__name">
          <strong>${skill.name}</strong>
          <span>${skill.blurb}</span>
        </div>
        <div class="level-picker" role="group" aria-label="${skill.name} level">
          ${SKILL_LEVELS.map(
            (option) => html`<button type="button" class="${level === option.value ? "is-active" : ""}"
              data-action="set-skill" data-skill="${skill.id}" data-level="${option.value}"
              title="${option.value} — ${option.label}: ${option.hint}">${option.value}</button>`,
          )}
        </div>
      </div>`;
    });
}

function stepPanel(state) {
  const catalog = state.catalog;
  const panel = html`<div class="wizard-panel">
    <div class="wizard-progress">
      ${STEPS.map((_, index) => html`<span class="${index + 1 <= draft.step ? "is-done" : ""}"></span>`)}
    </div>
    <div class="wizard-panel__head">
      <p class="eyebrow">Step ${draft.step} of 4</p>
      <h2 class="wizard-panel__title">${STEPS[draft.step - 1].label}</h2>
      <p class="wizard-panel__desc">${STEPS[draft.step - 1].hint}</p>
    </div>
    ${draft.error ? html`<div class="notice notice--warning" style="margin-bottom:16px">${icon("alert", 16)}<span>${draft.error}</span></div>` : ""}
    ${draft.step === 1 ? stepOne() : ""}
    ${draft.step === 2 ? stepTwo(catalog) : ""}
    ${draft.step === 3 ? stepThree() : ""}
    ${draft.step === 4 ? stepFour(catalog) : ""}
    <div class="wizard-actions">
      <div class="row" style="--gap:7px">
        ${draft.step > 1
          ? html`<button class="btn btn--secondary" type="button" data-action="prev-step">${icon("chevronLeft", 15)} Back</button>`
          : html`<button class="btn btn--ghost" type="button" data-action="load-sample-draft">${icon("sparkles", 15)} Use sample data</button>`}
      </div>
      <div class="wizard-actions__right">
        ${draft.step < 4
          ? html`<button class="btn btn--primary" type="button" data-action="next-step">Continue ${icon("arrowRight", 15)}</button>`
          : html`<button class="btn btn--primary btn--lg" type="button" data-action="save-profile">
              ${icon("target", 16)} Save &amp; analyse my profile
            </button>`}
      </div>
    </div>
  </div>`;

  return html`<div class="wizard">
    <aside class="wizard-steps" aria-label="Profile steps">
      ${STEPS.map(
        (step, index) => html`<div class="wizard-step ${draft.step === index + 1 ? "is-active" : ""} ${draft.step > index + 1 ? "is-done" : ""}">
          <span class="wizard-step__index">${draft.step > index + 1 ? icon("check", 11) : index + 1}</span>
          <span class="wizard-step__text">
            <span>${step.short}</span>
            <small>${step.hint.split(".")[0]}</small>
          </span>
        </div>`,
      )}
    </aside>
    ${panel}
  </div>`;
}

function stepOne() {
  return html`<div class="form-grid">
    <div class="field">
      <label class="field__label" for="intake-name">Name</label>
      <input class="input" id="intake-name" data-field="name" value="${draft.name}" autocomplete="name" placeholder="e.g. Aisha Rahman" />
    </div>
    <div class="field">
      <label class="field__label" for="intake-role">Current role</label>
      <input class="input" id="intake-role" data-field="currentRole" value="${draft.currentRole}" placeholder="e.g. Operations Coordinator" />
    </div>
    <div class="field">
      <label class="field__label" for="intake-sector">Sector</label>
      <select class="select" id="intake-sector" data-field="sector">
        ${SECTORS.map((sector) => html`<option value="${sector}" ${draft.sector === sector ? "selected" : ""}>${sector}</option>`)}
      </select>
    </div>
    <div class="field">
      <label class="field__label" for="intake-region">Region</label>
      <select class="select" id="intake-region" data-field="region">
        ${["Global", "Southeast Asia", "Singapore", "Malaysia", "APAC", "EU", "United Kingdom", "North America"].map(
          (region) => html`<option value="${region}" ${draft.region === region ? "selected" : ""}>${region}</option>`,
        )}
      </select>
    </div>
    <div class="field">
      <label class="field__label" for="intake-years">Years of experience</label>
      <input class="input" id="intake-years" type="number" min="0" max="50" data-field="yearsExperience" value="${draft.yearsExperience}" />
    </div>
    <div class="field">
      <label class="field__label" for="intake-education">Highest qualification</label>
      <select class="select" id="intake-education" data-field="education">
        ${EDUCATION.map((item) => html`<option value="${item}" ${draft.education === item ? "selected" : ""}>${item}</option>`)}
      </select>
    </div>
    <div class="field span-2">
      <label class="field__label" for="intake-goal">What are you trying to change?</label>
      <textarea class="textarea" id="intake-goal" data-field="goal" placeholder="e.g. Move into an AI-facing role without leaving public service">${draft.goal}</textarea>
      <p class="field__hint">Optional, but it shapes how the pathway is sequenced.</p>
    </div>
  </div>`;
}

function stepTwo(catalog) {
  const rated = Object.values(draft.levels).filter((level) => Number(level) > 0).length;
  const groups = skillGroups(catalog, draft.skillQuery);
  return html`<div class="row row--between row--wrap" style="margin-bottom:12px">
    <div class="search-field" style="max-width:340px">
      ${icon("search", 16)}
      <input class="input" type="search" data-field="skillQuery" value="${draft.skillQuery}" placeholder="Search skills" aria-label="Search skills" />
    </div>
    <div class="row" style="--gap:14px">
      <span class="tiny faint"><strong class="strong">${rated}</strong> of ${(catalog.skills || []).length} rated</span>
      <button class="btn btn--ghost btn--sm" type="button" data-action="clear-skills">Clear all</button>
    </div>
  </div>
  <div class="notice" style="margin-bottom:14px">
    ${icon("info", 16)}
    <span>Rate honestly: 1 is awareness, 3 is independent work, 5 is expert. Over-claiming hides the gaps your pathway should close.</span>
  </div>
  ${groups.length
    ? groups.map(
        ([category, skills]) => html`<section class="skill-group" data-skill-group>
          <h3 class="skill-group__title">${category}<span class="skill-group__count">${skills.length} skills</span></h3>
          ${skillRows(skills)}
        </section>`,
      )
    : html`<p class="small muted">No skills match that search.</p>`}
  <p class="tiny faint" style="margin-top:14px">Click an active level again to clear it. Unrated skills are treated as no exposure.</p>`;
}

function stepThree() {
  return html`<div class="stack" style="--gap:20px">
    <div>
      <p class="field__label" style="margin-bottom:8px">Interests — where do you want your work to land?</p>
      <div class="chip-group">
        ${INTERESTS.map(
          (interest) => html`<button type="button" class="chip-select ${draft.interests.includes(interest.id) ? "is-active" : ""}"
            data-action="toggle-interest" data-interest="${interest.id}">
            ${draft.interests.includes(interest.id) ? icon("check", 13) : icon("plus", 13)} ${interest.label}
          </button>`,
        )}
      </div>
      <p class="field__hint" style="margin-top:7px">Choose up to four. These lift role families in the match, they do not hide gaps.</p>
    </div>

    <div class="form-grid">
      <div class="field">
        <span class="field__label">Study hours per week</span>
        <div class="segmented" role="group" aria-label="Study hours per week">
          ${HOURS_OPTIONS.map(
            (hours) => html`<button type="button" class="segmented__item ${draft.hoursPerWeek === hours ? "is-active" : ""}"
              data-action="set-hours" data-hours="${hours}">${hours}h</button>`,
          )}
        </div>
        <p class="field__hint">The pathway duration is recalculated from this number.</p>
      </div>
      <div class="field">
        <label class="field__label" for="intake-budget">Learning budget</label>
        <select class="select" id="intake-budget" data-field="budget">
          ${BUDGET_OPTIONS.map(
            (option) => html`<option value="${option.value}" ${Number(draft.budget) === option.value ? "selected" : ""}>${option.label}</option>`,
          )}
        </select>
      </div>
    </div>

    <div>
      <p class="field__label" style="margin-bottom:8px">Work preferences</p>
      <div class="chip-group">
        ${WORK_PREFERENCES.map(
          (preference) => html`<label class="checkbox">
            <input type="checkbox" data-preference="${preference.id}" ${draft.remoteOnly && preference.id === "remote" ? "checked" : ""} />
            <span>${preference.label}</span>
          </label>`,
        )}
      </div>
      <p class="field__hint" style="margin-top:7px">Only “remote-friendly” currently filters the pathway; the others annotate your profile.</p>
    </div>

    <div class="notice">
      ${icon("shield", 16)}
      <span><strong>Data note.</strong> In the prototype the profile is stored in this browser (demo mode) or in the backend SQLite database (live mode). Nothing is sent to a third-party model without the narrative step.</span>
    </div>
  </div>`;
}

function stepFour(catalog) {
  const skills = ratedSkills(catalog);
  const top = [...skills].sort((a, b) => b.level - a.level).slice(0, 6);
  const interests = draft.interests
    .map((id) => (INTERESTS.find((item) => item.id === id) || {}).label)
    .filter(Boolean);

  return html`<div class="stack" style="--gap:14px">
    <div class="form-grid">
      <div class="review-block">
        <p class="review-block__label">About you <button class="btn btn--ghost btn--sm" type="button" data-action="goto-step" data-step="1">Edit</button></p>
        <p class="review-block__value">${draft.name || "No name yet"}</p>
        <p class="small muted">${draft.currentRole || "No role"} · ${draft.sector} · ${draft.region}</p>
        <p class="small muted">${draft.yearsExperience} years experience · ${draft.education}</p>
        ${draft.goal ? html`<p class="small" style="margin-top:8px;color:var(--ink-2)">“${draft.goal}”</p>` : ""}
      </div>
      <div class="review-block">
        <p class="review-block__label">Preferences <button class="btn btn--ghost btn--sm" type="button" data-action="goto-step" data-step="3">Edit</button></p>
        <p class="review-block__value">${draft.hoursPerWeek} hours/week · ${fmt.money(draft.budget)} budget</p>
        <p class="small muted">Interests: ${interests.length ? interests.join(", ") : "none selected"}</p>
        <p class="small muted">Remote-friendly: ${draft.remoteOnly ? "yes" : "no preference"}</p>
      </div>
    </div>

    <div class="review-block">
      <p class="review-block__label">
        Skills profile <button class="btn btn--ghost btn--sm" type="button" data-action="goto-step" data-step="2">Edit</button>
      </p>
      <div class="row row--between row--wrap">
        <p class="review-block__value">${skills.length} skills rated</p>
        <span class="tiny faint">Average level ${skills.length ? (skills.reduce((sum, skill) => sum + skill.level, 0) / skills.length).toFixed(1) : "0"}/5</span>
      </div>
      <div class="review-block__list">
        ${top.map((skill) => html`<span class="tag">${skill.name} · ${skill.level}/5</span>`)}
        ${skills.length > top.length ? html`<span class="tag tag--muted">+${skills.length - top.length} more</span>` : ""}
      </div>
    </div>

    <div class="notice">
      ${icon("sparkles", 16)}
      <span>
        Saving runs the matcher across ${(catalog.roles || []).length} future roles under
        <strong>${(catalog.scenarios.find((scenario) => scenario.id === store.getState().scenarioId) || {}).name || "the selected scenario"}</strong>.
        You can change the scenario afterwards without retyping anything.
      </span>
    </div>
  </div>`;
}

function renderPage(state) {
  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("user", 14)} Step 01 · Skills profile intake</p>
      <div class="page-head__row">
        <h1 class="page-title">Build a profile that survives scrutiny</h1>
        <div class="page-head__actions">
          ${state.profile ? html`<button class="btn btn--ghost btn--sm" type="button" data-action="reset-workspace">${icon("trash", 15)} Reset workspace</button>` : ""}
          <button class="btn btn--secondary btn--sm" type="button" data-action="load-sample-draft">${icon("sparkles", 15)} Fill with sample</button>
        </div>
      </div>
      <p class="page-lead">
        Role titles hide capability. This intake captures what you can actually do, how much time you have and which
        problems you want to work on — the three inputs the matcher needs to be honest.
      </p>
      <div class="page-meta">
        <span>${icon("clock", 13)} About 5 minutes</span>
        <span>${icon("shield", 13)} Stored locally in demo mode</span>
        <span>${icon("target", 13)} Feeds matching, pathway and SDG mapping</span>
      </div>
    </div>
    ${stepPanel(state)}`;
}

function rerender(root) {
  setHtml(root, renderPage(store.getState()));
}

function fillSample(root) {
  draft = fromSample();
  draft.dirty = true;
  rerender(root);
  toast("Sample profile loaded into the form. Review it, then save.", { tone: "brand" });
}

async function save(root) {
  const state = store.getState();
  const error = validate(1) || validate(2) || validate(3);
  if (error) {
    draft.error = error;
    draft.step = validate(1) ? 1 : validate(2) ? 2 : 3;
    rerender(root);
    toast(error, { tone: "warning", title: "Check the form" });
    return;
  }

  const buttons = Array.from(root.querySelectorAll('[data-action="save-profile"]'));
  buttons.forEach((button) => {
    button.disabled = true;
  });
  const payload = {
    name: draft.name.trim(),
    headline: draft.headline || draft.goal,
    currentRole: draft.currentRole.trim(),
    sector: draft.sector,
    region: draft.region,
    yearsExperience: Number(draft.yearsExperience) || 0,
    education: draft.education,
    goal: draft.goal.trim(),
    interests: draft.interests,
    constraints: { hoursPerWeek: Number(draft.hoursPerWeek), budget: Number(draft.budget), remoteOnly: draft.remoteOnly },
    skills: ratedSkills(state.catalog).map((skill) => ({ skillId: skill.skillId, level: skill.level })),
    source: "web",
  };

  try {
    const profile = await api.saveProfile(payload, state.profile && state.profile.id ? state.profile : null);
    store.recordJourney("profileSaved");
    store.setState({ profile, matches: null, pathway: null, sdgMap: null, analysis: null });
    toast("Profile saved. Scoring " + (state.catalog.roles || []).length + " future roles…", {
      tone: "success",
      title: "Profile ready",
    });
    navigate("/matches");
  } catch (error) {
    toast(error.message || "Could not save the profile.", { tone: "danger", title: "Save failed" });
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

function bind(root) {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;
    const action = target.getAttribute("data-action");

    if (action === "next-step") {
      const error = validate(draft.step);
      if (error) {
        draft.error = error;
        rerender(root);
        return;
      }
      draft.error = "";
      draft.step = Math.min(4, draft.step + 1);
      rerender(root);
    } else if (action === "prev-step") {
      draft.error = "";
      draft.step = Math.max(1, draft.step - 1);
      rerender(root);
    } else if (action === "goto-step") {
      draft.error = "";
      draft.step = Number(target.getAttribute("data-step")) || 1;
      rerender(root);
    } else if (action === "set-skill") {
      const skillId = target.getAttribute("data-skill");
      const level = Number(target.getAttribute("data-level"));
      draft.levels[skillId] = Number(draft.levels[skillId]) === level ? 0 : level;
      draft.dirty = true;
      rerender(root);
      const query = draft.skillQuery;
      if (query) filterRows(root, query);
    } else if (action === "toggle-interest") {
      const interest = target.getAttribute("data-interest");
      if (draft.interests.includes(interest)) draft.interests = draft.interests.filter((item) => item !== interest);
      else if (draft.interests.length < 4) draft.interests = [...draft.interests, interest];
      else {
        toast("Choose up to four interests.", { tone: "info", duration: 2200 });
        return;
      }
      draft.dirty = true;
      rerender(root);
    } else if (action === "set-hours") {
      draft.hoursPerWeek = Number(target.getAttribute("data-hours")) || 8;
      draft.dirty = true;
      rerender(root);
    } else if (action === "clear-skills") {
      draft.levels = {};
      draft.dirty = true;
      rerender(root);
    } else if (action === "load-sample-draft") {
      fillSample(root);
    } else if (action === "save-profile") {
      save(root);
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    const field = target.getAttribute("data-field");
    if (!field) return;
    if (field === "skillQuery") {
      draft.skillQuery = target.value;
      filterRows(root, target.value);
      return;
    }
    if (field === "yearsExperience" || field === "budget") draft[field] = Number(target.value) || 0;
    else draft[field] = target.value;
    draft.dirty = true;
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const field = target.getAttribute("data-field");
    if (field === "sector" || field === "region" || field === "education") {
      draft[field] = target.value;
      draft.dirty = true;
    }
    if (field === "budget") {
      draft.budget = Number(target.value) || 0;
      draft.dirty = true;
    }
    const preference = target.getAttribute("data-preference");
    if (preference === "remote") {
      draft.remoteOnly = target.checked;
      draft.dirty = true;
    }
  });

  window.addEventListener("aicn:workspace-changed", () => {
    draft = null;
    if (currentRoute().path === "/intake") refreshRoute();
  });
}

function filterRows(root, query) {
  const q = String(query || "").trim().toLowerCase();
  const rows = Array.from(root.querySelectorAll("[data-skill-row]"));
  rows.forEach((row) => {
    row.classList.toggle("hidden", q ? !row.textContent.toLowerCase().includes(q) : false);
  });
  Array.from(root.querySelectorAll("[data-skill-group]")).forEach((group) => {
    const visible = Array.from(group.querySelectorAll("[data-skill-row]")).some((row) => !row.classList.contains("hidden"));
    group.classList.toggle("hidden", !visible);
  });
}

export const intakeView = {
  id: "intake",
  title: "Skills profile",
  icon: "user",
  loadingMessage: "Preparing the intake form…",

  async render({ state, route }) {
    if (route && route.query && route.query.step) {
      ensureDraft(state);
      const requested = Math.min(4, Math.max(1, Number(route.query.step) || 1));
      if (draft.deepLinkStep !== route.query.step) {
        draft.step = requested;
        draft.deepLinkStep = route.query.step;
      }
    }
    if (state.profile) {
      ensureDraft(state);
      if (draft.baseId !== state.profile.id && !draft.dirty) {
        draft = fromProfile(state.profile);
      }
    } else {
      ensureDraft(state);
    }
    return renderPage(state);
  },

  mount(root) {
    if (!root.dataset.intakeBound) {
      root.dataset.intakeBound = "1";
      bind(root);
    }
  },
};