/**
 * Trajectory Atlas — DuckDB-WASM + Mosaic context.
 *
 * Loads the active trajectory parquet, materialises a flat `steps` table for
 * the icicle / sankey path queries, exposes a Mosaic crossfilter Selection
 * that the icicle, sankey, and AnyTable all bind to, and computes top-line
 * KPIs from DuckDB.
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
    hfUrl: "https://huggingface.co/Qwen/Qwen2.5-32B-Instruct",
  },
  deepswe: {
    key: "deepswe",
    label: "DeepSWE · Kimi-K2",
    parquetUrl: "/data/trajectory-atlas/deepswe-kimi.parquet",
    hfUrl: "https://huggingface.co/moonshotai/Kimi-K2-Instruct",
  },
};

interface Stats {
  n: number;
  pass: number;
  avgSteps: number;
  avgCost: number;
  avgTokens: number;
}

export interface TrajectoryAtlasContextValue {
  state: LoadingState;
  source: SourceKey;
  sources: Record<SourceKey, SourceConfig>;
  setSource: (s: SourceKey) => void;

  coordinator: Coordinator | null;
  /** vgplot crossfilter — written to by icicle/sankey clicks; read by AnyTable. */
  crossfilter: VgSelection | null;
  /** vgplot single selection that holds the currently inspected trajectory id. */
  rowSelection: VgSelection | null;
  /** vgplot single selection for transient hover highlighting. */
  hover: VgSelection | null;

  search: string;
  setSearch: (s: string) => void;
  outcomeFilter: Outcome | "all";
  setOutcomeFilter: (s: Outcome | "all") => void;
  datasetFilter: string | "all";
  setDatasetFilter: (s: string | "all") => void;
  modelFilter: string | "all";
  setModelFilter: (s: string | "all") => void;

  selectedTrajectory: Trajectory | null;
  setRowSelection: (t: Trajectory | null) => void;

  stats: Stats;
  datasets: string[];
  models: string[];

  /** Builds a SQL predicate combining all current UI filters (search, outcome,
   * dataset, model). Returns the WHERE-body (without the WHERE keyword), or
   * null when no filters are active. */
  buildFilterPredicate: () => string | null;
}

const Ctx = createContext<TrajectoryAtlasContextValue | null>(null);

function escSql(v: string): string {
  return v.replace(/'/g, "''");
}

export function TrajectoryAtlasProvider({ children }: { children: ReactNode }) {
  // UI state
  const [source, setSource] = useState<SourceKey>(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const s = params.get("source");
    return s === "deepswe" ? "deepswe" : "qwen";
  });
  const [state, setState] = useState<LoadingState>({ status: "idle" });
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | "all">("all");
  const [datasetFilter, setDatasetFilter] = useState<string | "all">("all");
  const [modelFilter, setModelFilter] = useState<string | "all">("all");
  const [selectedTrajectory, setSelectedTrajectoryState] = useState<Trajectory | null>(null);

  // Mosaic refs (kept stable across re-renders)
  const coordinatorRef = useRef<Coordinator | null>(null);
  const crossfilterRef = useRef<VgSelection | null>(null);
  const rowSelectionRef = useRef<VgSelection | null>(null);
  const hoverRef = useRef<VgSelection | null>(null);

  const [datasets, setDatasets] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({ n: 0, pass: 0, avgSteps: 0, avgCost: 0, avgTokens: 0 });

  const initRef = useRef(false);
  const loadedSourceRef = useRef<SourceKey | null>(null);

  // Initial coordinator setup — runs once.
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

        // Selections live for the lifetime of the demo — they survive source
        // switches so panels keep wiring through.
        crossfilterRef.current = vg.Selection.crossfilter();
        rowSelectionRef.current = vg.Selection.single();
        hoverRef.current = vg.Selection.single();

        // Load initial source.
        await loadSource(coord, source);
        loadedSourceRef.current = source;
        await refreshFacetsAndStats(coord);
        setState({ status: "ready" });
      } catch (err) {
        console.error("Failed to initialize TrajectoryAtlas context:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })();
  }, [source]);

  // React to source changes after initial load.
  useEffect(() => {
    const coord = coordinatorRef.current;
    if (!coord) return;
    if (loadedSourceRef.current === source) return;
    if (state.status !== "ready" && state.status !== "loading-parquet") return;

    (async () => {
      try {
        setState({ status: "loading-parquet", message: SOURCES[source].label });
        // Drop existing tables before re-creating.
        await coord.exec(`DROP TABLE IF EXISTS steps`);
        await coord.exec(`DROP TABLE IF EXISTS trajectories`);
        await loadSource(coord, source);
        loadedSourceRef.current = source;
        // Reset filters and selections on source switch.
        setSearch("");
        setOutcomeFilter("all");
        setDatasetFilter("all");
        setModelFilter("all");
        setSelectedTrajectoryState(null);
        await refreshFacetsAndStats(coord);
        setState({ status: "ready" });
      } catch (err) {
        console.error("Failed to switch source:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  async function loadSource(coord: Coordinator, src: SourceKey) {
    const baseUrl = window.location.origin;
    // The site is served under `/`, but during dev the parquet path is just
    // /data/...; in production with HashRouter the same /data path works.
    const parquetUrl = `${baseUrl}${SOURCES[src].parquetUrl}`;
    setState({ status: "loading-parquet", message: SOURCES[src].label });
    await coord.exec(`
      CREATE TABLE trajectories AS
      SELECT * FROM read_parquet('${parquetUrl}')
    `);
    setState({ status: "creating-tables", table: "steps" });
    // UNNEST the per-trajectory steps so icicle/sankey can query directly.
    await coord.exec(`
      CREATE TABLE steps AS
      SELECT t.id AS traj_id,
             t.outcome AS outcome,
             t.dataset AS dataset,
             t.model AS model,
             s.idx AS step_idx,
             s.name AS name,
             s.category AS category,
             s.tool AS tool,
             s.role AS role,
             s.tokens AS tokens,
             s.duration AS duration,
             s.ok AS ok
      FROM trajectories t, UNNEST(t.steps) AS u(s)
    `);
  }

  async function refreshFacetsAndStats(coord: Coordinator) {
    const dsRows = await coord.query(
      `SELECT DISTINCT dataset FROM trajectories ORDER BY dataset`,
    );
    const mdRows = await coord.query(
      `SELECT DISTINCT model FROM trajectories ORDER BY model`,
    );
    const statsRows = await coord.query(`
      SELECT
        COUNT(*) AS n,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS pass,
        AVG(step_count) AS avg_steps,
        AVG(cost) AS avg_cost,
        AVG(tokens) AS avg_tokens
      FROM trajectories
    `);
    const ds = arrowToList(dsRows, "dataset");
    const md = arrowToList(mdRows, "model");
    const row = arrowFirstRow(statsRows);
    setDatasets(ds);
    setModels(md);
    setStats({
      n: Number(row?.n ?? 0),
      pass: Number(row?.pass ?? 0),
      avgSteps: Number(row?.avg_steps ?? 0),
      avgCost: Number(row?.avg_cost ?? 0),
      avgTokens: Number(row?.avg_tokens ?? 0),
    });
  }

  // Recompute stats whenever filters change.
  useEffect(() => {
    const coord = coordinatorRef.current;
    if (!coord || state.status !== "ready") return;
    const where = buildWhere();
    (async () => {
      const r = await coord.query(`
        SELECT
          COUNT(*) AS n,
          SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS pass,
          AVG(step_count) AS avg_steps,
          AVG(cost) AS avg_cost,
          AVG(tokens) AS avg_tokens
        FROM trajectories
        ${where ? `WHERE ${where}` : ""}
      `);
      const row = arrowFirstRow(r);
      setStats({
        n: Number(row?.n ?? 0),
        pass: Number(row?.pass ?? 0),
        avgSteps: Number(row?.avg_steps ?? 0),
        avgCost: Number(row?.avg_cost ?? 0),
        avgTokens: Number(row?.avg_tokens ?? 0),
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, outcomeFilter, datasetFilter, modelFilter, state.status]);

  function buildWhere(): string | null {
    const parts: string[] = [];
    if (outcomeFilter !== "all") parts.push(`outcome = '${escSql(outcomeFilter)}'`);
    if (datasetFilter !== "all") parts.push(`dataset = '${escSql(datasetFilter)}'`);
    if (modelFilter !== "all") parts.push(`model = '${escSql(modelFilter)}'`);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      parts.push(`(
        lower(id) LIKE '%${escSql(q)}%' OR
        lower(task) LIKE '%${escSql(q)}%' OR
        lower(model) LIKE '%${escSql(q)}%'
      )`);
    }
    return parts.length ? parts.join(" AND ") : null;
  }

  const setRowSelection = useCallback((t: Trajectory | null) => {
    // The rowSelection vgplot Selection is intentionally *not* mutated here:
    // selecting a row should highlight (not filter) other panels, which
    // crossfilter would do. Highlights are driven by the React state below
    // through `selectedTrajectory`. Keeping the Selection in the context
    // gives downstream panels a place to subscribe later if they need it.
    setSelectedTrajectoryState(t);
  }, []);

  const value = useMemo<TrajectoryAtlasContextValue>(
    () => ({
      state,
      source,
      sources: SOURCES,
      setSource,
      coordinator: coordinatorRef.current,
      crossfilter: crossfilterRef.current,
      rowSelection: rowSelectionRef.current,
      hover: hoverRef.current,
      search,
      setSearch,
      outcomeFilter,
      setOutcomeFilter,
      datasetFilter,
      setDatasetFilter,
      modelFilter,
      setModelFilter,
      selectedTrajectory,
      setRowSelection,
      stats,
      datasets,
      models,
      buildFilterPredicate: buildWhere,
    }),
    // coordinator/crossfilter/rowSelection/hover are refs; their identity
    // doesn't change after init. We deliberately don't list them as deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state,
      source,
      search,
      outcomeFilter,
      datasetFilter,
      modelFilter,
      selectedTrajectory,
      stats,
      datasets,
      models,
      setRowSelection,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrajectoryAtlas(): TrajectoryAtlasContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTrajectoryAtlas must be used within TrajectoryAtlasProvider");
  return v;
}

// --- Arrow result helpers ---------------------------------------------------

// Mosaic returns an Arrow Table. We don't import the apache-arrow types
// directly — these helpers just walk whatever shape comes back.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrowToList(table: any, col: string): string[] {
  if (!table) return [];
  if (typeof table.toArray === "function") {
    return table.toArray().map((r: Record<string, unknown>) => String(r[col] ?? ""));
  }
  if (Array.isArray(table)) {
    return table.map((r) => String((r as Record<string, unknown>)[col] ?? ""));
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrowFirstRow(table: any): Record<string, unknown> | null {
  if (!table) return null;
  if (typeof table.toArray === "function") {
    const arr = table.toArray();
    return arr.length ? (arr[0] as Record<string, unknown>) : null;
  }
  if (Array.isArray(table) && table.length) {
    return table[0] as Record<string, unknown>;
  }
  return null;
}
