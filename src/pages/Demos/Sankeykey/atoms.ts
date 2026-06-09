// Sankeykey — minimal data layer. One parquet, one table, no crossfilter:
// the page exists to showcase the depth-expandable sankey on its own.

import { atom } from "jotai";
import * as vg from "@uwdata/vgplot";
import type { Coordinator } from "@uwdata/mosaic-core";
import { arrowFirstRow, arrowRows } from "../../../components/chartUtils";
import { LoadingState } from "../../../types/loading";
import { categoryFor } from "../TrajectoryAtlas/taxonomy";
import type { Category } from "../TrajectoryAtlas/types";

// Must match MAX_TOOL_STEPS in extract_trajectories.py
export const MAX_DEPTH = 8;

const PARQUET_URL = "/data/trajectory-atlas/deepswe-kimi.parquet";

const STEP_COLS = Array.from({ length: MAX_DEPTH }, (_, i) => `step_${i + 1}`);

/** Rollout counts surviving to each tool-call depth: `ge[k-1]` = rollouts
 * whose k-th step column is a real tool (not the `(none)` sentinel). */
export interface Survival {
  total: number;
  ge: number[];
}

// Primitive atoms — infra
export const loadingStateAtom = atom<LoadingState>({ status: "idle" });
export const coordinatorAtom = atom<Coordinator | null>(null);

// Primitive atoms — UI
export const depthAtom = atom(3);
export const playingAtom = atom(false);
export const sankeyActiveAtom = atom(false);
export const resetSignalAtom = atom(0);

// Computed once at init so the readout tracks slider drags synchronously.
export const survivalAtom = atom<Survival | null>(null);
export const legendCategoriesAtom = atom<Category[]>([]);

async function loadSurvival(coord: Coordinator): Promise<Survival> {
  const ge = STEP_COLS.map(
    (c, i) =>
      `COUNT(*) FILTER (WHERE ${c} IS NOT NULL AND ${c} <> '(none)') AS ge_${i + 1}`,
  );
  const r = await coord.query(`
    SELECT COUNT(*) AS total, ${ge.join(", ")}
    FROM trajectories
  `);
  const row = arrowFirstRow(r);
  return {
    total: Number(row?.total ?? 0),
    ge: STEP_COLS.map((_, i) => Number(row?.[`ge_${i + 1}`] ?? 0)),
  };
}

async function loadLegendCategories(coord: Coordinator): Promise<Category[]> {
  const r = await coord.query(`
    SELECT DISTINCT unnest([${STEP_COLS.join(", ")}]) AS tool
    FROM trajectories
  `);
  const cats = new Set<Category>();
  for (const row of arrowRows(r)) {
    const tool = row.tool;
    if (typeof tool !== "string" || !tool || tool === "(none)") continue;
    cats.add(categoryFor(tool));
  }
  return [...cats];
}

export const initializeSankeykeyAtom = atom(null, async (get, set) => {
  if (get(coordinatorAtom)) return;

  try {
    set(loadingStateAtom, { status: "initializing" });
    const connector = vg.wasmConnector();
    // Local coordinator only — never registered as the vgplot global, so
    // visiting this page can't clobber other demos' singleton.
    const coord = new vg.Coordinator(connector, {
      cache: false,
      preagg: { enabled: false },
    });
    set(coordinatorAtom, coord);
    await connector.getDuckDB();
    await coord.exec(`INSTALL httpfs; LOAD httpfs;`);

    set(loadingStateAtom, {
      status: "loading-parquet",
      message: "DeepSWE · Kimi-K2",
    });
    const url = `${window.location.origin}${PARQUET_URL}`;
    await coord.exec(`
      CREATE TABLE trajectories AS SELECT * FROM read_parquet('${url}')
    `);

    set(loadingStateAtom, { status: "creating-tables", table: "stats" });
    set(survivalAtom, await loadSurvival(coord));
    set(legendCategoriesAtom, await loadLegendCategories(coord));
    set(loadingStateAtom, { status: "ready" });
  } catch (err) {
    console.error("Sankeykey init failed:", err);
    set(loadingStateAtom, {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

initializeSankeykeyAtom.onMount = (trigger) => {
  trigger();
};
