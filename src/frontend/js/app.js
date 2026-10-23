/* AI Career Navigator — Argon Edition application layer.
   The visual system is the vendored Argon theme (argon_css_merged.css + style.css).
   This file contains product data flow and the small app layout classes only. */

var API = "/api/v1";
var STORAGE_PROFILE = "aicn:argon:profile";
var STORAGE_THEME = "aicn:argon:theme";

var INTERESTS = [
  ["ai", "AI & automation"],
  ["public", "Public services"],
  ["climate", "Climate & sustainability"],
  ["health", "Health & care"],
  ["design", "Design & research"],
  ["data", "Data & analysis"],
  ["security", "Security & risk"],
  ["people", "People & skills"],
  ["governance", "Governance & policy"]
];

var SAMPLE_SKILLS = {
  "data-literacy": 3, "stakeholder-comms": 4, "critical-evaluation": 3,
  "process-design": 3, "sql": 2, "automation": 3, "prompt-engineering": 2,
  "model-evaluation": 2, "ai-governance": 1, "project-management": 3,
  "change-facilitation": 2, "systems-thinking": 3
};

var state = {
  meta: null, catalog: null, signals: [], scenarios: [], scenarioId: null,
  profile: null, matches: null, pathway: null, sdg: null
};

function $(selector, root) { return (root || document).querySelector(selector); }
function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function money(value, currency) {
  var n = Number(value);
  if (!isFinite(n)) return "—";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(n); }
  catch (e) { return String(n); }
}
function number(value) { var n = Number(value); return isFinite(n) ? n.toLocaleString("en-US") : "—"; }

async function request(path, options) {
  options = options || {};
  var response = await fetch(API + path, {
    method: options.method || "GET",
    headers: { Accept: "application/json", "Content-Type": options.body ? "application/json" : "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin"
  });
  var text = await response.text();
  var data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!response.ok) {
    throw new Error((data && data.error && data.error.message) || ("HTTP " + response.status));
  }
  return data;
}

function notice(message, tone) {
  var el = $("#notice"); if (!el) return;
  el.className = "alert alert-" + (tone || "warning") + " app-notice";
  el.textContent = message;
}
function hideNotice() { var el = $("#notice"); if (el) el.className = "alert alert-warning app-notice d-none"; }
function setStatus(label, tone) { var el = $("#apiStatus"); if (el) { el.className = "badge badge-" + (tone || "success"); el.textContent = label; } }
function setWorkflow(label, tone) { var el = $("#workflowState"); if (el) { el.className = "badge badge-" + (tone || "neutral"); el.textContent = label; } }
function loading(message) { return '<div class="col-12"><div class="app-loading">' + escapeHtml(message) + '</div></div>'; }
function ring(value) {
  var pct = Math.max(0, Math.min(100, Number(value) || 0));
  var c = 2 * Math.PI * 38;
  var offset = c - (pct / 100) * c;
  return '<span class="app-score-ring" aria-label="' + pct + ' out of 100"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="app-score-ring__track" cx="50" cy="50" r="38"></circle><circle class="app-score-ring__value" cx="50" cy="50" r="38" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"></circle></svg><strong>' + Math.round(pct) + '</strong></span>';
}

function renderSkillFields(catalog) {
  var root = $("#skillFields"); if (!root) return;
  root.innerHTML = (catalog.skills || []).map(function (skill) {
    return '<div class="app-skill" data-skill="' + escapeHtml(skill.id) + '"><label><input type="checkbox" data-skill-check="' + escapeHtml(skill.id) + '" /><span>' + escapeHtml(skill.name) + '</span></label><select data-skill-level="' + escapeHtml(skill.id) + '" aria-label="' + escapeHtml(skill.name) + ' level"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select></div>';
  }).join("");
}

function renderInterests() {
  var root = $("#interestFields"); if (!root) return;
  root.innerHTML = INTERESTS.map(function (item) {
    return '<label class="app-interest"><input type="checkbox" data-interest="' + item[0] + '" /><span>' + item[1] + '</span></label>';
  }).join("");
}

function applySample() {
  if (!state.catalog) return;
  var ids = {};
  (state.catalog.skills || []).forEach(function (skill) { ids[skill.id] = true; });
  Object.keys(SAMPLE_SKILLS).forEach(function (id) {
    if (!ids[id]) return;
    var check = document.querySelector('[data-skill-check="' + CSS.escape(id) + '"]');
    var level = document.querySelector('[data-skill-level="' + CSS.escape(id) + '"]');
    if (check) check.checked = true;
    if (level) level.value = String(SAMPLE_SKILLS[id]);
  });
  ["ai", "public", "people"].forEach(function (id) {
    var input = document.querySelector('[data-interest="' + id + '"]');
    if (input) input.checked = true;
  });
}

function collectProfile() {
  var skills = $$("[data-skill-check]").filter(function (input) { return input.checked; }).map(function (input) {
    var id = input.getAttribute("data-skill-check");
    var level = document.querySelector('[data-skill-level="' + CSS.escape(id) + '"]');
    return { skillId: id, level: Number((level && level.value) || 1) };
  });
  return {
    name: ($("#name") && $("#name").value.trim()) || "Anonymous learner",
    headline: ($("#headline") && $("#headline").value.trim()) || "",
    currentRole: ($("#currentRole") && $("#currentRole").value.trim()) || "",
    sector: ($("#sector") && $("#sector").value) || "Other",
    region: ($("#region") && $("#region").value) || "Global",
    yearsExperience: Number(($("#yearsExperience") && $("#yearsExperience").value) || 0),
    education: ($("#education") && $("#education").value) || "Other",
    skills: skills,
    interests: $$("[data-interest]:checked").map(function (input) { return input.getAttribute("data-interest"); }),
    constraints: {
      hoursPerWeek: Number(($("#hoursPerWeek") && $("#hoursPerWeek").value) || 8),
      budget: Number(($("#budget") && $("#budget").value) || 0),
      remoteOnly: false
    },
    goal: ($("#goal") && $("#goal").value.trim()) || "",
    source: "argon-web"
  };
}

async function saveProfile(event) {
  event.preventDefault();
  var payload = collectProfile();
  var button = $("#saveProfileBtn");
  if (button) button.disabled = true;
  try {
    var result;
    if (state.profile && state.profile.id) {
      result = await request("/profiles/" + encodeURIComponent(state.profile.id), { method: "PATCH", body: payload });
    } else {
      result = await request("/profiles", { method: "POST", body: payload });
    }
    state.profile = result.profile || result;
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(state.profile));
    hideNotice();
    setWorkflow("Profile saved", "success");
    await runPipeline();
  } catch (error) {
    notice("Could not save the profile: " + error.message, "danger");
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadSignals() {
  var root = $("#signalList"); if (!root) return;
  root.innerHTML = loading("Loading dated signals…");
  try {
    var data = await request("/signals?limit=6&sort=impact");
    state.signals = data.items || [];
    root.innerHTML = state.signals.map(function (signal) {
      return '<div class="col-md-6 col-lg-4 mb-4"><article class="app-signal h-100"><div class="card-body d-flex flex-column"><div class="d-flex justify-content-between"><span class="badge badge-primary">' + escapeHtml(signal.type || "signal") + '</span><span class="app-role-meta">' + escapeHtml(String(signal.publishedAt || "").slice(0, 10)) + '</span></div><h3>' + escapeHtml(signal.title) + '</h3><p>' + escapeHtml(signal.summary) + '</p><div class="mt-auto pt-3 d-flex justify-content-between"><small class="text-muted">' + escapeHtml(signal.publisher || "Source") + '</small><a class="small font-weight-bold" href="' + escapeHtml(signal.sourceUrl) + '" target="_blank" rel="noopener">Source ↗</a></div></div></article></div>';
    }).join("");
  } catch (error) {
    root.innerHTML = loading("Signals unavailable: " + error.message);
  }
}

function renderScenarios() {
  var root = $("#scenarioCards"); var select = $("#scenarioSelect");
  var scenarios = (state.catalog && state.catalog.scenarios) || [];
  state.scenarios = scenarios;
  if (select && scenarios.length) {
    select.innerHTML = scenarios.map(function (scenario) { return '<option value="' + escapeHtml(scenario.id) + '">' + escapeHtml(scenario.shortName || scenario.name) + '</option>'; }).join("");
    select.value = state.scenarioId || scenarios[0].id;
  }
  if (root) {
    root.innerHTML = scenarios.map(function (scenario) {
      return '<div class="col-md-4 mb-4"><article class="app-scenario ' + (scenario.id === state.scenarioId ? "is-active" : "") + '" data-scenario="' + escapeHtml(scenario.id) + '"><div class="card-body"><span class="badge badge-primary mb-2">' + escapeHtml(scenario.shortName || "Scenario") + '</span><h3>' + escapeHtml(scenario.name) + '</h3><p class="small text-muted">' + escapeHtml(scenario.summary || "") + '</p><div class="app-role-meta">Confidence ' + Math.round((scenario.confidence || 0) * 100) + '%</div></div></article></div>';
    }).join("");
  }
}

function renderOverview() {
  var root = $("#overviewCards"); if (!root) return;
  var top = state.matches && state.matches.matches && state.matches.matches[0];
  var sdgScore = state.sdg && state.sdg.goals && state.sdg.goals.length ? Math.round(state.sdg.goals.reduce(function (s, g) { return s + (Number(g.score) || 0); }, 0) / state.sdg.goals.length) : "—";
  var cards = [
    ["Readiness score", top ? Math.round(top.fitScore || 0) + "/100" : "—", top ? top.title : "Save a profile to calculate"],
    ["Top role", top ? top.title : "Not calculated", top ? "Best fit in this scenario" : "No matches yet"],
    ["Dated signals", number((state.meta && state.meta.counts && state.meta.counts.signals) || state.signals.length), "Source-linked evidence records"],
    ["SDG alignment", sdgScore === "—" ? "—" : sdgScore + "/100", state.sdg ? "Average across 17 goals" : "Awaiting profile"]
  ];
  root.innerHTML = cards.map(function (card) {
    return '<div class="col-sm-6 col-xl-3 mb-4"><div class="app-stat"><div class="card-body"><div class="app-stat__label">' + escapeHtml(card[0]) + '</div><div class="app-stat__value">' + escapeHtml(card[1]) + '</div><p class="app-stat__hint">' + escapeHtml(card[2]) + '</p></div></div></div>';
  }).join("");
}

async function runMatches() {
  var root = $("#matchList"); if (!root || !state.profile) return;
  root.innerHTML = loading("Scoring roles…");
  var data = await request("/profiles/" + encodeURIComponent(state.profile.id) + "/match", { method: "POST", body: { scenarioId: state.scenarioId, profile: state.profile } });
  state.matches = data;
  var matches = data.matches || [];
  var meta = $("#matchMeta"); if (meta) { meta.className = "badge badge-success"; meta.textContent = matches.length + " roles scored"; }
  root.innerHTML = matches.map(function (match, index) {
    var gaps = (match.skillsGap || []).slice(0, 4).map(function (gap) { return '<span class="app-gap">' + escapeHtml(gap.name) + ' ' + gap.currentLevel + '→' + gap.requiredLevel + '</span>'; }).join("");
    return '<div class="col-lg-6 mb-4"><article class="app-role-card h-100"><div class="card-body"><div class="d-flex justify-content-between"><div><span class="badge badge-primary">' + escapeHtml(match.family || "Role") + '</span><div class="app-role-meta mt-2">' + escapeHtml(match.sector || "") + '</div></div><div class="text-right"><div class="app-role-score">' + Math.round(match.fitScore || 0) + '</div><div class="app-role-meta">fit / 100</div></div></div><h3 class="app-role-title">' + (index === 0 ? "★ " : "") + escapeHtml(match.title) + '</h3><p class="small text-muted">' + escapeHtml(match.summary || "") + '</p><div class="app-role-meta mb-2">Demand ' + number(match.demandIndex) + ' · Automation ' + number(match.automationRisk) + '% · ' + money(match.salary && match.salary.min, match.salary && match.salary.currency) + '–' + money(match.salary && match.salary.max, match.salary && match.salary.currency) + '</div><div class="mb-2">' + (gaps || '<span class="badge badge-success">No skill gaps</span>') + '</div><button class="btn btn-sm btn-outline-primary mt-2" type="button" data-pick-role="' + escapeHtml(match.roleId) + '">Build this pathway</button></div></article></div>';
  }).join("");
  renderOverview();
}

async function loadPathway(roleId) {
  var root = $("#pathwayContent"); if (!root || !state.profile) return;
  root.classList.remove("app-empty");
  root.innerHTML = '<div class="app-loading">Building a three-phase pathway…</div>';
  try {
    var data = await request("/profiles/" + encodeURIComponent(state.profile.id) + "/pathway", { method: "POST", body: { scenarioId: state.scenarioId, roleId: roleId || (state.matches && state.matches.matches && state.matches.matches[0] && state.matches.matches[0].roleId) || null, profile: state.profile } });
    state.pathway = data;
    root.innerHTML = (data.phases || []).map(function (phase, index) {
      var modules = (phase.modules || []).map(function (module) {
        return '<div class="app-module"><div><strong>' + escapeHtml(module.title || "Learning module") + '</strong><br><small>' + escapeHtml(module.provider || "") + ' · ' + escapeHtml(module.level || "") + '</small></div><small>' + number(module.hours) + 'h · ' + (module.cost ? money(module.cost) : "Free") + '</small></div>';
      }).join("");
      return '<div class="app-phase"><span class="app-phase__marker">' + (index + 1) + '</span><h3>' + escapeHtml(phase.title || "Phase " + (index + 1)) + '</h3><p>' + escapeHtml(phase.goal || "") + (phase.weeks ? " · " + phase.weeks + " weeks" : "") + '</p><div class="mt-2">' + (modules || '<p class="small text-muted">No modules in this phase.</p>') + '</div></div>';
    }).join("");
  } catch (error) {
    root.classList.add("app-empty");
    root.innerHTML = '<div class="card-body p-4 text-danger">Pathway unavailable: ' + escapeHtml(error.message) + '</div>';
  }
}

async function loadSdg() {
  var root = $("#sdgGrid"); if (!root || !state.profile) return;
  root.innerHTML = loading("Mapping roles and skills to the 17 goals…");
  try {
    var data = await request("/profiles/" + encodeURIComponent(state.profile.id) + "/sdg-map?scenarioId=" + encodeURIComponent(state.scenarioId));
    state.sdg = data;
    var goals = (data.goals || []).slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    root.innerHTML = goals.map(function (goal) {
      return '<div class="col-sm-6 col-lg-4 col-xl-3 mb-3"><article class="app-sdg" style="--sdg:' + escapeHtml(goal.color || "#5e72e4") + '"><div class="d-flex justify-content-between"><span class="app-role-meta">SDG ' + escapeHtml(goal.number) + '</span><strong>' + Math.round(goal.score || 0) + '</strong></div><h3>' + escapeHtml(goal.shortName || goal.name) + '</h3><p>' + escapeHtml(goal.rationale || "") + '</p></article></div>';
    }).join("");
    renderOverview();
  } catch (error) {
    root.innerHTML = loading("SDG map unavailable: " + error.message);
  }
}

async function generateBriefing() {
  if (!state.profile) return;
  var output = $("#narrativeOutput"); var button = $("#briefingBtn");
  if (!output) return;
  output.textContent = "Streaming the evidence briefing…";
  output.classList.remove("text-muted");
  if (button) button.disabled = true;
  try {
    if (!window.EventSource) {
      var data = await request("/analysis", { method: "POST", body: { profileId: state.profile.id, scenarioId: state.scenarioId } });
      output.textContent = (data.analysis && data.analysis.narrative) || data.narrative || "No narrative returned.";
      return;
    }
    var url = API + "/analysis/stream?profileId=" + encodeURIComponent(state.profile.id) + "&scenarioId=" + encodeURIComponent(state.scenarioId);
    var source = new EventSource(url);
    output.textContent = "";
    source.addEventListener("token", function (event) {
      try { output.textContent += JSON.parse(event.data).text || ""; } catch (e) { /* ignore */ }
    });
    source.addEventListener("done", function () { source.close(); if (button) button.disabled = false; });
    source.addEventListener("error", function () {
      source.close();
      output.textContent += "\n\nThe stream stopped. You can retry.";
      if (button) button.disabled = false;
    });
  } catch (error) {
    output.textContent = "Briefing unavailable: " + error.message;
    if (button) button.disabled = false;
  }
}

async function runPipeline() {
  if (!state.profile) return;
  setWorkflow("Calculating…", "primary");
  hideNotice();
  try {
    await runMatches();
    var top = state.matches && state.matches.matches && state.matches.matches[0];
    await loadPathway(top && top.roleId);
    await loadSdg();
    if ($("#briefingBtn")) $("#briefingBtn").disabled = false;
    setWorkflow("Plan ready", "success");
  } catch (error) {
    setWorkflow("Needs attention", "danger");
    notice("Calculation failed: " + error.message, "danger");
  }
}

function bindEvents() {
  var form = $("#profileForm"); if (form) form.addEventListener("submit", saveProfile);
  var sample = $("#sampleBtn"); if (sample) sample.addEventListener("click", function () { applySample(); var p = $("#profile"); if (p) p.scrollIntoView({ behavior: "smooth", block: "start" }); });
  var briefing = $("#briefingBtn"); if (briefing) briefing.addEventListener("click", generateBriefing);
  var theme = $("#themeToggle"); if (theme) theme.addEventListener("click", function () {
    var dark = document.documentElement.classList.toggle("darkmode");
    localStorage.setItem(STORAGE_THEME, dark ? "dark" : "light");
    theme.textContent = dark ? "Light mode" : "Dark mode";
  });
  var select = $("#scenarioSelect"); if (select) select.addEventListener("change", function (event) {
    state.scenarioId = event.target.value;
    renderScenarios();
    if (state.profile) runPipeline();
  });
  var matchList = $("#matchList"); if (matchList) matchList.addEventListener("click", function (event) {
    var button = event.target.closest("[data-pick-role]"); if (!button) return;
    loadPathway(button.getAttribute("data-pick-role"));
    var p = $("#pathway"); if (p) p.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  var scenarios = $("#scenarioCards"); if (scenarios) scenarios.addEventListener("click", function (event) {
    var card = event.target.closest("[data-scenario]"); if (!card) return;
    state.scenarioId = card.getAttribute("data-scenario");
    if (select) select.value = state.scenarioId;
    renderScenarios();
    if (state.profile) runPipeline();
  });
}

async function bootstrap() {
  var savedTheme = localStorage.getItem(STORAGE_THEME);
  var dark = savedTheme ? savedTheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("darkmode");
  var themeButton = $("#themeToggle"); if (themeButton) themeButton.textContent = dark ? "Light mode" : "Dark mode";
  bindEvents();
  renderInterests();
  try {
    var loaded = await Promise.all([request("/meta"), request("/catalog")]);
    state.meta = loaded[0]; state.catalog = loaded[1];
    state.scenarioId = (state.catalog.scenarios && state.catalog.scenarios[0] && state.catalog.scenarios[0].id) || "baseline";
    renderSkillFields(state.catalog);
    renderScenarios();
    setStatus("Live API", "success");
    hideNotice();
    await loadSignals();
    renderOverview();
    var cached = localStorage.getItem(STORAGE_PROFILE);
    if (cached) {
      try {
        var profile = JSON.parse(cached);
        if (profile && profile.id) {
          state.profile = profile;
          var check = await request("/profiles/" + encodeURIComponent(profile.id));
          state.profile = check.profile || profile;
          setWorkflow("Profile saved", "success");
          await runPipeline();
        }
      } catch (e) { /* stale local profile: keep the form */ }
    }
  } catch (error) {
    setStatus("API offline", "danger");
    notice("The API is not reachable. Start the backend with python src/main.py, then reload. " + error.message, "danger");
    $$("#profileForm input, #profileForm select, #profileForm textarea, #profileForm button").forEach(function (input) { input.disabled = true; });
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);
