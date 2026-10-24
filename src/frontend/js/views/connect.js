/** Connection settings: live API vs demo transport, contract and integration recipe. */

import { api, resolveTransport, setApiBase, switchMode, transportInfo } from "../core/api.js";
import { config } from "../core/config.js";
import { fmt, html, icon } from "../core/dom.js";
import { refreshRoute } from "../core/router.js";
import * as store from "../core/store.js";
import { toast } from "../core/ui.js";

const ENDPOINTS = [
  { method: "GET", path: "/health", note: "liveness + version" },
  { method: "GET", path: "/meta", note: "dataset + model info" },
  { method: "GET", path: "/catalog", note: "skills, roles, SDGs, scenarios" },
  { method: "GET", path: "/signals", note: "filtered, dated signals" },
  { method: "POST", path: "/signals/refresh", note: "re-run ingestion" },
  { method: "POST", path: "/profiles", note: "create skills profile" },
  { method: "PATCH", path: "/profiles/{id}", note: "update profile" },
  { method: "POST", path: "/profiles/{id}/match", note: "role matching + gaps" },
  { method: "POST", path: "/profiles/{id}/pathway", note: "reskilling pathway" },
  { method: "GET", path: "/profiles/{id}/sdg-map", note: "17-goal mapping" },
  { method: "GET", path: "/scenarios", note: "future scenarios" },
  { method: "POST", path: "/analysis", note: "LLM narrative" },
  { method: "GET", path: "/analysis/stream", note: "SSE tokens" },
];

let draftMode = config.mode;

function statusCard(info) {
  const live = info.transport === "live";
  return html`<div class="connection-card connection-card--${live ? "live" : "demo"}">
    <span class="connection-card__status">${icon(live ? "shield" : "alert", 20)}</span>
    <div class="grow">
      <p class="connection-card__title">${live ? "Live API connected" : "Running on the demo dataset"}</p>
      <p class="connection-card__meta">${info.reason || "No probe has run yet."}</p>
    </div>
    <div class="row" style="--gap:7px">
      <span class="badge badge--${live ? "success" : "gold"}">${live ? "LIVE" : "DEMO"}</span>
      <button class="btn btn--secondary btn--sm" type="button" data-action="test-connection">${icon("refresh", 14)} Test</button>
    </div>
  </div>`;
}

function healthPanel(health) {
  if (!health) {
    return html`<div class="notice notice--warning">${icon("alert", 15)}<span>No health response. The interface is serving the demo dataset.</span></div>`;
  }
  return html`<div class="stack" style="--gap:4px">
    ${[
      { label: "Service", value: health.service || "—" },
      { label: "Version", value: health.version || "—" },
      { label: "Dataset", value: health.datasetVersion || "—" },
      { label: "Mode", value: health.mode || "—" },
      { label: "LLM", value: health.llm ? health.llm.provider + " · " + health.llm.model + (health.llm.configured ? "" : " (not configured)") : "—" },
      { label: "Server time", value: health.time ? fmt.dateTime(health.time) : "—" },
    ].map(
      (row) => html`<div class="kpi-line"><span>${row.label}</span><strong class="mono">${row.value}</strong></div>`,
    )}
  </div>`;
}

function endpointTable() {
  return html`<div class="endpoint-list">
    ${ENDPOINTS.map(
      (endpoint) => html`<div class="endpoint">
        <span class="method method--${endpoint.method.toLowerCase()}">${endpoint.method}</span>
        <span class="endpoint__path">/api/v1${endpoint.path}</span>
        <span class="endpoint__note">${endpoint.note}</span>
      </div>`,
    )}
  </div>`;
}

function page(state) {
  const info = transportInfo();
  const health = state.health;
  const meta = state.meta;
  const base = config.apiBaseUrl === "demo" ? "/api/v1" : config.apiBaseUrl;

  return html`<div class="page-head reveal">
      <p class="eyebrow">${icon("plug", 14)} Backend</p>
      <div class="page-head__row">
        <h1 class="page-title">Connect the API</h1>
        <div class="page-head__actions">
          <button class="btn btn--secondary btn--sm" type="button" data-action="copy-endpoints">${icon("copy", 15)} Copy endpoints</button>
        </div>
      </div>
      <p class="page-lead">
        The browser calls <code class="mono">/api/v1</code>. The server owns data, keys and model calls.
      </p>
      <div class="page-meta">
        <span>${icon("database", 13)} Dataset ${meta?.datasetVersion || "—"}</span>
        <span>${icon("clock", 13)} Signals refreshed ${fmt.relative(meta?.lastRefreshedAt)}</span>
        <span>${icon("activity", 13)} ${info.transport === "live" ? "Live transport" : "Demo transport"}</span>
      </div>
    </div>

    ${statusCard(info)}

    <div class="split" style="margin-top:18px">
      <section class="panel">
        <h2 class="panel__title">Connection settings</h2>
        <p class="panel__hint" style="margin-bottom:14px">
          Same-origin by default. Change only for another host or port.
        </p>
        <div class="stack" style="--gap:14px">
          <div class="field">
            <label class="field__label" for="api-base">API base URL</label>
            <input class="input" id="api-base" value="${base}" placeholder="/api/v1" />
            <p class="field__hint">Examples: <code class="mono">/api/v1</code>, <code class="mono">http://127.0.0.1:8000/api/v1</code>, <code class="mono">demo</code></p>
          </div>
          <div class="field">
            <span class="field__label">Transport policy</span>
            <div class="segmented" role="group" aria-label="Transport policy">
              ${[
                { id: "auto", label: "Auto", hint: "probe health, fall back to demo" },
                { id: "live", label: "Live only", hint: "show errors" },
                { id: "demo", label: "Demo only", hint: "fixtures" },
              ].map(
                (mode) => html`<button type="button" class="segmented__item ${draftMode === mode.id ? "is-active" : ""}"
                  data-action="set-mode" data-mode="${mode.id}" title="${mode.hint}">${mode.label}</button>`,
              )}
            </div>
            <p class="field__hint">Auto keeps the UI usable if the API sleeps.</p>
          </div>
          <div class="row" style="--gap:8px">
            <button class="btn btn--primary btn--sm" type="button" data-action="apply-connection">${icon("save", 15)} Save &amp; test</button>
            <button class="btn btn--ghost btn--sm" type="button" data-action="reset-connection">${icon("refresh", 15)} Reset to default</button>
          </div>
          <div class="notice">
            ${icon("info", 15)}
            <span>Saved in <code class="mono">localStorage</code>; URL overrides supported.</span>
          </div>
        </div>

        <hr class="divider" />
        <h3 class="panel__title">Health response</h3>
        <div style="margin-top:10px">${healthPanel(health || (info.transport === "live" ? null : { service: "ai-career-navigator (demo)", version: "1.0.0-demo", datasetVersion: meta?.datasetVersion, mode: "demo", llm: { provider: "demo", model: "narrator-v1", configured: false } }))}</div>
      </section>

      <div>
        <section class="panel">
          <div class="panel__head">
            <div>
              <h2 class="panel__title">Serve the frontend from FastAPI</h2>
              <p class="panel__hint">Same-origin: no CORS.</p>
            </div>
          </div>
          <pre class="code-block"><span class="c"># src/main.py</span>
<span class="k">from</span> fastapi <span class="k">import</span> FastAPI
<span class="k">from</span> fastapi.staticfiles <span class="k">import</span> StaticFiles

app = FastAPI()
app.include_router(api_router, prefix=<span class="s">"/api/v1"</span>)

<span class="c"># mount LAST so /api keeps priority</span>
app.mount(<span class="s">"/"</span>, StaticFiles(directory=<span class="s">"src/frontend"</span>, html=<span class="k">True</span>), name=<span class="s">"ui"</span>)</pre>
          <p class="tiny faint" style="margin-top:9px">
            Separate origins: enable CORS and set the API URL in <code class="mono">assets/config.js</code>.
          </p>
        </section>

        <section class="panel" style="margin-top:12px">
          <div class="panel__head">
            <div>
              <h2 class="panel__title">Run the reference API</h2>
              <p class="panel__hint">Legacy contract reference; not the runtime backend.</p>
            </div>
          </div>
          <pre class="code-block">python docs/backend-integration/reference_api.py --port 8000
<span class="c"># then open http://127.0.0.1:8000/</span></pre>
          <div class="row" style="--gap:8px;margin-top:10px">
            <span class="badge badge--neutral">fixtures included</span>
            <span class="badge badge--neutral">SSE streaming</span>
            <span class="badge badge--neutral">CORS enabled</span>
          </div>
        </section>
      </div>
    </div>

    <section class="panel" style="margin-top:18px">
      <div class="panel__head">
        <div>
          <h2 class="panel__title">Endpoint contract</h2>
          <p class="panel__hint">Versioned at <code class="mono">/api/v1</code>.</p>
        </div>
        <button class="btn btn--ghost btn--sm" type="button" data-copy="/api/v1/health">${icon("copy", 14)} Copy base</button>
      </div>
      ${endpointTable()}
      <p class="tiny faint" style="margin-top:12px">
        See <code class="mono">docs/API.md</code> and <code class="mono">docs/openapi.json</code>.
      </p>
    </section>

    <div class="grid grid--2" style="margin-top:18px">
      <section class="panel">
        <h2 class="panel__title">Contract smoke test</h2>
        <pre class="code-block" style="margin-top:10px">curl http://127.0.0.1:8000/api/v1/health

curl -X POST http://127.0.0.1:8000/api/v1/profiles \
  -H <span class="s">'Content-Type: application/json'</span> \
  -d <span class="s">'{"name":"Aisha","currentRole":"Coordinator","sector":"Public sector","skills":[{"skillId":"data-literacy","level":3}]}'</span></pre>
        <p class="tiny faint" style="margin-top:9px">
          The UI only needs the documented response shapes.
        </p>
      </section>
      <section class="panel">
        <h2 class="panel__title">Integration checklist</h2>
        <ol class="stack" style="--gap:9px;margin-top:10px;padding-left:16px;list-style:decimal">
          <li class="small muted">Serve <code class="mono">src/frontend</code> at <code class="mono">/</code>.</li>
          <li class="small muted">Implement health and catalog first.</li>
          <li class="small muted">Persist profiles in SQLite.</li>
          <li class="small muted">Implement matching, pathway and SDG endpoints.</li>
          <li class="small muted">Add the LLM narrative behind <code class="mono">/analysis</code> with SSE tokens; keep keys server-side.</li>
          <li class="small muted">Run the smoke test above and watch the status card turn green.</li>
        </ol>
      </section>
    </div>`;
}

async function applyConnection(root) {
  const input = root.querySelector("#api-base");
  const base = input ? input.value.trim() : "/api/v1";
  if (!base) {
    toast("Enter an API base URL first.", { tone: "warning" });
    return;
  }
  try {
    await setApiBase(base);
    await switchMode(draftMode);
    const [meta, catalog] = await Promise.all([api.meta(), api.catalog()]);
    store.setState({ meta, catalog, matches: null, pathway: null, sdgMap: null, analysis: null }, { persist: false });
    if (store.getState().mode === "live" && store.getState().profile) {
      try {
        await api.ensureRemoteProfile(store.getState().profile);
      } catch (error) {
        toast(error.message || "Profile sync failed.", { tone: "warning", title: "Profile sync" });
      }
    }
    if (store.getState().mode === "live") {
      toast("Connected to " + config.apiBaseUrl + ".", { tone: "success", title: "Live API" });
    } else {
      toast("Using the demo dataset. Start the API and re-test when it is ready.", { tone: "info", title: "Demo mode" });
    }
    refreshRoute();
  } catch (error) {
    toast(error.message || "Could not reach the API.", { tone: "danger", title: "Connection failed" });
  }
}

function bind(root) {
  root.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;
    const action = target.getAttribute("data-action");

    if (action === "set-mode") {
      draftMode = target.getAttribute("data-mode") || "auto";
      root.querySelectorAll('[data-action="set-mode"]').forEach((button) => {
        button.classList.toggle("is-active", button.getAttribute("data-mode") === draftMode);
      });
    } else if (action === "apply-connection") {
      target.disabled = true;
      target.innerHTML = html`<span class="spinner" style="width:14px;height:14px"></span> Testing…`.value;
      await applyConnection(root);
      target.disabled = false;
      target.innerHTML = html`${icon("save", 15)} Save &amp; test`.value;
    } else if (action === "test-connection") {
      target.disabled = true;
      try {
        await resolveTransport({ force: true });
        const result = await api.health();
        store.setState({ health: result, mode: result.mode === "demo" || transportInfo().transport === "demo" ? "demo" : "live" }, { persist: false });
        toast("Health check passed: " + (result.service || "API") + ".", { tone: "success", title: "Connection OK" });
        refreshRoute();
      } catch (error) {
        toast(error.message || "Health check failed.", { tone: "danger", title: "No response" });
        refreshRoute();
      } finally {
        target.disabled = false;
      }
    } else if (action === "reset-connection") {
      try {
        await setApiBase("/api/v1");
        await switchMode("auto");
        draftMode = "auto";
        const [meta, catalog] = await Promise.all([api.meta(), api.catalog()]);
        store.setState({ meta, catalog }, { persist: false });
        toast("Connection settings reset.", { tone: "info" });
        refreshRoute();
      } catch (error) {
        toast(error.message || "Reset failed.", { tone: "danger" });
      }
    } else if (action === "copy-endpoints") {
      const text = ENDPOINTS.map((endpoint) => endpoint.method + " /api/v1" + endpoint.path).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        toast("Endpoint list copied.", { tone: "success" });
      } catch {
        toast("Copy failed — select the table manually.", { tone: "danger" });
      }
    }
  });
}

export const connectView = {
  id: "connect",
  title: "API & integration",
  icon: "plug",
  loadingMessage: "Checking the connection…",

  async render() {
    try {
      await resolveTransport();
    } catch {
      /* the status card explains the failure */
    }
    return page(store.getState());
  },

  mount(root) {
    if (!root.dataset.connectBound) {
      root.dataset.connectBound = "1";
      bind(root);
    }
  },
};