/** Small dependency-free SVG charts. */

import { html, raw } from "./dom.js";

export function radarChart(axes, options = {}) {
  const size = options.size || 280;
  const max = options.max || 100;
  const center = size / 2;
  const radius = size / 2 - (options.padding || 44);
  const count = Math.max(3, axes.length);
  const angle = (2 * Math.PI) / count;
  const start = -Math.PI / 2;

  const point = (value, index, r) => {
    const a = start + angle * index;
    const distance = (Math.max(0, Math.min(max, value)) / max) * r;
    return [center + Math.cos(a) * distance, center + Math.sin(a) * distance];
  };

  const rings = [0.25, 0.5, 0.75, 1].map((scale) => {
    const pts = axes
      .map((_, index) => {
        const [x, y] = point(max * scale, index, radius);
        return x.toFixed(1) + "," + y.toFixed(1);
      })
      .join(" ");
    return html`<polygon class="radar__ring" points="${pts}" />`;
  });

  const spokes = axes.map((_, index) => {
    const [x, y] = point(max, index, radius);
    return html`<line class="radar__spoke" x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;
  });

  const shape = axes
    .map((axis, index) => {
      const [x, y] = point(axis.value, index, radius);
      return x.toFixed(1) + "," + y.toFixed(1);
    })
    .join(" ");

  const dots = axes.map((axis, index) => {
    const [x, y] = point(axis.value, index, radius);
    return html`<circle class="radar__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" />`;
  });

  const labels = axes.map((axis, index) => {
    const [x, y] = point(max, index, radius + 18);
    const cos = Math.cos(start + angle * index);
    const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
    return html`<text class="radar__label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"
      dominant-baseline="middle">${axis.label}</text>
      <text class="radar__value" x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" text-anchor="${anchor}"
      dominant-baseline="middle">${Math.round(axis.value)}</text>`;
  });

  return html`<svg class="radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${options.label || "Capability radar"}">
    ${rings}${spokes}
    <polygon class="radar__shape" points="${shape}" />
    ${dots}${labels}
  </svg>`;
}

export function donutChart(segments, options = {}) {
  const size = options.size || 160;
  const thickness = options.thickness || 16;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + (Number(segment.value) || 0), 0) || 1;
  let offset = 0;
  const arcs = segments.map((segment) => {
    const value = Number(segment.value) || 0;
    const length = (value / total) * circumference;
    const dash = length.toFixed(2) + " " + (circumference - length).toFixed(2);
    const rotation = (offset / circumference) * 360 - 90;
    offset += length;
    return html`<circle class="donut__arc" cx="${size / 2}" cy="${size / 2}" r="${radius}"
      stroke="${segment.color || "var(--brand)"}" stroke-width="${thickness}"
      stroke-dasharray="${dash}" transform="rotate(${rotation.toFixed(2)} ${size / 2} ${size / 2})">
      <title>${segment.label}: ${value}</title>
    </circle>`;
  });
  return html`<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${options.label || "Breakdown"}">
      <circle class="donut__track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${thickness}" />
      ${arcs}
      ${options.center
        ? html`<text class="donut__center" x="${size / 2}" y="${size / 2 - 4}" text-anchor="middle">${options.center}</text>
            <text class="donut__center-sub" x="${size / 2}" y="${size / 2 + 14}" text-anchor="middle">${options.centerLabel || ""}</text>`
        : ""}
    </svg>
    ${options.legend === false
      ? ""
      : html`<ul class="legend">${segments.map(
          (segment) => html`<li><span class="legend__dot" style="background:${segment.color}"></span>
            <span class="legend__label">${segment.label}</span>
            <span class="legend__value">${segment.display || segment.value}</span></li>`,
        )}</ul>`}
  </div>`;
}

export function sparkline(values, options = {}) {
  const width = options.width || 120;
  const height = options.height || 34;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return x.toFixed(1) + "," + y.toFixed(1);
  });
  const area = "0," + height + " " + points.join(" ") + " " + width + "," + height;
  return html`<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <polygon class="spark__area" points="${area}" />
    <polyline class="spark__line" points="${points.join(" ")}" />
  </svg>`;
}

export function deltaBar(value, options = {}) {
  const pct = Math.max(-100, Math.min(100, Number(value) || 0));
  const width = Math.abs(pct) / 2;
  return html`<span class="delta ${pct >= 0 ? "delta--up" : "delta--down"}">
    ${raw(pct >= 0 ? "+" : "")}${pct}
    <span class="delta__track"><span class="delta__fill" style="width:${width.toFixed(1)}%"></span></span>
  </span>`;
}

export function meterRow({ label, value, max = 5, hint = "", tone = "brand" }) {
  const pct = (Math.max(0, Math.min(max, value)) / max) * 100;
  return html`<div class="meter-row">
    <div class="meter-row__top"><span>${label}</span><strong>${hint || value + "/" + max}</strong></div>
    <div class="bar bar--${tone}"><span class="bar__fill" style="width:${pct.toFixed(1)}%"></span></div>
  </div>`;
}