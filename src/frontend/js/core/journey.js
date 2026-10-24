/**
 * Exploration journey for the Overview life tree.
 *
 * Five explicit actions drive the five steps. Progress is local-only and is
 * stored inside the existing aicn:state:v1 localStorage entry, so this module
 * makes no API calls and does not alter the backend contract.
 */

export const JOURNEY_STEPS = [
  { id: "profile", number: 1, title: "Profile", detail: "Your starting point", href: "#/intake", action: "Build your profile", actionDetail: "Step 1 · Your starting point", focusTitle: "Build your profile", focusBody: "Set your baseline for trends, matches and learning." },
  { id: "signals", number: 2, title: "Skill trends", detail: "Signals and evidence", href: "#/signals", action: "Explore skill trends", actionDetail: "Step 2 · Signals and evidence", focusTitle: "Skill trends", focusBody: "See rising skills and their evidence." },
  { id: "roles", number: 3, title: "Career matches", detail: "Fit and skill gaps", href: "#/matches", action: "See career matches", actionDetail: "Step 3 · Fit and skill gaps", focusTitle: "Career matches", focusBody: "Open a role for fit, gaps and reasons." },
  { id: "scenarios", number: 4, title: "Future scenarios", detail: "Compare possible outcomes", href: "#/scenarios", action: "Compare future scenarios", actionDetail: "Step 4 · Compare possible outcomes", focusTitle: "Future scenarios", focusBody: "Switch futures to re-rank the same profile." },
  { id: "pathway", number: 5, title: "Pathway", detail: "Learning modules and SDGs", href: "#/pathway", action: "Open your pathway", actionDetail: "Step 5 · Learning modules and SDGs", focusTitle: "Open your pathway", focusBody: "Turn your gaps into a phased plan." },
];

const MAX_EVENTS = 30;
const MAX_AGE = 1000 * 60 * 60 * 24 * 365 * 2;

export function emptyJourney() {
  return {
    profileSaved: false,
    signalsViewed: [],
    rolesExplored: [],
    scenariosCompared: [],
    pathwayViewed: false,
    lastAchievement: null,
  };
}

function uniqueStrings(value, limit = MAX_EVENTS) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== "string" || !item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.slice(-limit);
}

function validAchievement(value) {
  if (!value || typeof value !== "object") return null;
  if (!JOURNEY_STEPS.some((step) => step.id === value.stepId)) return null;
  const at = Number(value.at);
  if (!Number.isFinite(at) || Date.now() - at > MAX_AGE) return null;
  return { stepId: value.stepId, at };
}

export function normalizeJourney(raw) {
  const base = emptyJourney();
  if (!raw || typeof raw !== "object") return base;
  return {
    profileSaved: Boolean(raw.profileSaved),
    signalsViewed: uniqueStrings(raw.signalsViewed),
    rolesExplored: uniqueStrings(raw.rolesExplored),
    scenariosCompared: uniqueStrings(raw.scenariosCompared),
    pathwayViewed: Boolean(raw.pathwayViewed),
    lastAchievement: validAchievement(raw.lastAchievement),
  };
}

function profileDone(state) {
  return Boolean(state.profile && state.profile.id && Array.isArray(state.profile.skills) && state.profile.skills.length > 0);
}

export function isStepComplete(stepId, journey, state) {
  const events = normalizeJourney(journey);
  switch (stepId) {
    case "profile": return Boolean(events.profileSaved || profileDone(state));
    case "signals": return events.signalsViewed.length > 0;
    case "roles": return events.rolesExplored.length > 0;
    case "scenarios": return events.scenariosCompared.length > 0;
    case "pathway": return Boolean(events.pathwayViewed);
    default: return false;
  }
}

function completionMap(journey, state) {
  return Object.fromEntries(JOURNEY_STEPS.map((step) => [step.id, isStepComplete(step.id, journey, state)]));
}

export function journeySnapshot(state) {
  const journey = normalizeJourney(state.journey);
  const complete = completionMap(journey, state);
  const completed = JOURNEY_STEPS.filter((step) => complete[step.id]).length;
  const next = JOURNEY_STEPS.find((step) => !complete[step.id]) || null;
  const steps = JOURNEY_STEPS.map((step) => {
    const done = complete[step.id];
    const active = !done && next && next.id === step.id;
    return {
      ...step,
      complete: done,
      state: done ? "done" : active ? "active" : "locked",
      stateLabel: done ? "Complete" : active ? "In progress" : "Locked",
      isNew: Boolean(journey.lastAchievement && journey.lastAchievement.stepId === step.id),
    };
  });
  return {
    journey,
    steps,
    completed,
    total: JOURNEY_STEPS.length,
    percent: Math.round((completed / JOURNEY_STEPS.length) * 100),
    next,
    lastAchievement: journey.lastAchievement,
  };
}

export function applyJourneyEvent(rawJourney, type, value, state) {
  const journey = normalizeJourney(rawJourney);
  const before = completionMap(journey, state);
  let changed = false;

  if (type === "profileSaved" && !journey.profileSaved) { journey.profileSaved = true; changed = true; }
  if (type === "signalViewed" && typeof value === "string" && value && !journey.signalsViewed.includes(value)) {
    journey.signalsViewed = [...journey.signalsViewed, value].slice(-MAX_EVENTS); changed = true;
  }
  if (type === "roleExplored" && typeof value === "string" && value && !journey.rolesExplored.includes(value)) {
    journey.rolesExplored = [...journey.rolesExplored, value].slice(-MAX_EVENTS); changed = true;
  }
  if (type === "scenarioCompared" && typeof value === "string" && value && !journey.scenariosCompared.includes(value)) {
    journey.scenariosCompared = [...journey.scenariosCompared, value].slice(-MAX_EVENTS); changed = true;
  }
  if (type === "pathwayViewed" && !journey.pathwayViewed) { journey.pathwayViewed = true; changed = true; }

  if (!changed) return { journey, changed: false, completed: null };
  const after = completionMap(journey, state);
  const completedStep = JOURNEY_STEPS.find((step) => !before[step.id] && after[step.id]);
  if (completedStep) journey.lastAchievement = { stepId: completedStep.id, at: Date.now() };
  return { journey, changed: true, completed: completedStep ? completedStep.id : null };
}
