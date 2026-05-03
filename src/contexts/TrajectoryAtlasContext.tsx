/**
 * Trajectory Atlas — DuckDB-WASM + Mosaic context.
 *
 * Loads the trajectory parquet, materialises a flat `steps` table for the
 * icicle's path queries and a `traj_summary` table for the sankey, exposes
 * a Mosaic crossfilter Selection that the icicle, sankey, and AnyTable all
 * bind to, and computes top-line KPIs via DuckDB.
 *
 * The user-visible filters (search box + outcome chips) are pushed into the
 * crossfilter as a Mosaic clause so every chart reacts in addition to the
 * KPI strip.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import * as vg from "@uwdata/vgplot";
import { verbatim } from "@uwdata/mosaic-sql";
import type { Coordinator, Selection as VgSelection } from "@uwdata/mosaic-core";
import { LoadingState } from "../types/loading";
import type {
  Outcome,
  SourceConfig,
  SourceKey,
  Trajectory,
} from "../pages/Demos/TrajectoryAtlas/types";

// Must match MAX_TOOL_STEPS in extract_trajectories.py — these are the
// pre-computed step_1..step_N columns the sankey can pull from.
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

interface Stats {
  n: number;
  pass: number;
  avgSteps: number;
  avgTokens: number;
}

export interface TrajectoryAtlasContextValue {
  state: LoadingState;
  coordinator: Coordinator | null;
  crossfilter: VgSelection | null;

  source: SourceKey;
  sources: Record<SourceKey, SourceConfig>;
  setSource: (s: SourceKey) => void;

  search: string;
  setSearch: (s: string) => void;
  outcomeFilter: Outcome | "all";
  setOutcomeFilter: (s: Outcome | "all") => void;

  /** Number of sequential tool-step columns the sankey renders before the
   * outcome column. Bound at extraction by MAX_SANKEY_DEPTH. */
  sankeyDepth: number;
  setSankeyDepth: (n: number) => void;
  /** Maximum allowed sankey depth — matches the parquet's step_1..step_N
   * columns. Surface this so the slider knows its upper bound. */
  maxSankeyDepth: number;

  selectedTrajectory: Trajectory | null;
  setRowSelection: (t: Trajectory | null) => void;

  stats: Stats;

  /** SQL WHERE-body (without the keyword) reflecting the user's search +
   * outcome filters; null when no filters are active. Charts compose this
   * with their own predicates. */
  filterPredicate: string | null;
}

const Ctx = createContext<TrajectoryAtlasContextValue | null>(null);

function escSql(v: string): string {
  return v.replace(/'/g, "''");
}

export function TrajectoryAtlasProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadingState>({ status: "idle" });
  const [source, setSource] = useState<SourceKey>(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    return params.get("source") === "deepswe" ? "deepswe" : "qwen";
  });
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | "all">("all");
  const [sankeyDepth, setSankeyDepth] = useState(3);
  const [selectedTrajectory, setSelectedTrajectory] = useState<Trajectory | null>(null);
  const [stats, setStats] = useState<Stats>({ n: 0, pass: 0, avgSteps: 0, avgTokens: 0 });

  const coordinatorRef = useRef<Coordinator | null>(null);
  const crossfilterRef = useRef<VgSelection | null>(null);
  const filterSourceRef = useRef<{ id: string }>({ id: "ta-ui-filter" });
  const initRef = useRef(false);
  const loadedSourceRef = useRef<SourceKey | null>(null);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        setState({ status: "initializing" });
        const connector = vg.wasmConnector();
        const coord = new vg.Coordinator(connector, {
          cache: false,
          preagg: { enabled: false },
        });
        vg.coordinator(coord).databaseConnector(connector);
        await connector.getDuckDB();
        coordinatorRef.current = coord;

        await coord.exec(`INSTALL httpfs; LOAD httpfs;`);
        // Let DuckDB-WASM use its default thread count — capping at 1 made
        // the heavy DeepSWE summary query unbearably slow.
        crossfilterRef.current = vg.Selection.crossfilter();

        await loadSource(coord, source);
        loadedSourceRef.current = source;
        await refreshStats(coord);
        setState({ status: "ready" });
      } catch (err) {
        console.error("TrajectoryAtlas init failed:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })();
  }, []);

  // Push the user's search + outcome filter into the crossfilter as a Mosaic
  // clause. Every panel bound to the crossfilter (AnyTable, icicle, sankey)
  // re-queries through this single mechanism — no need for each chart to
  // also accept a whereExpr.
  useEffect(() => {
    const sel = crossfilterRef.current;
    if (!sel || state.status !== "ready") return;
    const where = buildFilterPredicate();
    sel.update({
      source: filterSourceRef.current,
      clients: new Set(),
      value: where,
      predicate: where ? verbatim(`(${where})`) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, outcomeFilter, state.status]);

  // Recompute stats when filters change.
  useEffect(() => {
    const coord = coordinatorRef.current;
    if (!coord || state.status !== "ready") return;
    refreshStats(coord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, outcomeFilter, state.status]);

  // React to source switches after initial load.
  useEffect(() => {
    const coord = coordinatorRef.current;
    if (!coord) return;
    if (loadedSourceRef.current === source) return;
    if (state.status !== "ready") return;
    (async () => {
      try {
        setState({ status: "loading-parquet", message: SOURCES[source].label });
        await coord.exec("DROP TABLE IF EXISTS steps");
        await coord.exec("DROP TABLE IF EXISTS trajectories");
        await loadSource(coord, source);
        loadedSourceRef.current = source;
        setSearch("");
        setOutcomeFilter("all");
        setSelectedTrajectory(null);
        await refreshStats(coord);
        setState({ status: "ready" });
      } catch (err) {
        console.error("source switch failed:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  async function loadSource(coord: Coordinator, src: SourceKey) {
    const url = `${window.location.origin}${SOURCES[src].parquetUrl}`;
    setState({ status: "loading-parquet", message: SOURCES[src].label });
    // The parquet already carries entry_tool / dominant_1 / dominant_2
    // (precomputed in extract_trajectories.py) so the sankey can read them
    // straight off `trajectories` instead of running a multi-CTE summary
    // query at load time.
    await coord.exec(`
      CREATE TABLE trajectories AS SELECT * FROM read_parquet('${url}')
    `);
    setState({ status: "creating-tables", table: "steps" });
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

  async function refreshStats(coord: Coordinator) {
    const where = buildFilterPredicate();
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
    setStats({
      n: Number(row?.n ?? 0),
      pass: Number(row?.pass ?? 0),
      avgSteps: Number(row?.avg_steps ?? 0),
      avgTokens: Number(row?.avg_tokens ?? 0),
    });
  }

  function buildFilterPredicate(): string | null {
    const parts: string[] = [];
    if (outcomeFilter !== "all") parts.push(`outcome = '${escSql(outcomeFilter)}'`);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      parts.push(
        `(lower(id) LIKE '%${escSql(q)}%' OR ` +
          `lower(task) LIKE '%${escSql(q)}%' OR ` +
          `lower(model) LIKE '%${escSql(q)}%')`,
      );
    }
    return parts.length ? parts.join(" AND ") : null;
  }

  const setRowSelection = useCallback((t: Trajectory | null) => {
    setSelectedTrajectory(t);
  }, []);

  const filterPredicate = useMemo(
    () => buildFilterPredicate(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, outcomeFilter],
  );

  const value = useMemo<TrajectoryAtlasContextValue>(
    () => ({
      state,
      coordinator: coordinatorRef.current,
      crossfilter: crossfilterRef.current,
      source,
      sources: SOURCES,
      setSource,
      search,
      setSearch,
      outcomeFilter,
      setOutcomeFilter,
      sankeyDepth,
      setSankeyDepth,
      maxSankeyDepth: MAX_SANKEY_DEPTH,
      selectedTrajectory,
      setRowSelection,
      stats,
      filterPredicate,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, source, search, outcomeFilter, sankeyDepth, selectedTrajectory, stats, filterPredicate, setRowSelection],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrajectoryAtlas(): TrajectoryAtlasContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTrajectoryAtlas must be used within TrajectoryAtlasProvider");
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrowFirstRow(table: any): Record<string, unknown> | null {
  if (!table) return null;
  if (typeof table.toArray === "function") {
    const arr = table.toArray();
    return arr.length ? (arr[0] as Record<string, unknown>) : null;
  }
  if (Array.isArray(table) && table.length) return table[0] as Record<string, unknown>;
  return null;
}
