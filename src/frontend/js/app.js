/**
 * Application shell: sidebar, topbar, routing, global actions.
 */

import { api, resolveTransport, transportInfo } from "./core/api.js";
import { config } from "./core/config.js";
import { copyText, fmt, html, icon, qs, scrollToTop, setHtml, toHtml } from "./core/dom.js";
import { closeModal, confirmDialog, errorPanel, loadingPanel, toast } from "./core/ui.js";
import { currentRoute, navigate, onRoute, refreshRoute, startRouter } from "./core/router.js";
import * as store from "./core/store.js";
import * as demo from "./core/mock.js";
import { views } from "./views/index.js";

/** Small diagnostic surface used by tools/screenshot.mjs and the smoke tests. */
window.__AICN = { booted: false, route: null, errors: [], startedAt: Date.now() };
window.addEventListener("error", (event) => {
  window.__AICN.errors.push(String(event.message || event.error || "unknown error"));
});

const NAV_SECTIONS = [
  {
    label: "Workspace",
    items: [
      { path: "/overview", label: "Overview", icon: "compass" },
      { path: "/intake", label: "Skills profile", icon: "user", step: "01" },
    ],
  },
  {
    label: "Foresight",
    items: [
      { path: "/signals", label: "Signal layer", icon: "activity", step: "02" },
      { path: "/scenarios", label: "Scenario lab", icon: "compare" },
    ],
  },
  {
    label: "Your plan",
    items: [
      { path: "/matches", label: "Role matches", icon: "target", step: "03" },
      { path: "/pathway", label: "Reskilling pathway", icon: "route", step: "04" },
      { path: "/sdg", label: "SDG map", icon: "globe", step: "05" },
    ],
  },
  {
    label: "Build",
    items: [{ path: "/connect", label: "API & integration", icon: "plug" }],
  },
];

let currentViewTitle = "Overview";

function modeLabel() {
  return store.getState().mode === "live" ? "Live API connected" : "Offline demo dataset";
}

function modeDotClass() {
  return store.getState().mode === "live" ? "dot" : "dot dot--demo";
}

function renderSidebar() {
  const sidebar = qs("#sidebar");
  if (!sidebar) return;
  const state = store.getState();
  const route = currentRoute();
  const info = transportInfo();
  const signalCount = state.meta?.counts?.signals;
  const modeDetail =
    state.mode === "live"
      ? "Requests go to " + config.apiBaseUrl
      : info.reason || "No backend answered — the UI is running on fixture data.";

  sidebar.innerHTML = toHtml(html`<a class="sidebar__brand" href="#/overview" aria-label="AI Career Navigator home">
      <span class="brand-mark">${icon("compass", 21)}</span>
      <span class="brand-text">
        <span class="brand-name">AI Career Navigator</span>
        <span class="brand-sub">SDC 2026 · Domain 1</span>
      </span>
    </a>
    <nav class="sidebar__nav" aria-label="Sections">
      ${NAV_SECTIONS.map(
        (section) => html`<p class="nav__label">${section.label}</p>
          ${section.items.map((item) => {
            const active = route.path === item.path || (item.path === "/overview" && route.path === "/");
            const count = item.path === "/signals" && signalCount ? html`<span class="nav__count">${signalCount}</span>` : "";
            return html`<a class="nav__item ${active ? "is-active" : ""}" href="#${item.path}"
                ${active ? 'aria-current="page"' : ""}>
              ${icon(item.icon, 17)}
              <span>${item.label}</span>
              ${count || (item.step ? html`<span class="nav__step">${item.step}</span>` : "")}
            </a>`;
          })}`,
      )}
    </nav>
    <div class="sidebar__foot">
      <div class="mode-card">
        <div class="mode-card__top"><span class="${modeDotClass()}"></span>${modeLabel()}</div>
        <p class="mode-card__meta">${modeDetail}</p>
        <a class="mode-card__link" href="#/connect">Connection settings ${icon("arrowRight", 12)}</a>
      </div>
      <p class="sidebar__legal">
        Built by 418 I'm a Teapot. Signals, roles and pathways in demo mode are illustrative seed data.
      </p>
    </div>`);

}

function renderTopbar() {
  const topbar = qs("#topbar");
  if (!topbar) return;
  const state = store.getState();
  const route = currentRoute();
  const view = views[route.path];
  currentViewTitle = view ? view.title : "Not found";
  const scenarios = state.catalog?.scenarios || [];
  const scenarioId = state.scenarioId;
  const lastRefreshed = state.meta?.lastRefreshedAt;
  const profile = state.profile;

  topbar.innerHTML = toHtml(html`<button class="icon-btn menu-btn" type="button" data-action="menu-open" aria-label="Open navigation">
      ${icon("menu", 20)}
    </button>
    <div class="crumb">
      <span>Workspace</span>${icon("chevronRight", 12)}<strong data-role="crumb-title">${currentViewTitle}</strong>
    </div>
    <div class="topbar__right">
      <a class="freshness" href="#/signals" title="Open the signal layer">
        <span class="dot"></span>
        ${lastRefreshed ? html`Signals · ${fmt.relative(lastRefreshed)}` : "Signals loading"}
      </a>
      <div class="scenario-picker">
        <span class="scenario-picker__label">Scenario</span>
        <select id="scenario-select" aria-label="Future scenario">
          ${scenarios.length
            ? scenarios.map(
                (scenario) =>
                  html`<option value="${scenario.id}" ${scenario.id === scenarioId ? "selected" : ""}>${scenario.shortName}</option>`,
              )
            : html`<option value="baseline">Baseline</option>`}
        </select>
      </div>
      <button class="icon-btn icon-btn--bordered" type="button" data-action="toggle-theme"
        aria-label="Switch to ${state.theme === "dark" ? "light" : "dark"} theme" title="Toggle theme">
        ${icon(state.theme === "dark" ? "sun" : "moon", 17)}
      </button>
      <a class="avatar" href="#/intake" title="${profile ? "Edit skills profile" : "Build your skills profile"}">
        <span class="avatar__initials">${profile ? fmt.initials(profile.name) : "?"}</span>
        <span class="avatar__name">${profile ? profile.name : "New profile"}</span>
      </a>
    </div>`);

  const select = qs("#scenario-select");
  if (select) {
    select.addEventListener("change", () => {
      store.setScenario(select.value);
      const label = (store.getState().catalog?.scenarios || []).find((item) => item.id === select.value);
      toast("Recalculating for " + (label ? label.name : "the selected scenario") + ".", { tone: "brand" });
      refreshRoute();
    });
  }
}

function openNav() {
  const sidebar = qs("#sidebar");
  const scrim = qs("#sidebar-scrim");
  if (!sidebar) return;
  sidebar.classList.add("is-open");
  if (scrim) scrim.classList.remove("hidden");
  document.body.classList.add("is-locked");
}

function closeNav() {
  const sidebar = qs("#sidebar");
  const scrim = qs("#sidebar-scrim");
  if (!sidebar) return;
  sidebar.classList.remove("is-open");
  if (scrim) scrim.classList.add("hidden");
  if (!qs("#modal-root")?.classList.contains("is-open")) document.body.classList.remove("is-locked");
}

async function loadSampleProfile(options = {}) {
  const buttonToast = toast("Loading the sample profile…", { tone: "brand", duration: 2000 });
  try {
    const profile = await api.saveProfile(demo.SAMPLE_PROFILE, null);
    store.recordJourney("profileSaved");
    store.setState({ profile, matches: null, pathway: null, sdgMap: null, analysis: null });
    window.dispatchEvent(new CustomEvent("aicn:workspace-changed"));
    renderTopbar();
    if (!options.silent) {
      toast("Aisha Rahman's profile is ready. Explore matches, pathway and SDG mapping.", {
        tone: "success",
        title: "Sample profile loaded",
      });
    }
    if (options.navigate !== false) navigate("/overview");
    else refreshRoute();
    return profile;
  } catch (error) {
    toast(error.message || "Could not load the sample profile.", { tone: "danger", title: "Load failed" });
    throw error;
  } finally {
    if (buttonToast) buttonToast.remove();
  }
}

async function copyToClipboard(value) {
  const ok = await copyText(value);
  toast(ok ? "Copied to clipboard." : "Copy failed — select and copy manually.", {
    tone: ok ? "success" : "danger",
    duration: 2400,
  });
}

function bindGlobalEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const copyEl = target.closest("[data-copy]");
    if (copyEl) {
      event.preventDefault();
      copyToClipboard(copyEl.getAttribute("data-copy") || "");
      return;
    }

    const actionEl = target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.getAttribute("data-action");

    if (action === "menu-open") openNav();
    else if (action === "menu-close") closeNav();
    else if (action === "toggle-theme") {
      store.toggleTheme();
      renderTopbar();
    } else if (action === "use-sample") {
      loadSampleProfile();
    } else if (action === "reset-workspace") {
      confirmDialog({
        title: "Reset this workspace?",
        message: "Your saved profile, matches, pathway and narrative will be removed from this browser.",
        confirmLabel: "Reset workspace",
        onConfirm: () => {
          store.resetWorkspace();
          window.dispatchEvent(new CustomEvent("aicn:workspace-changed"));
          renderTopbar();
          navigate("/overview");
          toast("Workspace cleared.", { tone: "info" });
        },
      });
    } else if (action === "retry-route") {
      refreshRoute();
    } else if (action === "retry-boot") {
      window.location.reload();
    } else if (action === "goto") {
      const to = actionEl.getAttribute("data-to");
      if (to) navigate(to);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNav();
  });

  const scrim = qs("#sidebar-scrim");
  if (scrim) scrim.addEventListener("click", closeNav);

  window.addEventListener("hashchange", () => closeNav());
}

let rendering = false;
let renderQueued = false;

async function renderRoute() {
  if (rendering) {
    renderQueued = true;
    return;
  }
  rendering = true;
  const route = currentRoute();
  const view = views[route.path];
  const viewEl = qs("#view");
  if (!viewEl) {
    rendering = false;
    return;
  }

  closeModal();
  renderSidebar();
  renderTopbar();

  if (!view) {
    viewEl.innerHTML = toHtml(html`<div class="empty">
      <span class="empty__icon">${icon("compass", 26)}</span>
      <h3 class="empty__title">This route does not exist</h3>
      <p class="empty__body">The address <code>${route.path}</code> is not part of the application.</p>
      <div class="empty__action"><a class="btn btn--primary" href="#/overview">Back to overview</a></div>
    </div>`);
    document.title = "Not found · AI Career Navigator";
    rendering = false;
    return;
  }

  currentViewTitle = view.title;
  window.__AICN.route = route.path;
  document.title = view.title + " · AI Career Navigator";
  viewEl.innerHTML = toHtml(
    html`<div class="view-loading">
      ${loadingPanel(view.loadingMessage || "Loading…")}
    </div>`,
  );

  try {
    const content = await view.render({ route, state: store.getState() });
    setHtml(viewEl, content);
    scrollToTop();
    if (typeof view.mount === "function") {
      await view.mount(viewEl, { route, state: store.getState() });
    }
  } catch (error) {
    console.error("view failed", route.path, error);
    setHtml(
      viewEl,
      errorPanel({
        title: "This view could not load",
        message: error.message || "Unknown error",
        code: error.code ? error.code + (error.status ? " · HTTP " + error.status : "") : "",
        retry: true,
        extra: html`<p class="tiny muted" style="margin-top:8px">
          You can also switch to the demo dataset in <a href="#/connect">connection settings</a>.
        </p>`,
      }),
    );
  } finally {
    rendering = false;
    if (renderQueued) {
      renderQueued = false;
      renderRoute();
    }
  }
}

function renderFatal(error) {
  const viewEl = qs("#view");
  if (!viewEl) return;
  viewEl.innerHTML = toHtml(
    errorPanel({
      title: "The workspace could not start",
      message:
        (error && error.message) ||
        "The catalog could not be loaded. Start the API or serve the frontend over HTTP.",
      code: error && error.code ? error.code : "",
      retry: false,
      extra: html`<div class="row" style="margin-top:12px">
        <button class="btn btn--primary btn--sm" type="button" data-action="retry-boot">Reload</button>
        <a class="btn btn--secondary btn--sm" href="#/connect">Check API settings</a>
      </div>`,
    }),
  );
}

async function boot() {
  store.restore();
  store.applyTheme(store.getState().theme || "light");
  renderSidebar();
  renderTopbar();
  bindGlobalEvents();
  startRouter();
  onRoute(() => renderRoute());

  try {
    await resolveTransport();
    renderSidebar();
    const [meta, catalog] = await Promise.all([api.meta(), api.catalog()]);
    store.setState({ meta, catalog, booted: true }, { persist: false });
    if (store.getState().mode === "live" && store.getState().profile) {
      try {
        await api.ensureRemoteProfile(store.getState().profile);
      } catch (error) {
        console.warn("profile sync failed", error);
      }
    }
    if ((config.sampleProfile || currentRoute().query.sample === "1") && !store.getState().profile) {
      try {
        await loadSampleProfile({ silent: true, navigate: false });
      } catch {
        /* sample profile is optional */
      }
    }
    renderSidebar();
    renderTopbar();
    window.__AICN.booted = true;
    await renderRoute();
  } catch (error) {
    console.error("boot failed", error);
    renderFatal(error);
  }
}

boot();

export { loadSampleProfile };