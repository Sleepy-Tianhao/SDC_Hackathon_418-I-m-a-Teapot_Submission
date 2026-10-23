# AI Career Navigator — Argon edition (frontend)

A build-free single-page application (native ES modules + CSS) for the SDC 2026 Domain 1
brief. It takes a skills profile, dated AI-trend signals and three 2028 scenarios, then
produces role matches, a reskilling pathway and an SDG map.

No npm, no bundler, no build step: the files here are the deployable artefact.

## Two independent designs

This directory is the **default Argon-inspired design**. The previous teapot design is kept
complete and independent in `src/frontend_bak`; when the FastAPI entry is running it is also
served at `/legacy/`. Use the **Classic** pill in the top bar (or `/legacy/`) to switch back
immediately, and the floating **Argon design** link on the legacy page to return here.

The Argon treatment is implemented in `css/argon.css`, loaded last after the shared component
CSS. It follows the Argon Design System's blue-violet palette, floating glass navigation,
ambient gradients, soft cards and rounded controls; it does not load the WordPress theme.
Design attribution: [Argon Theme](https://github.com/solstice23/argon-theme).

## Run it

**Full stack — FastAPI backend plus this frontend (recommended for live data):**

~~~bash
pip install -r requirements.txt
python src/main.py
# open http://127.0.0.1:8000/
~~~

The FastAPI entry serves this directory at `/` and the `/api/v1` API from the same origin. The
frontend normally selects the live transport automatically after probing `/api/v1/health`.

**Frontend only (offline demo dataset):**

~~~bash
python tools/serve_frontend.py --port 8003
# open http://127.0.0.1:8003/
~~~

No API is required in this mode. The UI falls back to the files in `mock/` and shows the
**Offline demo dataset** badge. This is intentionally separate from the live backend; the
backend does not read `mock/*.json`.

**Anything else static** — any HTTP server rooted at this directory works, e.g.
`python -m http.server 8000 --directory src/frontend`. ES modules require HTTP; `file://` will
not work. If you only need API contract examples, the legacy
`docs/backend-integration/reference_api.py` is still available, but it is not the runtime
backend.


## Structure

~~~text
index.html                 shell, CSS and module entry
assets/config.js           runtime configuration (API base URL, mode, streaming)
assets/favicon.svg
assets/argon-mark.svg     Argon Edition favicon
css/
  tokens.css               colours, type, spacing, dark theme tokens
  base.css                 reset, typography, utilities, motion
  layout.css               sidebar, top bar, page shell, responsive rules
  components.css           buttons, inputs, cards, badges, modals, toasts
  views-core.css           hero, overview, intake, signals, matches
  views-plan.css           pathway, SDG, scenarios, connect, charts
  argon.css                Argon design skin (loaded last; owns the default look)
js/
  app.js                   boot, shell, router wiring, global actions
  core/
    config.js              precedence: URL -> localStorage -> config.js -> defaults
    api.js                 live/demo transport, fetch, SSE, error model
    mock.js                demo engine: scoring, pathway, SDG, narrative
    store.js               state, pub/sub, localStorage cache
    router.js              hash router (#/matches?role=...)
    dom.js                 html template tag (auto-escaping), icons, formatting
    ui.js                  headers, badges, score rings, toasts, modals, states
    charts.js              SVG radar / donut / sparkline
    options.js             intake option lists and enums
  views/
    overview.js  intake.js  signals.js  matches.js
    pathway.js   sdg.js    scenarios.js  connect.js   index.js
mock/
  catalog.json             23 skills, 12 roles, 3 scenarios, 17 SDGs
  signals.json             20 dated, source-linked signals
  modules.json             37 learning modules used by the pathway builder
~~~

## Configuration

Precedence, highest first:

1. URL parameters: `?api=http://localhost:8000/api/v1&mode=live`
2. `localStorage["aicn:config:v1"]` (set from the **API & integration** screen)
3. `window.AI_CAREER_CONFIG` in `assets/config.js`
4. Defaults: `/api/v1`, `auto`, streaming on

`mode`: `auto` probes `/health` (3 s) and falls back to the demo dataset; `live` always calls
the API; `demo` never does. The active transport is always visible in the sidebar.

## Routes

| Route | Screen | Needs profile |
| ----- | ------ | ------------- |
| `#/overview` | Landing page or personal dashboard | optional |
| `#/intake` | 4-step skills intake (`?step=2` deep-links a step) | no |
| `#/signals` | Dated signal layer with filters and evidence modals (`?roleId=`, `?highlight=`) | no |
| `#/matches` | 12 scored roles, gaps, gap matrix, role detail | yes |
| `#/pathway` | Phased reskilling plan (`?role=`) | yes |
| `#/sdg` | 17-goal contribution map | yes |
| `#/scenarios` | Three futures and their effect on the plan | optional |
| `#/connect` | Transport status, endpoint contract, integration recipe | no |

`#/overview?sample=1` seeds the sample profile on first load — handy for demos and screenshots.

## State and data flow

* `store.js` holds catalog, profile, matches, pathway, SDG map, analysis and UI preferences.
  The profile, scenario, theme and last results are cached in `localStorage`; the backend
  remains the source of truth.
* `api.js` is the only module that talks to the network. Views call `api.match(...)`,
  `api.pathway(...)`, etc. and never see transport details.
* In demo mode `mock.js` computes everything locally from `mock/*.json`; the scoring rules
  mirror the backend contract so both modes tell the same story.
* Changing the scenario clears derived results and re-fetches them for the current screen.

## Adding a screen or component

1. Create `js/views/<name>.js` exporting `{ id, title, icon, loadingMessage, async render(ctx), mount(root, ctx) }`.
2. Register it in `js/views/index.js` and add a nav entry in `app.js`.
3. Build markup with the `html` tag: interpolations are escaped automatically; pass
   `raw(...)` only for markup you construct yourself (icons already return safe values).
4. Attach listeners in `mount` with delegation on `root`; the router replaces the view
   container on navigation, so guard one-time listeners with a `dataset` flag.

## Visual system

* Tokens live in `css/tokens.css`; dark mode is `[data-theme="dark"]` with the same token names.
* Type: system UI stack for text, monospace for data labels and eyebrows. No web fonts, so the
  demo works offline.
* Components: cards, badges, chips, segmented controls, progress bars, score rings, modals,
  toasts, skeletons, empty states and an error panel.
* Accessibility: skip link, focus-visible rings, ARIA labels on controls, keyboard-trapped
  modal, `prefers-reduced-motion` support, 4.5:1 text contrast in both themes.
* Responsive: three-column desktop -> sidebar drawer and single-column cards below 1024/720 px.
* Print: the pathway page prints without the shell (used for interviews/mentor meetings).

## Demo dataset

`mock/*.json` is the **offline demo** dataset used only when no API is available. It contains
illustrative skills, roles, scenarios, dated signals and learning modules; figures are modelled
for the demo, not official statistics, and the UI says so.

The self-contained FastAPI backend does **not** read these files. It loads the real labour
snapshots in `src/backend/data/` and builds its catalogue, signals and modules from them. The
frontend contract stays the same in both modes, so the UI does not need a code change when the
backend is present.


## Verification

~~~bash
python -m unittest discover tests                  # asset + fixture + contract checks
python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1
node tools/screenshot.mjs --base http://127.0.0.1:8000 \
  --out docs/screenshots --routes "/overview?sample=1=overview.png,/matches=matches.png"
~~~

The screenshot tool launches headless Edge through the DevTools protocol, waits for the SPA to
finish rendering and writes full-page PNGs. It is Windows/macOS friendly and has no npm
dependencies. Start `src/main.py` first when taking live screenshots.
