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
import type { Coordinator, Selection as VgSelection } from "@uwdata/mosaic-core";
import { LoadingState } from "../types/loading";
import type {
  Outcome,
  SourceConfig,
  SourceKey,
  Trajectory,
} from "../pages/Demos/TrajectoryAtlas/types";

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
  const [selectedTrajectory, setSelectedTrajectory] = useState<Trajectory | null>(null);
  const [stats, setStats] = useState<Stats>({ n: 0, pass: 0, avgSteps: 0, avgTokens: 0 });

  const coordinatorRef = useRef<Coordinator | null>(null);
  const crossfilterRef = useRef<VgSelection | null>(null);
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
        await coord.exec(`SET threads = 1;`);
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
        await coord.exec("DROP TABLE IF EXISTS traj_summary");
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
    // Per-trajectory summary: entry tool + top-2 dominant tools + outcome.
    // Excludes meta-steps and submit terminators so the sankey columns
    // represent real actions, not bookkeeping. NULLs (when a trajectory has
    // no 2nd dominant) become '(none)' so the sankey can route skip-edges
    // past them.
    setState({ status: "creating-tables", table: "traj_summary" });
    await coord.exec(`
      CREATE TABLE traj_summary AS
      WITH counts AS (
        SELECT id, name, COUNT(*) AS cnt
        FROM steps
        WHERE name NOT IN ('task','thought','observation',
                           'final_answer','finish','submit','done')
        GROUP BY id, name
      ),
      ranked AS (
        SELECT id, name,
               ROW_NUMBER() OVER (PARTITION BY id ORDER BY cnt DESC, name) AS rk
        FROM counts
      ),
      dominant AS (
        SELECT id,
               MAX(name) FILTER (WHERE rk = 1) AS dominant_1,
               MAX(name) FILTER (WHERE rk = 2) AS dominant_2
        FROM ranked GROUP BY id
      ),
      entry AS (
        SELECT id, arg_min(name, step_idx) AS entry_tool
        FROM steps
        WHERE name NOT IN ('task','thought','observation',
                           'final_answer','finish','submit','done')
        GROUP BY id
      )
      SELECT t.id,
             t.outcome,
             COALESCE(e.entry_tool, '(none)') AS entry_tool,
             COALESCE(d.dominant_1, '(none)') AS dominant_1,
             COALESCE(d.dominant_2, '(none)') AS dominant_2
      FROM trajectories t
      LEFT JOIN entry e USING (id)
      LEFT JOIN dominant d USING (id)
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
      selectedTrajectory,
      setRowSelection,
      stats,
      filterPredicate,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, source, search, outcomeFilter, selectedTrajectory, stats, filterPredicate, setRowSelection],
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
