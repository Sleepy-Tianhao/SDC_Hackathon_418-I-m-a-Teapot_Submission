#!/usr/bin/env node
/**
 * Zero-dependency screenshot runner for the AI Career Navigator UI.
 *
 * It launches headless Edge with the DevTools protocol, waits until the SPA has
 * actually rendered, then captures full-page PNGs (and reports console errors).
 *
 * Usage:
 *   node tools/screenshot.mjs --base http://127.0.0.1:8000 --out docs/screenshots  *     --routes "/overview?sample=1=overview.png,/signals=signals.png" [--width 1440]
 *
 * Requires Microsoft Edge (Windows/macOS default paths) and Node 20+.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EDGE_CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/microsoft-edge",
];

function parseArgs(argv) {
  const args = {
    base: "http://127.0.0.1:8000",
    out: "docs/screenshots",
    routes: [],
    width: 1440,
    height: 1000,
    port: 9400 + Math.floor(Math.random() * 400),
    after: "",
    wait: 1200,
    keep: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--base") args.base = value;
    else if (key === "--out") args.out = value;
    else if (key === "--width") args.width = Number(value);
    else if (key === "--height") args.height = Number(value);
    else if (key === "--port") args.port = Number(value);
    else if (key === "--keep") args.keep = true;
    else if (key === "--after") args.after = value;
    else if (key === "--wait") args.wait = Number(value);
    else if (key === "--routes") {
      args.routes = value.split(",").map((entry) => {
        const index = entry.lastIndexOf("=");
        if (index < 0) return { route: entry, file: entry.replace(/[^a-z0-9]+/gi, "-") + ".png" };
        return { route: entry.slice(0, index), file: entry.slice(index + 1) };
      });
    }
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDevtools(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (response.ok) return await response.json();
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("DevTools endpoint did not start on port " + port);
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.console = [];
    this.errors = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method === "Runtime.consoleAPICalled") {
        const text = (message.params.args || [])
          .map((arg) => arg.value ?? arg.description ?? arg.type)
          .join(" ");
        this.console.push(message.params.type + ": " + text);
      }
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails || {};
        this.errors.push((details.exception && details.exception.description) || details.text || "Unknown exception");
      }
      if (message.method === "Page.javascriptDialogOpening") {
        this.send("Page.handleJavaScriptDialog", { accept: true });
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("CDP timeout: " + method));
        }
      }, 15000);
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result.result ? result.result.value : undefined;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.routes.length) {
    console.error("No routes given. Use --routes '/overview?sample=1=overview.png,...'");
    process.exit(1);
  }
  const edge = EDGE_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!edge) {
    console.error("Microsoft Edge was not found.");
    process.exit(1);
  }
  fs.mkdirSync(args.out, { recursive: true });

  const profile = path.join(os.tmpdir(), "aicn-shots-" + Date.now());
  const browser = spawn(
    edge,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      "--mute-audio",
      "--remote-debugging-port=" + args.port,
      "--user-data-dir=" + profile,
      "--window-size=" + args.width + "," + args.height,
      "about:blank",
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  browser.unref();

  let failures = 0;
  try {
    await waitForDevtools(args.port);
    await sleep(800);
    const created = await fetch("http://127.0.0.1:" + args.port + "/json/new?about:blank", { method: "PUT" });
    const target = await created.json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const cdp = new Cdp(socket);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: args.width,
      height: args.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const [index, { route, file }] of args.routes.entries()) {
      // Force a document load per route so the SPA boots from scratch (cache-busting query + hash route).
      const url =
        args.base.replace(/\/$/, "") + "/?shot=" + Date.now() + "-" + index + "#" + route.replace(/^#?/, "");
      cdp.console.length = 0;
      cdp.errors.length = 0;
      await cdp.send("Page.navigate", { url });

      let rendered = false;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await sleep(250);
        try {
          const state = await cdp.evaluate(
            "(() => { const v = document.querySelector('#view'); if (!v) return null; return { loading: !!v.querySelector('.loading-panel'), text: (v.innerText || '').trim().length, error: !!v.querySelector('.error-panel') }; })()",
          );
          if (state && !state.loading && state.text > 60) {
            rendered = true;
            break;
          }
          if (state && state.error) {
            rendered = true;
            break;
          }
        } catch {
          /* navigation in progress */
        }
      }
      await sleep(900);
      if (args.after) {
        try {
          const afterResult = await cdp.evaluate(args.after);
          if (afterResult !== undefined) console.log("  after => " + String(afterResult).slice(0, 500));
        } catch (error) {
          console.log("  after-script failed: " + error.message);
        }
        await sleep(args.wait || 1200);
      }
      try {
        const diag = await cdp.evaluate(
          "JSON.stringify({ ready: document.readyState, resources: performance.getEntriesByType('resource').length, sidebar: (document.querySelector('#sidebar')||{children:{length:0}}).children.length, route: (window.__AICN||{}).route, booted: (window.__AICN||{}).booted, errors: (window.__AICN||{}).errors, chips: [...document.querySelectorAll('[data-filter-momentum]')].map((b) => (b.className.includes('is-active') ? 'A' : '-') + ':' + b.textContent.trim()).join(' '), text: (document.querySelector('#view')||{innerText:''}).innerText.slice(0, 60), now: Math.round(performance.now()) })",
        );
        console.log("  diag " + diag);
      } catch (error) {
        console.log("  diag unavailable: " + error.message);
      }
      const metrics = await cdp.send("Page.getLayoutMetrics");
      const width = Math.max(320, Math.ceil(metrics.cssContentSize.width));
      const height = Math.min(7000, Math.max(400, Math.ceil(metrics.cssContentSize.height)));
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      });
      const outPath = path.join(args.out, file);
      const buffer = Buffer.from(shot.data, "base64");
      let lastError = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          fs.rmSync(outPath, { force: true });
          fs.writeFileSync(outPath, buffer);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          await sleep(400);
        }
      }
      if (lastError) throw lastError;
      const size = fs.statSync(outPath).size;
      console.log(
        (rendered ? "OK " : "WARN ") + file + "  " + width + "x" + height + "  " + Math.round(size / 1024) + "kB  " + route,
      );
      const noisy = cdp.errors.length > 0 || cdp.console.some((line) => line.startsWith("error:"));
      if (noisy) {
        failures += 1;
        console.log("  console:");
        [...cdp.errors, ...cdp.console].slice(0, 10).forEach((line) => {
          console.log("   " + String(line).split("\n")[0].slice(0, 220));
        });
      }
    }
    socket.close();
  } finally {
    if (!args.keep) {
      try {
        process.kill(-browser.pid);
      } catch {
        try {
          browser.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
      if (process.platform === "win32") {
        try {
          const { execSync } = await import("node:child_process");
          execSync("taskkill /PID " + browser.pid + " /T /F", { stdio: "ignore" });
        } catch {
          /* ignore */
        }
      }
    }
  }
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error("screenshot runner failed:", error.message);
  process.exit(1);
});