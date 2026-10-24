/**
 * Tiny DOM + templating layer.
 * Interpolations are HTML-escaped by default; wrap trusted markup with raw().
 */

const SAFE = Symbol("safe-html");

class SafeHtml {
  constructor(value) {
    this.value = String(value ?? "");
    this[SAFE] = true;
  }
  toString() {
    return this.value;
  }
}

export function raw(value) {
  return value instanceof SafeHtml ? value : new SafeHtml(value);
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function toHtml(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join("");
  return escapeHtml(value);
}

/** html\`<p>${userInput}</p>\` — escapes every interpolation unless wrapped with raw(). */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    out += toHtml(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function on(target, type, handler, options) {
  if (!target) return () => {};
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Delegated listener: on(root, "click", "[data-action]", handler) */
export function delegate(root, type, selector, handler) {
  return on(root, type, (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  });
}

export function setHtml(target, value) {
  if (!target) return;
  target.innerHTML = toHtml(value);
  return target;
}

export function focusMain() {
  const main = qs("#view");
  if (!main) return;
  main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
}

export function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const round = (value, digits = 0) => Number(Number(value).toFixed(digits));

export const fmt = {
  int(value) {
    return Number.isFinite(Number(value)) ? nf0.format(Number(value)) : "—";
  },
  dec(value) {
    return Number.isFinite(Number(value)) ? nf1.format(Number(value)) : "—";
  },
  pct(value, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits) + "%";
  },
  money(value, currency = "USD", opts = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const compact = opts.compact ?? n >= 10000;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 1 : 0,
      }).format(n);
    } catch {
      return currency + " " + nf0.format(n);
    }
  },
  range(min, max, currency = "USD") {
    return fmt.money(min, currency) + " – " + fmt.money(max, currency);
  },
  date(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  },
  dateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return fmt.date(value) + ", " + time;
  },
  relative(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const days = Math.round((Date.now() - d.getTime()) / 86400000);
    if (Math.abs(days) < 1) return "today";
    if (Math.abs(days) === 1) return days > 0 ? "yesterday" : "tomorrow";
    if (Math.abs(days) < 30) return days > 0 ? days + " days ago" : "in " + -days + " days";
    const months = Math.round(days / 30.4);
    if (Math.abs(months) < 12) return months > 0 ? months + " mo ago" : "in " + -months + " mo";
    const years = Math.round(months / 12);
    return years > 0 ? years + " yr ago" : "in " + -years + " yr";
  },
  list(items, fallback = "—") {
    const list = (items || []).filter(Boolean);
    if (!list.length) return fallback;
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
  },
  short(value, max = 140) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(" "));
    return cut.slice(0, end > 40 ? end : max).trimEnd() + "…";
  },
  initials(name) {
    return String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase();
  },
  title(value) {
    return String(value || "")
      .split(/[-_]/)
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
      .join(" ");
  },
};

export function percentWidth(value, max = 100) {
  const n = Number(value) || 0;
  return (clamp((n / max) * 100, 0, 100)).toFixed(1) + "%";
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const ICONS = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
  sparkles:
    '<path d="M12 3.2 13.8 8 18.6 9.8 13.8 11.6 12 16.4 10.2 11.6 5.4 9.8 10.2 8z"/><path d="m18.2 14.4.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>',
  activity: '<path d="M3 12h4l2.6-7.2L13.6 19l2.2-7H21"/>',
  layers: '<path d="m12 3 8.5 4.7L12 12.4 3.5 7.7z"/><path d="m3.5 12.6 8.5 4.7 8.5-4.7"/><path d="m3.5 16.9 8.5 4.7 8.5-4.7"/>',
  route: '<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 19H14a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h5.8"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.5 3.7 5.6 3.7 9s-1.3 6.5-3.7 9c-2.4-2.5-3.7-5.6-3.7-9s1.3-6.5 3.7-9z"/>',
  compare: '<rect x="3" y="4" width="7.5" height="16" rx="1.6"/><rect x="13.5" y="4" width="7.5" height="16" rx="1.6"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M7 8h10v4.2a5 5 0 0 1-10 0z"/><path d="M12 17.2V21"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20.2a7 7 0 0 1 14 0"/>',
  arrowRight: '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevronRight: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  chevronLeft: '<path d="M15 5.5 8.5 12 15 18.5"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 4.2v5.4h-5.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.4 20.4-4-4"/>',
  check: '<path d="m4.5 12.5 4.8 4.8L19.8 6.8"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3.5 2.6 20h18.8z"/><path d="M12 9.5v4.6"/><path d="M12 17.2v.4"/>',
  download: '<path d="M12 3.5v11.7"/><path d="m7 10.2 5 5 5-5"/><path d="M4.5 20.5h15"/>',
  printer: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
  moon: '<path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18.5 14v5.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1H10"/>',
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.5V12l3.2 2"/>',
  target: '<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
  trendUp: '<path d="m3.5 17 6-6 4.2 4.2L20.5 8"/><path d="M15 8h5.5v5.5"/>',
  trendDown: '<path d="m3.5 7 6 6 4.2-4.2 6.8 7.2"/><path d="M15 16h5.5v-5.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5v-1a1 1 0 0 0-1-1h-10a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/>',
  info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11v5.2"/><path d="M12 7.8v.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.8 7l1 12.6a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L17.2 7"/>',
  save: '<path d="M5 3.5h11l3.5 3.5v13.5H5z"/><path d="M8.5 3.5V9h7V3.5"/><path d="M8.5 14h7v6.5h-7z"/>',
  database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  leaf: '<path d="M20 4c-8 0-13 3.5-13 9a6 6 0 0 0 6 6c5.5 0 7-6 7-15z"/><path d="M4 20c1.5-5 4.5-8 9-10"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="11" width="3.2" height="6"/><rect x="12.4" y="7" width="3.2" height="10"/><rect x="17.8" y="13" width="2.2" height="4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-1.6 3.4L16 11H5"/>',
  book: '<path d="M4 4.5h6a2.5 2.5 0 0 1 2 2v13a2 2 0 0 0-2-2H4z"/><path d="M20 4.5h-6a2.5 2.5 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2"/><path d="M17.5 14.2A6 6 0 0 1 21 20"/>',
  filter: '<path d="M3.5 5.5h17l-6.5 7.6V20l-4-2v-4.9z"/>',
  sliders: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="7" cy="16" r="2"/>',
  play: '<path d="M8 5.5 19 12 8 18.5z"/>',
  code: '<path d="m8.5 8-4 4 4 4"/><path d="m15.5 8 4 4-4 4"/><path d="m13 5-2 14"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  building: '<path d="M4 21V5.5L12 3l8 2.5V21"/><path d="M9 21v-5h6v5"/><path d="M8 9h1.5M8 13h1.5M14.5 9H16M14.5 13H16"/>',
  link: '<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5"/><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12.5 17"/>',
  bolt: '<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>',
  eye:
    '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  logout: '<path d="M15 4.5h4.5v15H15"/><path d="M11 8.5 14.5 12 11 15.5"/><path d="M3.5 12h10.5"/>',
  plusCircle: '<circle cx="12" cy="12" r="8.8"/><path d="M12 8v8M8 12h8"/>',
  minus: '<path d="M5 12h14"/>',
};

export function icon(name, size = 18, className = "") {
  const body = ICONS[name] || ICONS.info;
  return raw(
    '<svg class="icon ' + className + '" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      body + "</svg>",
  );
}

export function hasIcon(name) {
  return Boolean(ICONS[name]);
}

/* ------------------------------------------------------------------ */
/* Misc                                                               */
/* ------------------------------------------------------------------ */

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function uid(prefix = "id") {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
