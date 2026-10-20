/** Hash router. Routes look like #/matches?role=ai-ops-analyst */

const listeners = new Set();

export function currentRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/overview";
  const [pathPart, queryPart] = raw.split("?");
  const path = pathPart && pathPart.startsWith("/") ? pathPart : "/" + (pathPart || "overview");
  const query = {};
  new URLSearchParams(queryPart || "").forEach((value, key) => {
    query[key] = value;
  });
  return { path: path.replace(/\/+$/, "") || "/overview", query, hash: raw };
}

export function navigate(path, options = {}) {
  const target = path.startsWith("#") ? path : "#" + (path.startsWith("/") ? path : "/" + path);
  if (options.replace) {
    window.history.replaceState(null, "", target);
    emit();
  } else if (window.location.hash !== target) {
    window.location.hash = target;
  } else {
    emit();
  }
}

function emit() {
  const route = currentRoute();
  listeners.forEach((listener) => listener(route));
}

export function onRoute(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startRouter() {
  window.addEventListener("hashchange", emit);
  if (!window.location.hash) {
    window.history.replaceState(null, "", "#/overview");
  }
}

export function refreshRoute() {
  emit();
}
