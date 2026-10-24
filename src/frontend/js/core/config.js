/**
 * Runtime configuration.
 * Resolution order: URL query (?api=, ?mode=)  >  localStorage  >  window.AI_CAREER_CONFIG (assets/config.js)  >  defaults.
 */

const STORAGE_KEY = "aicn:config:v1";

export const DEFAULTS = {
  apiBaseUrl: "/api/v1",
  mode: "auto",
  requestTimeoutMs: 120000,
  stream: true,
  streamTimeoutMs: 120000,
  sampleProfile: false,
};

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  if (params.get("api")) result.apiBaseUrl = params.get("api");
  if (params.get("mode")) result.mode = params.get("mode");
  if (params.get("sample") === "1") result.sampleProfile = true;
  return result;
}

function normalise(base) {
  if (!base || base === "/") return "/api/v1";
  let url = String(base).trim();
  if (url === "mock" || url === "demo") return "demo";
  url = url.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url) && !url.startsWith("/")) url = "/" + url;
  return url;
}

export const config = Object.assign({}, DEFAULTS, window.AI_CAREER_CONFIG || {}, readStored(), readQuery());

config.apiBaseUrl = normalise(config.apiBaseUrl);
if (!["auto", "live", "demo"].includes(config.mode)) config.mode = "auto";
config.requestTimeoutMs = Number(config.requestTimeoutMs) || DEFAULTS.requestTimeoutMs;

export function saveConfig(patch) {
  Object.assign(config, patch);
  if (patch.apiBaseUrl !== undefined) config.apiBaseUrl = normalise(patch.apiBaseUrl);
  try {
    const { apiBaseUrl, mode } = config;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiBaseUrl, mode }));
  } catch {
    /* storage may be unavailable */
  }
}

export function resetConfig() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  config.apiBaseUrl = DEFAULTS.apiBaseUrl;
  config.mode = "auto";
}

export function apiUrl(path) {
  if (config.apiBaseUrl === "demo") return "demo://" + path.replace(/^\//, "");
  return config.apiBaseUrl.replace(/\/+$/, "") + "/" + String(path).replace(/^\//, "");
}

export function configSummary() {
  return {
    apiBaseUrl: config.apiBaseUrl,
    mode: config.mode,
    stream: config.stream,
    requestTimeoutMs: config.requestTimeoutMs,
  };
}
