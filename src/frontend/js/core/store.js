/**
 * Application state with a tiny pub/sub layer and localStorage persistence.
 */

import { config } from "./config.js";

const STORAGE_KEY = "aicn:state:v1";

const initialState = {
  booted: false,
  mode: "demo",
  health: null,
  meta: null,
  catalog: null,
  profile: null,
  scenarioId: "baseline",
  matches: null,
  pathway: null,
  sdgMap: null,
  analysis: null,
  signals: null,
  theme: "light",
  busy: {},
  lastError: null,
  route: { path: "/overview", query: {} },
};

const listeners = new Set();
let state = { ...initialState };

function persist() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profile: state.profile,
        scenarioId: state.scenarioId,
        theme: state.theme,
        matches: state.matches,
        pathway: state.pathway,
        sdgMap: state.sdgMap,
        analysis: state.analysis,
      }),
    );
  } catch {
    /* quota or private mode */
  }
}

export function restore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.profile) state.profile = saved.profile;
    if (saved.scenarioId) state.scenarioId = saved.scenarioId;
    if (saved.theme) state.theme = saved.theme;
    if (saved.matches) state.matches = saved.matches;
    if (saved.pathway) state.pathway = saved.pathway;
    if (saved.sdgMap) state.sdgMap = saved.sdgMap;
    if (saved.analysis) state.analysis = saved.analysis;
  } catch {
    /* ignore corrupted state */
  }
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(changed) {
  listeners.forEach((listener) => {
    try {
      listener(state, changed);
    } catch (error) {
      console.error("store listener failed", error);
    }
  });
}

export function setState(patch, options = {}) {
  const previous = state;
  state = { ...state, ...patch };
  if (options.persist !== false) persist();
  emit(Object.keys(patch));
  return state;
}

export function setBusy(key, value) {
  setState({ busy: { ...state.busy, [key]: Boolean(value) } }, { persist: false });
}

export function isBusy(key) {
  return Boolean(state.busy[key]);
}

export function resetWorkspace() {
  state = {
    ...initialState,
    booted: true,
    mode: state.mode,
    health: state.health,
    meta: state.meta,
    catalog: state.catalog,
    theme: state.theme,
    route: state.route,
    scenarioId: "baseline",
  };
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emit(["reset"]);
}

export function hasProfile() {
  return Boolean(state.profile && state.profile.id && state.profile.skills);
}

export function activeScenario() {
  const scenarios = state.catalog?.scenarios || [];
  return scenarios.find((scenario) => scenario.id === state.scenarioId) || scenarios[0] || null;
}

export function roleById(roleId) {
  return (state.catalog?.roles || []).find((role) => role.id === roleId) || null;
}

export function skillById(skillId) {
  return (state.catalog?.skills || []).find((skill) => skill.id === skillId) || null;
}

export function sdgByNumber(number) {
  return (state.catalog?.sdgs || []).find((goal) => goal.number === Number(number)) || null;
}

export function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  document.documentElement.style.colorScheme = next;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", next === "dark" ? "#080f18" : "#f4f6f8");
  setState({ theme: next });
}

export function toggleTheme() {
  applyTheme(state.theme === "dark" ? "light" : "dark");
}

export function setScenario(scenarioId) {
  if (!scenarioId || scenarioId === state.scenarioId) return;
  setState({
    scenarioId,
    matches: null,
    pathway: null,
    sdgMap: null,
    analysis: null,
  });
}

export function applySampleProfile(profile) {
  setState({ profile, matches: null, pathway: null, sdgMap: null, analysis: null });
}

export function currentConfigMode() {
  return config.mode;
}
