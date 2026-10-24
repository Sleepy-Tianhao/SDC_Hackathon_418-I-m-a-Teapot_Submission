/** Reusable UI primitives: headers, badges, meters, toasts, modals, states. */

import { escapeHtml, fmt, html, icon, qs, raw } from "./dom.js";

export function pageHeader({ eyebrow, title, lead, actions = "", meta = "" }) {
  return html`<header class="page-head reveal">
    ${eyebrow ? html`<p class="eyebrow">${icon("compass", 14)} <span>${eyebrow}</span></p>` : ""}
    <div class="page-head__row">
      <h1 class="page-title">${title}</h1>
      ${actions ? html`<div class="page-head__actions">${actions}</div>` : ""}
    </div>
    ${lead ? html`<p class="page-lead">${lead}</p>` : ""}
    ${meta ? html`<div class="page-meta">${meta}</div>` : ""}
  </header>`;
}

export function sectionHeader({ title, description = "", action = "", id = "" }) {
  return html`<div class="section-head" ${id ? raw('id="' + escapeHtml(id) + '"') : ""}>
    <div>
      <h2 class="section-title">${title}</h2>
      ${description ? html`<p class="section-desc">${description}</p>` : ""}
    </div>
    ${action ? html`<div class="section-action">${action}</div>` : ""}
  </div>`;
}

const TONES = ["brand", "neutral", "success", "warning", "danger", "violet", "gold", "info"];

export function badge(text, options = {}) {
  const tone = TONES.includes(options.tone) ? options.tone : "neutral";
  const dot = options.dot ? html`<span class="badge__dot"></span>` : "";
  const iconName = options.icon ? icon(options.icon, 13) : "";
  return html`<span class="badge badge--${tone} ${options.className || ""}">${dot}${iconName}${text}</span>`;
}

export function chip(text, options = {}) {
  const tag = options.tag || "span";
  const attrs = options.attrs || {};
  const attrText = raw(
    Object.entries(attrs)
      .map(([key, value]) => " " + key + '="' + escapeHtml(value) + '"')
      .join(""),
  );
  return html`<${raw(tag)} class="chip ${options.tone ? "chip--" + options.tone : ""} ${options.className || ""}"${attrText}>${
    options.icon ? icon(options.icon, 13) : ""
  }${text}</${raw(tag)}>`;
}

const MOMENTUM = {
  rising: { label: "Rising", icon: "trendUp", tone: "success" },
  stable: { label: "Stable", icon: "minus", tone: "neutral" },
  declining: { label: "Declining", icon: "trendDown", tone: "danger" },
};

export function momentumBadge(momentum) {
  const entry = MOMENTUM[momentum] || MOMENTUM.stable;
  return html`<span class="momentum momentum--${escapeHtml(momentum)}">${icon(entry.icon, 14)}${entry.label}</span>`;
}

export function trendBadge(trend) {
  const map = {
    rising: { label: "Demand rising", tone: "success", icon: "trendUp" },
    stable: { label: "Demand stable", tone: "neutral", icon: "minus" },
    declining: { label: "Demand declining", tone: "danger", icon: "trendDown" },
  };
  const entry = map[trend] || map.stable;
  return badge(entry.label, { tone: entry.tone, icon: entry.icon });
}

export function scoreTone(score) {
  if (score >= 70) return "success";
  if (score >= 55) return "brand";
  if (score >= 40) return "gold";
  return "danger";
}

export function scoreRing(value, options = {}) {
  const size = options.size || 132;
  const stroke = options.stroke || 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const offset = circumference - (pct / 100) * circumference;
  const tone = options.tone || scoreTone(pct);
  const gradientId = "ring-" + Math.random().toString(36).slice(2, 8);
  return html`<div class="score-ring score-ring--${tone}" style="--ring-size:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img"
      aria-label="${options.label || "Score"}: ${Math.round(pct)} out of 100">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--ring-from)" />
          <stop offset="100%" stop-color="var(--ring-to)" />
        </linearGradient>
      </defs>
      <circle class="score-ring__track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}" />
      <circle class="score-ring__value" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"
        stroke="url(#${gradientId})" stroke-dasharray="${circumference.toFixed(1)}"
        stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})" />
    </svg>
    <div class="score-ring__label">
      <strong>${Math.round(pct)}</strong>
      <span>${options.label || "/ 100"}</span>
    </div>
  </div>`;
}

export function progressBar(value, options = {}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return html`<div class="bar bar--${options.tone || "brand"} ${options.className || ""}" role="progressbar"
    aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"
    ${options.label ? raw('aria-label="' + escapeHtml(options.label) + '"') : ""}>
    <span class="bar__fill" style="width:${pct.toFixed(1)}%"></span>
  </div>`;
}

export function levelDots(level, options = {}) {
  const max = options.max || 5;
  const dots = [];
  for (let i = 1; i <= max; i += 1) {
    dots.push(html`<span class="level-dot ${i <= level ? "is-on" : ""}"></span>`);
  }
  return html`<span class="level-dots" role="img" aria-label="Level ${level} of ${max}">${dots}</span>`;
}

export function statCard({ label, value, hint = "", icon: iconName = "", tone = "brand", trend = "", action = "" }) {
  return html`<div class="stat-card stat-card--${tone} reveal">
    <div class="stat-card__top">
      <span class="stat-card__label">${label}</span>
      ${iconName ? html`<span class="stat-card__icon">${icon(iconName, 17)}</span>` : ""}
    </div>
    <div class="stat-card__value">${value}</div>
    ${trend ? html`<div class="stat-card__trend">${trend}</div>` : ""}
    ${hint ? html`<p class="stat-card__hint">${hint}</p>` : ""}
    ${action ? html`<div class="stat-card__action">${action}</div>` : ""}
  </div>`;
}

export function emptyState({ icon: iconName = "compass", title, body = "", action = "", compact = false }) {
  return html`<div class="empty ${compact ? "empty--compact" : ""}">
    <span class="empty__icon">${icon(iconName, 26)}</span>
    <h3 class="empty__title">${title}</h3>
    ${body ? html`<p class="empty__body">${body}</p>` : ""}
    ${action ? html`<div class="empty__action">${action}</div>` : ""}
  </div>`;
}

export function skeletonBlock(className = "") {
  return html`<div class="skeleton ${className}"></div>`;
}

export function skeletonCards(count = 3, className = "skeleton-card") {
  return html`<div class="skeleton-grid">${Array.from({ length: count }, () => html`<div class="skeleton ${className}"></div>`)}</div>`;
}

export function loadingPanel(message = "Loading…") {
  return html`<div class="loading-panel">
    <span class="spinner" aria-hidden="true"></span>
    <span>${message}</span>
  </div>`;
}

export function errorPanel({ title = "Something went wrong", message = "", code = "", retry = true, extra = "" }) {
  return html`<div class="error-panel" role="alert">
    <span class="error-panel__icon">${icon("alert", 22)}</span>
    <div>
      <h3>${title}</h3>
      <p>${message}</p>
      ${code ? html`<p class="error-panel__code">${code}</p>` : ""}
      ${extra}
      ${retry ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="retry">${icon("refresh", 15)} Retry</button>` : ""}
    </div>
  </div>`;
}

export function btn({ label, icon: iconName = "", action = "", tone = "primary", size = "", type = "button", data = {}, href = "", disabled = false, title = "", className = "" }) {
  const classes = ["btn", "btn--" + tone, size ? "btn--" + size : "", className].filter(Boolean).join(" ");
  const attrs = raw(
    Object.entries(data)
      .map(([key, value]) => " data-" + key + '="' + escapeHtml(value) + '"')
      .join(""),
  );
  const inner = html`${iconName ? icon(iconName, size === "sm" ? 15 : 17) : ""}${label ? html`<span>${label}</span>` : ""}`;
  if (href) {
    const external = /^https?:/i.test(href);
    return html`<a class="${classes}" href="${href}" ${external ? raw('target="_blank" rel="noopener noreferrer"') : ""} ${title ? raw('title="' + escapeHtml(title) + '"') : ""}${attrs}>${inner}</a>`;
  }
  return html`<button class="${classes}" type="${type}" ${action ? raw('data-action="' + escapeHtml(action) + '"') : ""}
    ${disabled ? raw("disabled") : ""} ${title ? raw('title="' + escapeHtml(title) + '"') : ""}${attrs}>${inner}</button>`;
}

export function iconButton(iconName, options = {}) {
  return html`<button class="icon-btn ${options.className || ""}" type="button"
    aria-label="${options.label || "Action"}" ${options.action ? raw('data-action="' + escapeHtml(options.action) + '"') : ""}
    ${options.title ? raw('title="' + escapeHtml(options.title) + '"') : ""}>${icon(iconName, options.size || 18)}</button>`;
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

const TOAST_ICONS = { success: "check", danger: "alert", warning: "alert", info: "info", brand: "sparkles" };

export function toast(message, options = {}) {
  const root = qs("#toast-root");
  if (!root) return null;
  const tone = TOAST_ICONS[options.tone] ? options.tone : "info";
  const node = document.createElement("div");
  node.className = "toast toast--" + tone;
  node.setAttribute("role", "status");
  node.innerHTML = html`<span class="toast__icon">${icon(TOAST_ICONS[tone], 16)}</span>
    <div class="toast__body">
      ${options.title ? html`<strong>${options.title}</strong>` : ""}
      <span>${message}</span>
    </div>
    <button class="toast__close" type="button" aria-label="Dismiss">${icon("x", 14)}</button>`.value;
  root.appendChild(node);
  const remove = () => {
    node.classList.add("is-leaving");
    window.setTimeout(() => node.remove(), 220);
  };
  node.querySelector(".toast__close").addEventListener("click", remove);
  window.setTimeout(remove, options.duration || 4600);
  return node;
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

let lastFocused = null;
let keyHandler = null;

export function openModal({ title, eyebrow = "", body, footer = "", size = "md", className = "" }) {
  const root = qs("#modal-root");
  if (!root) return { close: () => {} };
  lastFocused = document.activeElement;
  root.innerHTML = html`<div class="modal-backdrop" data-modal-close="true">
    <div class="modal modal--${size} ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal__head">
        <div>
          ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ""}
          <h2 id="modal-title" class="modal__title">${title}</h2>
        </div>
        <button class="icon-btn" type="button" aria-label="Close dialog" data-modal-close="true">${icon("x", 18)}</button>
      </header>
      <div class="modal__body">${body}</div>
      ${footer ? html`<footer class="modal__foot">${footer}</footer>` : ""}
    </div>
  </div>`.value;
  root.classList.add("is-open");
  document.body.classList.add("is-locked");

  const close = () => closeModal();
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest("[data-modal-close]")) close();
  });

  keyHandler = (event) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      root.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", keyHandler);
  window.setTimeout(() => {
    const target = root.querySelector(".modal__body button, .modal__body input, .modal__foot .btn, .modal__head button");
    if (target) target.focus();
  }, 30);

  return { close };
}

export function closeModal() {
  const root = qs("#modal-root");
  if (!root) return;
  root.classList.remove("is-open");
  root.innerHTML = "";
  document.body.classList.remove("is-locked");
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = null;
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  lastFocused = null;
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", tone = "danger", onConfirm }) {
  const modal = openModal({
    title,
    size: "sm",
    body: html`<p class="modal-copy">${message}</p>`,
    footer: html`<button class="btn btn--ghost" type="button" data-modal-close="true">Cancel</button>
      <button class="btn btn--${tone}" type="button" data-confirm="true">${confirmLabel}</button>`,
  });
  const root = qs("#modal-root");
  const confirm = root.querySelector("[data-confirm]");
  if (confirm) {
    confirm.addEventListener("click", () => {
      modal.close();
      onConfirm();
    });
  }
  return modal;
}

export function copyButton(text, label = "Copy") {
  return html`<button class="btn btn--ghost btn--sm" type="button" data-copy="${text}">${icon("copy", 15)} ${label}</button>`;
}

export function inlineMeta(items) {
  return html`<ul class="inline-meta">${items
    .filter(Boolean)
    .map((item) => html`<li>${item.icon ? icon(item.icon, 14) : ""}<span>${item.label}</span></li>`)}</ul>`;
}

export function kpiLine(label, value) {
  return html`<div class="kpi-line"><span>${label}</span><strong>${value}</strong></div>`;
}

export function keyValueList(rows) {
  return html`<dl class="kv">
    ${rows
      .filter(Boolean)
      .map(
        (row) => html`<div class="kv__row"><dt>${row.label}</dt><dd>${row.value}</dd></div>`,
      )}
  </dl>`;
}

export function timeAgo(value) {
  return html`<span class="time-ago" title="${fmt.dateTime(value)}">${fmt.relative(value)}</span>`;
}
