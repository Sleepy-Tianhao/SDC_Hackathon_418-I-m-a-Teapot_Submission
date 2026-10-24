/**
 * API client.
 * Talks to the backend contract in docs/API.md, with an offline demo transport
 * so the interface stays reviewable when the API is not running.
 */

import { apiUrl, config, saveConfig } from "./config.js";
import * as demo from "./mock.js";
import { setState } from "./store.js";

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status || 0;
    this.code = options.code || "unknown_error";
    this.details = options.details || null;
    this.url = options.url || "";
  }
}

const PROBE_TIMEOUT_MS = 3000;
let transport = null;
let transportReason = "";
let resolving = null;
let healthCache = null;
let metaCache = null;
let catalogCache = null;

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function request(path, options = {}) {
  const timeout = options.timeout || config.requestTimeoutMs;
  const query = options.query || {};
  let url;
  try {
    url = new URL(apiUrl(path), window.location.origin);
  } catch {
    throw new ApiError("Invalid API base URL: " + config.apiBaseUrl, { code: "bad_config" });
  }
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  let response;
  try {
    response = await fetch(url.toString(), {
      method: options.method || "GET",
      headers: Object.assign(
        { Accept: "application/json" },
        options.body ? { "Content-Type": "application/json" } : {},
        options.headers || {},
      ),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeoutSignal(timeout),
      credentials: "same-origin",
    });
  } catch (error) {
    const aborted = error && (error.name === "AbortError" || error.name === "TimeoutError");
    throw new ApiError(
      aborted
        ? "The API did not answer within " + Math.round(timeout / 1000) + "s."
        : "Could not reach the API at " + config.apiBaseUrl + ".",
      { code: aborted ? "timeout" : "network_error", url: url.toString(), details: String(error) },
    );
  }

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ApiError(
        "The API returned a non-JSON response. Check the endpoint path and proxy settings.",
        { status: response.status, code: "invalid_json", url: url.toString() },
      );
    }
  }

  if (!response.ok) {
    const envelope = payload && payload.error ? payload.error : null;
    throw new ApiError(
      (envelope && envelope.message) || "Request failed with HTTP " + response.status + ".",
      {
        status: response.status,
        code: (envelope && envelope.code) || "http_" + response.status,
        details: envelope ? envelope.details : payload,
        url: url.toString(),
      },
    );
  }
  return payload;
}

async function probe() {
  try {
    const health = await request("health", { timeout: PROBE_TIMEOUT_MS });
    return { ok: true, health };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function resolveTransport(options = {}) {
  if (transport && !options.force) return transport;
  if (resolving && !options.force) return resolving;

  resolving = (async () => {
    if (config.apiBaseUrl === "demo" || config.mode === "demo") {
      transport = "demo";
      transportReason = config.mode === "demo" ? "Demo mode selected in settings." : "API base set to demo.";
      return transport;
    }
    if (config.mode === "live") {
      transport = "live";
      transportReason = "Live mode selected in settings.";
      setState({ mode: "live", health: healthCache }, { persist: false });
      return transport;
    }
    const result = await probe();
    if (result.ok) {
      transport = "live";
      transportReason = "Connected to " + config.apiBaseUrl;
      healthCache = result.health;
      setState({ mode: "live", health: result.health }, { persist: false });
    } else {
      transport = "demo";
      transportReason =
        "No API answered at " + config.apiBaseUrl + ". Showing the offline demo dataset instead.";
      setState({ mode: "demo", health: null }, { persist: false });
    }
    return transport;
  })();

  try {
    return await resolving;
  } finally {
    resolving = null;
  }
}

export function transportInfo() {
  return {
    transport: transport || "demo",
    reason: transportReason,
    apiBaseUrl: config.apiBaseUrl,
    mode: config.mode,
    health: healthCache,
  };
}

export async function switchMode(mode) {
  saveConfig({ mode });
  transport = null;
  healthCache = null;
  metaCache = null;
  catalogCache = null;
  return resolveTransport({ force: true });
}

export async function setApiBase(base) {
  saveConfig({ apiBaseUrl: base });
  transport = null;
  healthCache = null;
  metaCache = null;
  catalogCache = null;
  return resolveTransport({ force: true });
}

export async function health() {
  await resolveTransport();
  if (transport === "demo") return demo.demoHealth();
  return request("health", { timeout: PROBE_TIMEOUT_MS });
}

export async function meta() {
  await resolveTransport();
  if (metaCache) return metaCache;
  metaCache = transport === "demo" ? await demo.demoMeta() : await request("meta");
  if (metaCache) setState({ meta: metaCache }, { persist: false });
  return metaCache;
}

export async function catalog() {
  await resolveTransport();
  if (catalogCache) return catalogCache;
  catalogCache = transport === "demo" ? await demo.demoCatalog() : await request("catalog");
  return catalogCache;
}

export async function listSignals(params = {}) {
  await resolveTransport();
  if (transport === "demo") return demo.demoListSignals(params);
  return request("signals", {
    query: {
      query: params.query,
      momentum: params.momentum,
      region: params.region,
      type: params.type,
      roleId: params.roleId,
      sort: params.sort,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export async function refreshSignals() {
  await resolveTransport();
  if (transport === "demo") return demo.demoRefreshSignals();
  return request("signals/refresh", { method: "POST", body: {} });
}

export async function saveProfile(profile, existing) {
  await resolveTransport();
  if (transport === "demo") {
    if (existing && existing.id) return demo.demoUpdateProfile(existing.id, profile);
    return demo.demoCreateProfile(profile);
  }
  if (existing && existing.id) {
    const result = await request("profiles/" + encodeURIComponent(existing.id), { method: "PATCH", body: profile });
    return result.profile || result;
  }
  const result = await request("profiles", { method: "POST", body: profile });
  return result.profile || result;
}

export async function getProfile(id) {
  await resolveTransport();
  if (transport === "demo") return demo.demoGetProfile(id);
  const result = await request("profiles/" + encodeURIComponent(id));
  return result.profile || result;
}

/**
 * Demo-mode profiles live only in localStorage. When the transport switches to a live API,
 * re-create the profile there if the id is unknown, so matches/pathway keep working.
 */
export async function ensureRemoteProfile(profile) {
  await resolveTransport();
  if (!profile || !profile.id || transport !== "live") return profile;
  try {
    await request("profiles/" + encodeURIComponent(profile.id), { timeout: PROBE_TIMEOUT_MS });
    return profile;
  } catch (error) {
    if (error.status !== 404) return profile;
    const created = await request("profiles", { method: "POST", body: profile });
    const fresh = created.profile || created;
    setState({ profile: fresh, matches: null, pathway: null, sdgMap: null, analysis: null });
    return fresh;
  }
}

export async function match(profile, scenarioId) {
  await resolveTransport();
  if (transport === "demo") {
    const result = await demo.demoMatch(profile, scenarioId);
    setState({ matches: result });
    return result;
  }
  const result = await request("profiles/" + encodeURIComponent(profile.id) + "/match", {
    method: "POST",
    body: { scenarioId, profile },
  });
  setState({ matches: result });
  return result;
}

export async function pathway(profile, scenarioId, roleId) {
  await resolveTransport();
  if (transport === "demo") {
    const result = await demo.demoPathway(profile, scenarioId, roleId);
    setState({ pathway: result });
    return result;
  }
  const result = await request("profiles/" + encodeURIComponent(profile.id) + "/pathway", {
    method: "POST",
    body: { scenarioId, roleId: roleId || null, profile },
  });
  setState({ pathway: result });
  return result;
}

export async function sdgMap(profile, scenarioId) {
  await resolveTransport();
  if (transport === "demo") {
    const result = await demo.demoSdgMap(profile, scenarioId);
    setState({ sdgMap: result });
    return result;
  }
  const result = await request("profiles/" + encodeURIComponent(profile.id) + "/sdg-map", {
    query: { scenarioId },
  });
  setState({ sdgMap: result });
  return result;
}

export async function scenarios() {
  await resolveTransport();
  if (transport === "demo") {
    const catalogData = await demo.demoCatalog();
    return { items: catalogData.scenarios };
  }
  return request("scenarios");
}

/**
 * Narrative analysis.
 * Live mode streams Server-Sent Events; demo mode replays a generated narrative.
 * onEvent({ type: "meta" | "token" | "done" | "error", ... })
 */
export async function analysis(payload, onEvent) {
  await resolveTransport();

  if (transport === "demo") {
    const { profile, scenarioId, context } = payload;
    const catalogData = context?.catalog || (await demo.demoCatalog());
    const scenario = (catalogData.scenarios || []).find((item) => item.id === scenarioId) || catalogData.scenarios[0];
    const matches = context?.matches || (await demo.demoMatch(profile, scenarioId));
    const plan = context?.pathway || (await demo.demoPathway(profile, scenarioId).catch(() => null));
    const map = context?.sdgMap || runSdgMap(profile, matches, catalogData);
    const result = await demo.demoAnalysis({ profile, matches, scenario, pathway: plan, sdgMap: map, catalog: catalogData }, onEvent);
    setState({ analysis: result.analysis });
    return result.analysis;
  }

  if (config.stream && typeof onEvent === "function") {
    return streamLive(payload, onEvent);
  }
  const result = await request("analysis", {
    method: "POST",
    body: { profileId: payload.profile.id, scenarioId: payload.scenarioId, roleId: payload.roleId || null },
    timeout: config.streamTimeoutMs,
  });
  const analysisResult = result.analysis || result;
  if (onEvent) onEvent({ type: "done", analysis: analysisResult });
  setState({ analysis: analysisResult });
  return analysisResult;
}

function runSdgMap(profile, matches, catalogData) {
  try {
    return demo.buildSdgMap(profile, matches, { items: [] }, catalogData);
  } catch {
    return null;
  }
}

function streamLive(payload, onEvent) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl("analysis/stream"), window.location.origin);
    url.searchParams.set("profileId", payload.profile.id);
    url.searchParams.set("scenarioId", payload.scenarioId);
    if (payload.roleId) url.searchParams.set("roleId", payload.roleId);

    const source = new EventSource(url.toString());
    let settled = false;
    let firstEvent = false;
    const guard = setTimeout(() => {
      if (!firstEvent) {
        source.close();
        if (!settled) {
          settled = true;
          reject(new ApiError("The analysis stream did not start within 20 seconds.", { code: "stream_timeout" }));
        }
      }
    }, 20000);

    const finish = (analysis) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      source.close();
      setState({ analysis });
      resolve(analysis);
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      source.close();
      reject(new ApiError(message, { code: "stream_error" }));
    };

    source.addEventListener("meta", (event) => {
      firstEvent = true;
      onEvent({ type: "meta", meta: safeJson(event.data) });
    });
    source.addEventListener("token", (event) => {
      firstEvent = true;
      const data = safeJson(event.data);
      onEvent({ type: "token", text: (data && data.text) || "" });
    });
    source.addEventListener("done", (event) => {
      const data = safeJson(event.data);
      const analysis = (data && data.analysis) || data;
      onEvent({ type: "done", analysis });
      finish(analysis);
    });
    source.addEventListener("error", (event) => {
      const data = event.data ? safeJson(event.data) : null;
      onEvent({ type: "error", message: (data && data.message) || "Stream interrupted." });
      fail((data && data.message) || "The analysis stream failed.");
    });
    source.onerror = () => {
      if (!settled) fail("Lost connection to the analysis stream.");
    };
  });
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Facade used by views. Keeps the demo/live switch in one place.
 */
export const api = {
  resolveTransport,
  switchMode,
  setApiBase,
  health,
  meta,
  catalog,
  listSignals,
  refreshSignals,
  saveProfile,
  getProfile,
  ensureRemoteProfile,
  match,
  pathway,
  sdgMap,
  scenarios,
  analysis,
  transportInfo,
};

export { demo };
