/** Route table. Each view exports { title, render(ctx), mount(root, ctx) }. */

import { connectView } from "./connect.js";
import { intakeView } from "./intake.js";
import { matchesView } from "./matches.js";
import { overviewView } from "./overview.js";
import { pathwayView } from "./pathway.js";
import { scenariosView } from "./scenarios.js";
import { sdgView } from "./sdg.js";
import { signalsView } from "./signals.js";

export const views = {
  "/overview": overviewView,
  "/intake": intakeView,
  "/signals": signalsView,
  "/matches": matchesView,
  "/pathway": pathwayView,
  "/sdg": sdgView,
  "/scenarios": scenariosView,
  "/connect": connectView,
};
