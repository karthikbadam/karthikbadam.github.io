import { atom } from "jotai";
import * as vg from "@uwdata/vgplot";
import { verbatim } from "@uwdata/mosaic-sql";
import type { Coordinator, Selection as VgSelection } from "@uwdata/mosaic-core";
import { arrowFirstRow } from "../../../components/chartUtils";
import { LoadingState } from "../../../types/loading";
import type { Outcome, SourceConfig, SourceKey, Trajectory } from "./types";

// Must match MAX_TOOL_STEPS in extract_trajectories.py
const MAX_SANKEY_DEPTH = 8;

const SOURCES: Record<SourceKey, SourceConfig> = {
  qwen: {
    key: "qwen",
    label: "Qwen2.5 · math + hotpotqa",
    parquetUrl: "/data/trajectory-atlas/qwen-hotpotqa-math.parquet",
  },
  deepswe: {
    key: "deepswe",
    label: "DeepSWE · Kimi-K2",
    parquetUrl: "/data/trajectory-atlas/deepswe-kimi.parquet",
  },
};

export interface Stats {
  n: number;
  pass: number;
  avgSteps: number;
  avgTokens: number;
}

const FILTER_SOURCE = { id: "ta-ui-filter" };

function escSql(v: string): string {
  return v.replace(/'/g, "''");
}

function initialSourceFromHash(): SourceKey {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  return params.get("source") === "deepswe" ? "deepswe" : "qwen";
}

// Primitive atoms — infra
export const loadingStateAtom = atom<LoadingState>({ status: "idle" });
export const coordinatorAtom = atom<Coordinator | null>(null);
export const crossfilterAtom = atom<VgSelection | null>(null);
export const loadedSourceAtom = atom<SourceKey | null>(null);

// Primitive atoms — UI filters
export const sourceAtom = atom<SourceKey>(initialSourceFromHash());
export const searchAtom = atom("");
export const outcomeFilterAtom = atom<Outcome | "all">("all");
export const sankeyDepthAtom = atom(3);

// Primitive atoms — selection
export const highlightedTrajIdAtom = atom<string | null>(null);
export const selectedTrajectoryAtom = atom<Trajectory | null>(null);
export const icicleActiveAtom = atom(false);
export const sankeyActiveAtom = atom(false);
export const resetSignalAtom = atom(0);

// Stats
export const statsAtom = atom<Stats>({
  n: 0,
  pass: 0,
  avgSteps: 0,
  avgTokens: 0,
});

// Derived
export const isReadyAtom = atom(
  (get) => get(loadingStateAtom).status === "ready",
);

export const sourcesAtom = atom(() => SOURCES);
export const maxSankeyDepthAtom = atom(() => MAX_SANKEY_DEPTH);

export const sourceConfigAtom = atom((get) => SOURCES[get(sourceAtom)]);

export const filterPredicateAtom = atom((get): string | null => {
  const conds: string[] = [];
  const outcome = get(outcomeFilterAtom);
  const search = get(searchAtom);
  if (outcome !== "all") {
    conds.push(`outcome = '${escSql(outcome)}'`);
  }
  if (search.trim()) {
    const q = escSql(search.trim().toLowerCase());
    conds.push(
      `(lower(id) LIKE '%${q}%' OR ` +
        `lower(task) LIKE '%${q}%' OR ` +
        `lower(model) LIKE '%${q}%')`,
    );
  }
  if (!conds.length) return null;
  return `id IN (SELECT id FROM trajectories WHERE ${conds.join(" AND ")})`;
});

export const hasActiveSelectionAtom = atom(
  (get) =>
    get(searchAtom).trim().length > 0 ||
    get(outcomeFilterAtom) !== "all" ||
    get(highlightedTrajIdAtom) !== null ||
    get(icicleActiveAtom) ||
    get(sankeyActiveAtom),
);

// Internal helpers (not atoms — used by action atoms)
async function loadSource(coord: Coordinator, src: SourceKey) {
  const url = `${window.location.origin}${SOURCES[src].parquetUrl}`;
  await coord.exec(`
    CREATE TABLE trajectories AS SELECT * FROM read_parquet('${url}')
  `);
  await coord.exec(`
    CREATE TABLE steps AS
    SELECT t.id       AS id,
           t.outcome  AS outcome,
           s.idx      AS step_idx,
           s.name     AS name,
           s.tokens   AS tokens,
           s.duration AS duration,
           s.ok       AS ok
    FROM trajectories t, UNNEST(t.steps) AS u(s)
  `);
}

// Action atoms
export const refreshStatsAtom = atom(null, async (get, set) => {
  const coord = get(coordinatorAtom);
  if (!coord) return;
  const where = get(filterPredicateAtom);
  const r = await coord.query(`
    SELECT
      COUNT(*) AS n,
      SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS pass,
      AVG(step_count) AS avg_steps,
      AVG(tokens) AS avg_tokens
    FROM trajectories
    ${where ? `WHERE ${where}` : ""}
  `);
  const row = arrowFirstRow(r);
  set(statsAtom, {
    n: Number(row?.n ?? 0),
    pass: Number(row?.pass ?? 0),
    avgSteps: Number(row?.avg_steps ?? 0),
    avgTokens: Number(row?.avg_tokens ?? 0),
  });
});

export const pushFilterToCrossfilterAtom = atom(null, (get) => {
  const sel = get(crossfilterAtom);
  if (!sel) return;
  const where = get(filterPredicateAtom);
  sel.update({
    source: FILTER_SOURCE,
    clients: new Set(),
    value: where,
    predicate: where ? verbatim(`(${where})`) : null,
  });
});

export const switchSourceAtom = atom(
  null,
  async (get, set, src: SourceKey) => {
    const coord = get(coordinatorAtom);
    if (!coord) return;
    if (get(loadedSourceAtom) === src) return;

    try {
      set(loadingStateAtom, {
        status: "loading-parquet",
        message: SOURCES[src].label,
      });
      await coord.exec("DROP TABLE IF EXISTS steps");
      await coord.exec("DROP TABLE IF EXISTS trajectories");
      await loadSource(coord, src);
      set(loadedSourceAtom, src);
      set(searchAtom, "");
      set(outcomeFilterAtom, "all");
      set(selectedTrajectoryAtom, null);
      set(highlightedTrajIdAtom, null);
      await set(refreshStatsAtom);
      set(loadingStateAtom, { status: "ready" });
    } catch (err) {
      console.error("source switch failed:", err);
      set(loadingStateAtom, {
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

export const clearAllAtom = atom(null, (_, set) => {
  set(searchAtom, "");
  set(outcomeFilterAtom, "all");
  set(highlightedTrajIdAtom, null);
  set(selectedTrajectoryAtom, null);
  set(icicleActiveAtom, false);
  set(sankeyActiveAtom, false);
  set(resetSignalAtom, (n) => n + 1);
});

export const initializeTrajectoryAtlasAtom = atom(null, async (get, set) => {
  if (get(coordinatorAtom)) return;

  try {
    set(loadingStateAtom, { status: "initializing" });
    const connector = vg.wasmConnector();
    const coord = new vg.Coordinator(connector, {
      cache: false,
      preagg: { enabled: false },
    });
    vg.coordinator(coord).databaseConnector(connector);
    set(coordinatorAtom, coord);
    await connector.getDuckDB();

    await coord.exec(`INSTALL httpfs; LOAD httpfs;`);
    set(crossfilterAtom, vg.Selection.crossfilter());

    const src = get(sourceAtom);
    set(loadingStateAtom, {
      status: "loading-parquet",
      message: SOURCES[src].label,
    });
    await loadSource(coord, src);
    set(loadedSourceAtom, src);

    set(loadingStateAtom, { status: "creating-tables", table: "steps" });
    await set(refreshStatsAtom);
    set(loadingStateAtom, { status: "ready" });
  } catch (err) {
    console.error("TrajectoryAtlas init failed:", err);
    set(loadingStateAtom, {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

initializeTrajectoryAtlasAtom.onMount = (trigger) => {
  trigger();
};
