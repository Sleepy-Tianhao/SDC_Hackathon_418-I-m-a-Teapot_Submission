/**
 * Demo engine: deterministic scoring, pathway assembly and narrative streaming
 * built from the JSON fixtures in src/frontend/mock/.
 * Used when the live backend is unavailable (mode "demo") and for design review.
 */

import { clamp, round } from "./dom.js";

const DATA_ROOT = new URL("../../mock/", import.meta.url);
const PROFILE_KEY = "aicn:demo-profile:v1";

const jsonCache = new Map();

async function loadJson(name) {
  if (!jsonCache.has(name)) {
    const url = new URL(name, DATA_ROOT);
    const promise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("Demo data request failed (" + response.status + ")");
        return response.json();
      })
      .catch((error) => {
        jsonCache.delete(name);
        throw new Error(
          "Demo dataset could not be loaded from " + url.pathname + ". Serve the frontend over HTTP (see docs). " + error.message,
        );
      });
    jsonCache.set(name, promise);
  }
  return jsonCache.get(name);
}

export async function loadDemoData() {
  const [catalog, signals, modules] = await Promise.all([
    loadJson("catalog.json"),
    loadJson("signals.json"),
    loadJson("modules.json"),
  ]);
  return { catalog, signals, modules };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = (ms = 240) => wait(ms + Math.round(Math.random() * 120));

export const INTEREST_ROLE_MAP = {
  ai: ["ai-ops-analyst", "ai-product-owner", "ai-ethics-officer", "human-ai-interaction-designer", "data-governance-specialist"],
  public: ["civic-tech-program-manager", "workforce-transition-coach", "data-governance-specialist", "ai-ethics-officer"],
  climate: ["green-supply-chain-analyst", "climate-data-steward", "energy-systems-analyst"],
  health: ["healthcare-automation-specialist", "ai-ethics-officer"],
  design: ["human-ai-interaction-designer", "ai-product-owner", "civic-tech-program-manager"],
  data: ["data-governance-specialist", "climate-data-steward", "energy-systems-analyst", "ai-ops-analyst"],
  security: ["cyber-resilience-analyst", "data-governance-specialist"],
  people: ["workforce-transition-coach", "human-ai-interaction-designer"],
  governance: ["ai-ethics-officer", "data-governance-specialist", "civic-tech-program-manager"],
};

export const SAMPLE_PROFILE = {
  name: "Aisha Rahman",
  headline: "Operations coordinator moving into AI-enabled public services",
  currentRole: "Operations Coordinator",
  sector: "Public sector",
  region: "Singapore",
  yearsExperience: 7,
  education: "Diploma / vocational",
  skills: [
    { skillId: "data-literacy", level: 3 },
    { skillId: "stakeholder-comms", level: 4 },
    { skillId: "critical-evaluation", level: 3 },
    { skillId: "process-design", level: 3 },
    { skillId: "sql", level: 2 },
    { skillId: "automation", level: 3 },
    { skillId: "prompt-engineering", level: 2 },
    { skillId: "model-evaluation", level: 2 },
    { skillId: "ai-governance", level: 1 },
    { skillId: "project-management", level: 3 },
    { skillId: "change-facilitation", level: 2 },
    { skillId: "systems-thinking", level: 3 },
  ],
  interests: ["ai", "public", "people"],
  constraints: { hoursPerWeek: 8, budget: 300, remoteOnly: false },
  goal: "Move into an AI-facing role without leaving public service",
  source: "sample",
};

export function newId(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return prefix + "-" + Date.now().toString(36) + random;
}

export function levelOf(profile, skillId) {
  const found = (profile?.skills || []).find((skill) => skill.skillId === skillId);
  return found ? Number(found.level) || 1 : 1;
}

export function enrichProfile(input, catalog) {
  const skills = (input.skills || []).map((item) => {
    const meta = (catalog?.skills || []).find((skill) => skill.id === item.skillId) || {};
    return {
      skillId: item.skillId,
      name: meta.name || item.name || item.skillId,
      category: meta.category || item.category || "Other",
      level: clamp(Number(item.level) || 1, 1, 5),
    };
  });
  const now = new Date().toISOString();
  return {
    id: input.id || newId("prof"),
    name: String(input.name || "Anonymous learner").trim() || "Anonymous learner",
    headline: String(input.headline || "").trim(),
    currentRole: String(input.currentRole || "").trim(),
    sector: input.sector || "Other",
    region: input.region || "Global",
    yearsExperience: clamp(Number(input.yearsExperience) || 0, 0, 50),
    education: input.education || "Other",
    skills,
    interests: Array.isArray(input.interests) ? input.interests.slice(0, 6) : [],
    constraints: {
      hoursPerWeek: clamp(Number(input.constraints?.hoursPerWeek) || 8, 1, 40),
      budget: Math.max(0, Number(input.constraints?.budget) || 0),
      remoteOnly: Boolean(input.constraints?.remoteOnly),
    },
    goal: String(input.goal || "").trim(),
    createdAt: input.createdAt || now,
    updatedAt: now,
    source: input.source || "web",
  };
}

function roleInterestMatch(roleId, interests) {
  return (interests || []).some((interest) => (INTEREST_ROLE_MAP[interest] || []).includes(roleId));
}

function sectorOverlap(profile, role) {
  if (!profile.sector || !role.sector) return 0;
  if (profile.sector === role.sector) return 1;
  if (role.sector === "Cross-sector" || profile.sector === "Other") return 0.5;
  return 0;
}

function scoreRole(profile, role, scenarioDelta) {
  let covered = 0;
  let total = 0;
  let gapWeighted = 0;
  let requiredWeighted = 0;

  const gaps = role.requiredSkills.map((req) => {
    const current = levelOf(profile, req.skillId);
    const gap = Math.max(0, req.level - current);
    covered += Math.min(current / req.level, 1) * req.importance;
    total += req.importance;
    gapWeighted += gap * req.importance;
    requiredWeighted += req.level * req.importance;
    return { ...req, currentLevel: current, gap, priority: gap * req.importance };
  });

  const coverage = total ? covered / total : 0;
  const experience = clamp((Number(profile.yearsExperience) || 0) / 12, 0, 1);
  const sector = sectorOverlap(profile, role);
  const interest = roleInterestMatch(role.id, profile.interests) ? 1 : 0;
  const rawFit = coverage * 86 + experience * 5 + sector * 4 + interest * 5;
  const fit = clamp(round(rawFit + (scenarioDelta || 0)), 3, 99);
  const gapScore = requiredWeighted ? round((gapWeighted / requiredWeighted) * 100) : 0;

  return {
    fit,
    gapScore,
    gaps,
    coverage,
  };
}

function buildReasonList(match, scenario, scenarioNote) {
  const reasons = [];
  const strong = match.gaps.filter((item) => item.gap === 0).sort((a, b) => b.importance - a.importance).slice(0, 2);
  if (strong.length) {
    reasons.push(strong.map((item) => item.name).join(" and ") + " already meet this role's requirement.");
  }
  const critical = match.gaps
    .filter((item) => item.gap > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2);
  if (critical.length) {
    reasons.push(
      "Largest gaps: " +
        critical.map((item) => item.name + " (" + item.currentLevel + " of " + item.requiredLevel + ")").join(", ") +
        ".",
    );
  }
  if (scenario && scenario.id !== "baseline" && scenarioNote) reasons.push(scenarioNote);
  return reasons;
}

export function buildMatches(profile, scenarioId, catalog) {
  const scenario = (catalog.scenarios || []).find((item) => item.id === scenarioId) || catalog.scenarios[0];
  const matches = catalog.roles.map((role) => {
    const adjustment = scenario?.roleAdjustments?.[role.id] || { fitDelta: 0, demandDelta: 0 };
    const scored = scoreRole(profile, role, adjustment.fitDelta);
    const baseline = scoreRole(profile, role, 0);
    const gaps = scored.gaps
      .map((item) => {
        const meta = (catalog.skills || []).find((skill) => skill.id === item.skillId) || {};
        return {
          skillId: item.skillId,
          name: meta.name || item.skillId,
          category: meta.category || "Other",
          currentLevel: item.currentLevel,
          requiredLevel: item.level,
          importance: item.importance,
          gap: item.gap,
          priority: item.priority,
        };
      })
      .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

    return {
      roleId: role.id,
      title: role.title,
      family: role.family,
      sector: role.sector,
      summary: role.summary,
      outlook: role.outlook,
      demandIndex: role.demandIndex,
      demandTrend: role.demandTrend,
      automationRisk: role.automationRisk,
      salary: role.salary,
      fitScore: scored.fit,
      baselineFit: clamp(round(baseline.fit), 3, 99),
      fitDelta: scored.fit - clamp(round(baseline.fit), 3, 99),
      gapScore: scored.gapScore,
      skillsGap: gaps.filter((item) => item.gap > 0),
      matchedSkills: gaps.filter((item) => item.gap === 0),
      sdgs: role.sdgs,
      scenarioNote: adjustment.note || "",
      reasons: buildReasonList({ gaps }, scenario, adjustment.note),
    };
  });

  matches.sort((a, b) => b.fitScore - a.fitScore || b.demandIndex - a.demandIndex);

  const top = matches.slice(0, 3);
  const weights = [0.5, 0.3, 0.2];
  const readiness = top.reduce((sum, match, index) => sum + match.fitScore * weights[index], 0);
  const gapSkills = new Set();
  top.forEach((match) => match.skillsGap.forEach((gap) => gapSkills.add(gap.skillId)));

  return {
    profileId: profile.id,
    scenarioId: scenario.id,
    generatedAt: new Date().toISOString(),
    model: "career-match:v1.3",
    matches,
    summary: {
      readinessScore: round(readiness),
      topRoleId: top[0]?.roleId || null,
      topRoleTitle: top[0]?.title || null,
      topFit: top[0]?.fitScore || 0,
      skillsToClose: gapSkills.size,
      coveragePct: round(
        (100 *
          top.reduce((sum, match) => sum + match.matchedSkills.length, 0)) /
          Math.max(
            1,
            top.reduce((sum, match) => sum + match.matchedSkills.length + match.skillsGap.length, 0),
          ),
      ),
      topMatches: top.map((match) => ({ roleId: match.roleId, title: match.title, fitScore: match.fitScore })),
    },
  };
}

function pickModule(skillId, currentLevel, modules) {
  const candidates = modules.filter((module) => module.kind === "module" && module.teaches.includes(skillId));
  if (!candidates.length) return null;
  const target = currentLevel <= 2 ? "foundation" : "intermediate";
  const rank = { foundation: 0, intermediate: 1, advanced: 2 };
  return [...candidates].sort((a, b) => {
    const rankDelta = Math.abs(rank[a.level] - rank[target]) - Math.abs(rank[b.level] - rank[target]);
    if (rankDelta !== 0) return rankDelta;
    if (a.hours !== b.hours) return a.hours - b.hours;
    return a.cost - b.cost;
  })[0];
}

function genericModule(id, title, provider, teaches, hours, level) {
  return {
    id,
    title,
    provider,
    url: "",
    format: "workshop",
    kind: "module",
    hours,
    cost: 0,
    currency: "USD",
    level,
    teaches,
    credential: "Internal record",
    outcome: "Mentor-led practice with a reviewed artefact.",
  };
}

function phaseWeeks(hours, hoursPerWeek) {
  return Math.max(1, Math.ceil(hours / Math.max(1, hoursPerWeek)));
}

export function buildPathway(profile, matchResult, scenarioId, catalog, modules, roleIdOverride) {
  const roleId = roleIdOverride || matchResult.summary.topRoleId;
  const match = matchResult.matches.find((item) => item.roleId === roleId) || matchResult.matches[0];
  const role = catalog.roles.find((item) => item.id === match.roleId) || catalog.roles[0];
  const hoursPerWeek = clamp(Number(profile.constraints?.hoursPerWeek) || 8, 1, 40);

  const gaps = [...match.skillsGap].sort((a, b) => b.priority - a.priority);
  const selected = gaps.slice(0, 9);
  const buckets = { foundation: [], intermediate: [], advanced: [] };
  const coveredIds = new Set();

  selected.forEach((gap) => {
    const module = pickModule(gap.skillId, gap.currentLevel, modules);
    if (!module) return;
    if (coveredIds.has(module.id)) return;
    coveredIds.add(module.id);
    buckets[module.level]?.push(module);
  });

  if (!buckets.foundation.length) {
    if (buckets.intermediate.length) {
      buckets.foundation.push(buckets.intermediate.shift());
    } else {
      buckets.foundation.push(
        genericModule("mod-orientation", "Orientation sprint", "AI Career Navigator", selected.slice(0, 2).map((gap) => gap.skillId), 4, "foundation"),
      );
    }
  }

  const portfolio = modules.find((module) => module.id === "mod-portfolio-1");
  const capstone = modules.find((module) => module.id === "mod-capstone-1");
  if (portfolio) buckets.advanced.push(portfolio);
  if (capstone) buckets.advanced.push(capstone);

  const phaseMeta = [
    {
      id: "phase-1",
      title: "Foundations & orientation",
      goal: "Close the baseline gaps that every later step depends on.",
      modules: buckets.foundation,
      milestones: [
        { title: "Starting-level diagnostic", detail: "Confirm your real level with a short practical task, not self-report.", week: 1 },
        { title: "First artefact", detail: "Produce one small piece of evidence from the foundation module.", week: null },
      ],
    },
    {
      id: "phase-2",
      title: "Role-specific capability",
      goal: "Build the capabilities this role is actually hired for.",
      modules: buckets.intermediate,
      milestones: [
        { title: "Peer review", detail: "Have a practitioner review one output against the role's bar.", week: null },
        { title: "Role simulation", detail: "Complete a task that mirrors the target role's weekly work.", week: null },
      ],
    },
    {
      id: "phase-3",
      title: "Evidence & transition",
      goal: "Turn learning into artefacts a hiring panel can verify.",
      modules: buckets.advanced,
      milestones: [
        { title: "Portfolio published", detail: "Two artefacts, each with a short decision memo.", week: null },
        { title: "Interview-ready", detail: "Defend a scenario decision with evidence and trade-offs.", week: null },
      ],
    },
  ];

  let cursorWeek = 0;
  const phases = phaseMeta.map((phase) => {
    const modulesInPhase = phase.modules.map((module) => {
      const teaches = module.teaches || [];
      const matchedGaps = gaps.filter((gap) => teaches.includes(gap.skillId));
      return {
        ...module,
        teaches,
        targets: matchedGaps.map((gap) => ({
          skillId: gap.skillId,
          name: gap.name,
          fromLevel: gap.currentLevel,
          toLevel: gap.requiredLevel,
        })),
      };
    });
    const hours = modulesInPhase.reduce((sum, module) => sum + (Number(module.hours) || 0), 0);
    const cost = modulesInPhase.reduce((sum, module) => sum + (Number(module.cost) || 0), 0);
    const weeks = phaseWeeks(hours, hoursPerWeek);
    const startWeek = cursorWeek + 1;
    cursorWeek += weeks;
    const milestones = phase.milestones.map((milestone, index) => ({
      ...milestone,
      week: milestone.week || (index === 0 ? startWeek : startWeek + weeks - 1),
    }));
    return {
      id: phase.id,
      title: phase.title,
      goal: phase.goal,
      weeks,
      hours,
      cost,
      startWeek,
      endWeek: cursorWeek,
      modules: modulesInPhase,
      milestones,
    };
  });

  const totalHours = phases.reduce((sum, phase) => sum + phase.hours, 0);
  const totalCost = phases.reduce((sum, phase) => sum + phase.cost, 0);
  const coveredSkillIds = new Set();
  phases.forEach((phase) => phase.modules.forEach((module) => module.teaches.forEach((skillId) => coveredSkillIds.add(skillId))));

  const covers = gaps.map((gap) => ({
    skillId: gap.skillId,
    name: gap.name,
    fromLevel: gap.currentLevel,
    requiredLevel: gap.requiredLevel,
    toLevel: coveredSkillIds.has(gap.skillId) ? Math.min(gap.requiredLevel, gap.currentLevel + 2) : gap.currentLevel,
    covered: coveredSkillIds.has(gap.skillId),
    moduleIds: phases
      .flatMap((phase) => phase.modules)
      .filter((module) => module.teaches.includes(gap.skillId))
      .map((module) => module.id),
  }));

  const coveredGaps = covers.filter((item) => item.covered).length;
  const coveredPct = gaps.length ? coveredGaps / gaps.length : 1;
  const readinessFrom = matchResult.summary.readinessScore;
  const readinessTo = Math.min(95, round(readinessFrom + 8 + coveredPct * 18));

  const notes = [];
  const uncovered = covers.filter((item) => !item.covered);
  if (uncovered.length) {
    notes.push(
      uncovered.length +
        " gap skill(s) are not covered by the curated catalogue: " +
        uncovered.map((item) => item.name).join(", ") +
        ". Add a work-based rotation or mentor review.",
    );
  }
  const scenario = catalog.scenarios.find((item) => item.id === scenarioId);
  if (scenario && scenario.roleAdjustments?.[role.id]?.note) {
    notes.push("Scenario note: " + scenario.roleAdjustments[role.id].note);
  }
  if (match.scenarioNote && !notes.some((note) => note.includes(match.scenarioNote))) {
    notes.push(match.scenarioNote);
  }

  return {
    profileId: profile.id,
    roleId: role.id,
    roleTitle: role.title,
    scenarioId: scenario ? scenario.id : scenarioId,
    generatedAt: new Date().toISOString(),
    model: "pathway-builder:v1.2",
    horizonWeeks: cursorWeek,
    hoursPerWeek,
    totalHours,
    totalCost,
    currency: "USD",
    readinessFrom,
    readinessTo,
    phases,
    covers,
    notes,
    rationale:
      "Built for " +
      role.title +
      " by sequencing " +
      gaps.length +
      " identified gaps against a catalogue of open and low-cost modules. The plan assumes " +
      hoursPerWeek +
      " study hours per week and a budget of " +
      (profile.constraints?.budget ? "$" + profile.constraints.budget : "no set budget") +
      ".",
  };
}

export function buildSdgMap(profile, matchResult, signals, catalog) {
  const topMatches = matchResult.matches.slice(0, 6);
  const signalItems = signals.items || [];
  const goals = catalog.sdgs.map((goal) => {
    const contributions = [];
    topMatches.forEach((match) => {
      const relation = (catalog.roles.find((role) => role.id === match.roleId)?.sdgs || []).find(
        (item) => item.number === goal.number,
      );
      if (!relation) return;
      contributions.push({
        roleId: match.roleId,
        contribution: (match.fitScore / 100) * (relation.weight / 5),
        rationale: relation.rationale,
      });
    });
    contributions.sort((a, b) => b.contribution - a.contribution);
    const roleIds = contributions.map((item) => item.roleId);
    const rationales = contributions.map((item) => item.rationale);

    const evidence = signalItems
      .filter((signal) => (signal.affectedRoles || []).some((role) => roleIds.includes(role.roleId)))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 2)
      .map((signal) => ({ signalId: signal.id, title: signal.title, publisher: signal.publisher, publishedAt: signal.publishedAt }));

    const best = contributions[0]?.contribution || 0;
    const breadth = Math.min(Math.max(0, contributions.length - 1) * 2, 6);
    const raw = best * 92 + breadth + Math.min(evidence.length * 1.5, 4);
    const score = clamp(round(raw), 0, 100);
    const topRoleRelation = (catalog.roles.find((role) => role.id === topMatches[0]?.roleId)?.sdgs || []).find(
      (item) => item.number === goal.number,
    );
    const tier =
      topRoleRelation && topRoleRelation.tier === "primary"
        ? "primary"
        : score >= 34
          ? "secondary"
          : "contextual";
    const skillIds = [
      ...new Set(
        roleIds
          .flatMap((roleId) => catalog.roles.find((role) => role.id === roleId)?.requiredSkills || [])
          .map((skill) => skill.skillId),
      ),
    ].slice(0, 6);

    return {
      number: goal.number,
      name: goal.name,
      shortName: goal.shortName,
      color: goal.color,
      focus: goal.focus,
      score,
      tier,
      roleIds,
      skillIds,
      rationale:
        rationales[0] ||
        "No direct role link yet. This goal stays contextual for the selected pathway; consider it when choosing an employer or sector.",
      evidence,
    };
  });

  const ranked = [...goals].sort((a, b) => b.score - a.score);
  return {
    profileId: profile.id,
    scenarioId: matchResult.scenarioId,
    generatedAt: new Date().toISOString(),
    goals,
    summary: {
      topGoal: ranked[0]?.number || null,
      primaryGoals: ranked.filter((goal) => goal.tier === "primary").map((goal) => goal.number),
      secondaryGoals: ranked.filter((goal) => goal.tier === "secondary").map((goal) => goal.number),
      strongestScore: ranked[0]?.score || 0,
      note: "Scores combine the fit of your top roles with each role's SDG contribution weight. They describe where your work would land, not a formal impact measurement.",
    },
  };
}

export async function demoCatalog() {
  const { catalog } = await loadDemoData();
  return catalog;
}

export async function demoMeta() {
  const { catalog, signals } = await loadDemoData();
  return {
    service: "ai-career-navigator (demo engine)",
    version: "1.0.0-demo",
    mode: "demo",
    datasetVersion: catalog.meta.datasetVersion,
    generatedAt: catalog.meta.generatedAt,
    lastRefreshedAt: signals.lastRefreshedAt,
    signalWindow: signals.window,
    llm: { provider: "demo", model: "narrator-v1", configured: false },
    capabilities: ["catalog", "signals", "profiles", "matching", "pathway", "sdg-map", "scenarios", "streaming"],
    counts: {
      skills: catalog.skills.length,
      roles: catalog.roles.length,
      sdgs: catalog.sdgs.length,
      signals: signals.items.length,
    },
  };
}

export async function demoListSignals(params = {}) {
  const { signals } = await loadDemoData();
  const query = String(params.query || "").trim().toLowerCase();
  const momentum = params.momentum || "";
  const region = params.region || "";
  const type = params.type || "";
  const roleId = params.roleId || "";
  const sort = params.sort || "recent";
  const limit = clamp(Number(params.limit) || 50, 1, 200);
  const offset = Math.max(0, Number(params.offset) || 0);

  const filtered = signals.items.filter((signal) => {
    if (momentum && signal.momentum !== momentum) return false;
    if (region && signal.region !== region) return false;
    if (type && signal.type !== type) return false;
    if (roleId && !(signal.affectedRoles || []).some((role) => role.roleId === roleId)) return false;
    if (query) {
      const haystack = [signal.title, signal.summary, signal.publisher, ...(signal.tags || [])]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "impact") return b.impact - a.impact || new Date(b.publishedAt) - new Date(a.publishedAt);
    return new Date(b.publishedAt) - new Date(a.publishedAt) || b.impact - a.impact;
  });

  const countBy = (key) =>
    signals.items.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {});

  await latency(120);

  return {
    items: sorted.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
    lastRefreshedAt: signals.lastRefreshedAt,
    window: signals.window,
    pipeline: signals.pipeline,
    facets: {
      momentum: countBy("momentum"),
      region: countBy("region"),
      type: countBy("type"),
    },
  };
}

export async function demoRefreshSignals() {
  const { signals } = await loadDemoData();
  await latency(1500);
  const refreshedAt = new Date().toISOString();
  signals.lastRefreshedAt = refreshedAt;
  return {
    refreshedAt,
    added: 0,
    updated: signals.items.length,
    scanned: signals.pipeline.sourcesScanned,
    durationSeconds: 6.4,
    pipeline: { ...signals.pipeline, signalsSurfaced: signals.items.length },
    note: "Demo engine re-verified the fixture set. Connect the live API to run the real ingestion pipeline.",
  };
}

export async function demoCreateProfile(input) {
  const { catalog } = await loadDemoData();
  const profile = enrichProfile(input, catalog);
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
  await latency(260);
  return profile;
}

export async function demoUpdateProfile(id, patch) {
  const { catalog } = await loadDemoData();
  const current = await demoGetProfile(id);
  const merged = enrichProfile({ ...current, ...patch, id: current.id, createdAt: current.createdAt }, catalog);
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}

export async function demoGetProfile(id) {
  try {
    const stored = window.localStorage.getItem(PROFILE_KEY);
    if (stored) {
      const profile = JSON.parse(stored);
      if (!id || profile.id === id) return profile;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function demoMatch(profile, scenarioId) {
  const { catalog } = await loadDemoData();
  await latency(420);
  return buildMatches(profile, scenarioId, catalog);
}

export async function demoPathway(profile, scenarioId, roleId) {
  const { catalog, modules } = await loadDemoData();
  const match = buildMatches(profile, scenarioId, catalog);
  await latency(520);
  return buildPathway(profile, match, scenarioId, catalog, modules.items, roleId);
}

export async function demoSdgMap(profile, scenarioId) {
  const { catalog, signals } = await loadDemoData();
  const match = buildMatches(profile, scenarioId, catalog);
  await latency(320);
  return buildSdgMap(profile, match, signals, catalog);
}

export function composeAnalysis({ profile, matches, scenario, pathway, sdgMap, catalog }) {
  const top = matches.matches.slice(0, 3);
  const lead = top[0];
  const leadRole = catalog.roles.find((role) => role.id === lead.roleId);
  const gaps = lead.skillsGap.slice(0, 3);
  const goal = sdgMap ? catalog.sdgs.find((item) => item.number === sdgMap.summary.topGoal) : null;
  const pathwayWeeks = pathway ? pathway.horizonWeeks : null;

  const paragraphs = [];
  paragraphs.push(
    profile.name +
      ", your strongest adjacent role is " +
      lead.title +
      " (fit " +
      lead.fitScore +
      "/100) under the " +
      scenario.name +
      " scenario. " +
      top
        .slice(1)
        .map((match) => match.title + " (" + match.fitScore + ")")
        .join(" and ") +
      " follow, which gives you more than one credible route rather than a single bet.",
  );

  paragraphs.push(
    "The gap is narrow: " +
      (gaps.length
        ? gaps.map((gap) => gap.name + " " + gap.currentLevel + "→" + gap.requiredLevel).join(", ")
        : "you already meet the stated skill bar") +
      ". " +
      (lead.scenarioNote ? lead.scenarioNote + " " : "") +
      "Your existing " +
      (lead.matchedSkills[0]?.name || "transferable experience") +
      " is the reason the jump is plausible.",
  );

  if (pathway) {
    paragraphs.push(
      "A " +
        pathwayWeeks +
        "-week plan at " +
        pathway.hoursPerWeek +
        " hours per week gets you to an estimated readiness of " +
        pathway.readinessTo +
        "/100, with " +
        pathway.phases.length +
        " phases and a total cost of $" +
        pathway.totalCost +
        ". The plan deliberately ends with evidence: a portfolio artefact and a defended case, because " +
        leadRole?.title.toLowerCase() +
        " hiring managers ask for proof rather than certificates.",
    );
  }

  if (goal) {
    paragraphs.push(
      "On the SDGs, this path contributes most to SDG " +
        goal.number +
        " (" +
        goal.name +
        "): " +
        goal.rationale +
        " Use this when choosing an employer, not just a job title.",
    );
  }

  paragraphs.push(
    "Re-run the analysis when the scenario changes. Under Acceleration, the same profile scores differently because agentic deployment changes what employers hire for — and a good plan should survive more than one future.",
  );

  return paragraphs.join("\n\n");
}

export async function demoAnalysis({ profile, matches, scenario, pathway, sdgMap, catalog }, onToken) {
  const text = composeAnalysis({ profile, matches, scenario, pathway, sdgMap, catalog });
  const meta = { provider: "demo", model: "narrator-v1", generatedAt: new Date().toISOString(), scenarioId: scenario.id };
  if (typeof onToken !== "function") {
    await latency(700);
    return { analysis: { ...meta, narrative: text }, model: meta.model };
  }

  onToken({ type: "meta", meta });
  const tokens = text.split(/(\s+)/);
  let buffer = "";
  for (let i = 0; i < tokens.length; i += 3) {
    buffer += tokens.slice(i, i + 3).join("");
    onToken({ type: "token", text: tokens.slice(i, i + 3).join("") });
    await wait(18);
  }
  onToken({ type: "done", analysis: { ...meta, narrative: text } });
  return { analysis: { ...meta, narrative: text }, model: meta.model };
}

export async function demoHealth() {
  const { catalog } = await loadDemoData();
  return {
    status: "ok",
    service: "ai-career-navigator",
    version: "1.0.0-demo",
    mode: "demo",
    datasetVersion: catalog.meta.datasetVersion,
    time: new Date().toISOString(),
    llm: { provider: "demo", model: "narrator-v1", configured: false },
  };
}