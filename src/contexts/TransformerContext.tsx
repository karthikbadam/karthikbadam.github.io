import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import * as vg from "@uwdata/vgplot";
import { LoadingState } from "../types/loading";
import type {
  Tensor,
  TensorStats,
  TensorDim,
  TensorBlock,
  TensorRelation,
  HeadAggregate,
  KVAggregate,
  HeadBlockProfile,
  OProjSignature,
} from "../types/transformer";

/**
 * Context for Transformer architecture visualization via DuckDB WASM + Mosaic vgplot
 *
 * Loads 6 semantic parquet tables:
 * 1. tensors.parquet        - Tensor catalog (~326 rows)
 * 2. tensor_stats.parquet   - Whole-tensor metrics (~326 rows)
 * 3. tensor_dims.parquet    - Per-output-dimension metrics (~976k rows)
 * 4. tensor_blocks.parquet  - Semantic block decomposition (~23k rows)
 * 5. tensor_block_topk.parquet - Sparse weight anchors (~370k rows)
 * 6. tensor_relations.parquet  - Semantic relations (~1k rows)
 */

type VgSelection = vg.Selection;
type Coordinator = vg.Coordinator;

interface TransformerContextValue {
  state: LoadingState;
  coordinator: Coordinator | null;
  
  // Selections for cross-filtering
  layerBrush: VgSelection | null;
  headBrush: VgSelection | null;
  blockBrush: VgSelection | null;
  
  // Model config (from tensors table)
  numLayers: number;
  numHeads: number;
  numKVHeads: number;
  hiddenSize: number;
  intermediateSize: number;
  headDim: number;
  
  // Pre-loaded data for rendering
  tensors: Tensor[];
  tensorStats: Map<string, TensorStats>;
  headAggregates: HeadAggregate[];
  kvAggregates: KVAggregate[];
  
  // Query helpers
  queryTensorStats: (tensorId: string) => Promise<TensorStats | null>;
  queryDimStats: (tensorId: string, head: number | null, dim: number) => Promise<TensorDim | null>;
  queryHeadAggregate: (layer: number, head: number) => Promise<HeadAggregate | null>;
  queryHeadBlockProfile: (layer: number, head: number) => Promise<HeadBlockProfile | null>;
  queryOProjSignature: (layer: number) => Promise<OProjSignature | null>;
  queryDimsForLayer: (layer: number, role: string) => Promise<TensorDim[]>;
}

const defaultContext: TransformerContextValue = {
  state: { status: "idle" },
  coordinator: null,
  layerBrush: null,
  headBrush: null,
  blockBrush: null,
  numLayers: 36,
  numHeads: 16,
  numKVHeads: 4,
  hiddenSize: 2048,
  intermediateSize: 11008,
  headDim: 128,
  tensors: [],
  tensorStats: new Map(),
  headAggregates: [],
  kvAggregates: [],
  queryTensorStats: async () => null,
  queryDimStats: async () => null,
  queryHeadAggregate: async () => null,
  queryHeadBlockProfile: async () => null,
  queryOProjSignature: async () => null,
  queryDimsForLayer: async () => [],
};

const TransformerContext = createContext<TransformerContextValue>(defaultContext);

// Parquet file names
const PARQUET_FILES = {
  tensors: "tensors.parquet",
  tensorStats: "tensor_stats.parquet",
  tensorDims: "tensor_dims.parquet",
  tensorBlocks: "tensor_blocks.parquet",
  tensorBlockTopk: "tensor_block_topk.parquet",
  tensorRelations: "tensor_relations.parquet",
};

// Helper to convert Arrow table to array of objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrowTableToArray(table: any): Record<string, unknown>[] {
  if (!table || typeof table.numRows !== "number") return [];
  const result: Record<string, unknown>[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const row = table.get(i);
    const obj: Record<string, unknown> = {};
    for (const field of table.schema.fields) {
      obj[field.name] = row[field.name];
    }
    result.push(obj);
  }
  return result;
}

export function TransformerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadingState>({ status: "idle" });
  const [coordinator, setCoordinator] = useState<Coordinator | null>(null);
  const [layerBrush, setLayerBrush] = useState<VgSelection | null>(null);
  const [headBrush, setHeadBrush] = useState<VgSelection | null>(null);
  const [blockBrush, setBlockBrush] = useState<VgSelection | null>(null);
  
  // Model config
  const [numLayers, setNumLayers] = useState(36);
  const [numHeads, setNumHeads] = useState(16);
  const [numKVHeads, setNumKVHeads] = useState(4);
  const [hiddenSize, setHiddenSize] = useState(2048);
  const [intermediateSize, setIntermediateSize] = useState(11008);
  const [headDim, setHeadDim] = useState(128);
  
  // Pre-loaded data
  const [tensors, setTensors] = useState<Tensor[]>([]);
  const [tensorStats, setTensorStats] = useState<Map<string, TensorStats>>(new Map());
  const [headAggregates, setHeadAggregates] = useState<HeadAggregate[]>([]);
  const [kvAggregates, setKvAggregates] = useState<KVAggregate[]>([]);
  
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        setState({ status: "initializing" });

        // Initialize DuckDB WASM via Mosaic vgplot connector
        const connector = vg.wasmConnector();
        const coord = new vg.Coordinator(connector, {
          cache: false,
          preagg: { enabled: false },
        });
        vg.coordinator(coord).databaseConnector(connector);
        await connector.getDuckDB();
        setCoordinator(coord);

        // Build base URL for parquet files
        const baseUrl = window.location.origin;
        const hashBase = window.location.pathname.replace(/\/$/, "");
        const dataPath = `${baseUrl}${hashBase}/data/llm`;

        // Install httpfs for remote parquet access
        setState({
          status: "loading-parquet",
          message: "Transformer architecture data",
        });

        await coord.exec(`INSTALL httpfs; LOAD httpfs;`);
        await coord.exec(`SET threads = 1;`);
        await coord.exec(`SET memory_limit = '4GB';`);

        // Load all 6 parquet tables
        setState({
          status: "creating-tables",
          table: "tensors",
          query: "Loading tensor catalog...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS tensors AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.tensors}'
        `);

        setState({
          status: "creating-tables",
          table: "tensor_stats",
          query: "Loading tensor stats...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS tensor_stats AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.tensorStats}'
        `);

        setState({
          status: "creating-tables",
          table: "tensor_dims",
          query: "Loading dimension stats (~976k rows)...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS tensor_dims AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.tensorDims}'
        `);

        setState({
          status: "creating-tables",
          table: "tensor_blocks",
          query: "Loading block stats...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS tensor_blocks AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.tensorBlocks}'
        `);

        setState({
          status: "creating-tables",
          table: "tensor_block_topk",
          query: "Loading top-k weights...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS tensor_block_topk AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.tensorBlockTopk}'
        `);

        setState({
          status: "creating-tables",
          table: "tensor_relations",
          query: "Loading relations...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS tensor_relations AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.tensorRelations}'
        `);

        // Create pre-computed views
        setState({
          status: "creating-tables",
          table: "views",
          query: "Creating aggregation views...",
        });

        // Head aggregates: sum row_l2 per (layer, head) for Q dims
        await coord.exec(`
          CREATE OR REPLACE VIEW head_aggregates AS
          SELECT 
            layer,
            head,
            SUM(row_l2) as total_l2,
            AVG(row_mean_abs) as avg_mean_abs,
            MAX(row_p95_abs) as max_p95_abs
          FROM tensor_dims
          WHERE role = 'q' AND head IS NOT NULL
          GROUP BY layer, head
          ORDER BY layer, head
        `);

        // KV aggregates: sum row_l2 per (layer, kv_head) for K+V
        await coord.exec(`
          CREATE OR REPLACE VIEW kv_aggregates AS
          SELECT 
            layer,
            head as kv_head,
            SUM(CASE WHEN role = 'k' THEN row_l2 ELSE 0 END) as k_total_l2,
            SUM(CASE WHEN role = 'v' THEN row_l2 ELSE 0 END) as v_total_l2,
            SUM(row_l2) as combined_l2
          FROM tensor_dims
          WHERE role IN ('k', 'v') AND head IS NOT NULL
          GROUP BY layer, head
          ORDER BY layer, head
        `);

        // Fetch model config from tensors table
        const configResult = await coord.query(`
          SELECT 
            MAX(layer) + 1 as num_layers,
            COUNT(DISTINCT CASE WHEN role = 'q' AND layer = 0 THEN 1 END) as has_q
          FROM tensors
          WHERE layer IS NOT NULL
        `);
        const configRows = arrowTableToArray(configResult);
        if (configRows.length > 0) {
          const nl = Number(configRows[0].num_layers);
          if (nl > 0) setNumLayers(nl);
        }

        // Fetch tensors
        const tensorsResult = await coord.query(`SELECT * FROM tensors ORDER BY layer, module, role`);
        const tensorsRows = arrowTableToArray(tensorsResult) as Tensor[];
        setTensors(tensorsRows);

        // Fetch tensor stats into map
        const statsResult = await coord.query(`SELECT * FROM tensor_stats`);
        const statsRows = arrowTableToArray(statsResult) as TensorStats[];
        const statsMap = new Map<string, TensorStats>();
        statsRows.forEach((s) => statsMap.set(s.tensor_id, s));
        setTensorStats(statsMap);

        // Fetch head aggregates
        const headAggResult = await coord.query(`SELECT * FROM head_aggregates`);
        const headAggRows = arrowTableToArray(headAggResult).map((row) => ({
          layer: Number(row.layer),
          head: Number(row.head),
          total_l2: Number(row.total_l2),
          avg_mean_abs: Number(row.avg_mean_abs),
          max_p95_abs: Number(row.max_p95_abs),
        }));
        setHeadAggregates(headAggRows);

        // Fetch KV aggregates
        const kvAggResult = await coord.query(`SELECT * FROM kv_aggregates`);
        const kvAggRows = arrowTableToArray(kvAggResult).map((row) => ({
          layer: Number(row.layer),
          kv_head: Number(row.kv_head),
          k_total_l2: Number(row.k_total_l2),
          v_total_l2: Number(row.v_total_l2),
          combined_l2: Number(row.combined_l2),
        }));
        setKvAggregates(kvAggRows);

        // Create crossfilter selections
        const $layerBrush = vg.Selection.crossfilter();
        setLayerBrush($layerBrush);

        const $headBrush = vg.Selection.single();
        setHeadBrush($headBrush);

        const $blockBrush = vg.Selection.crossfilter();
        setBlockBrush($blockBrush);

        setState({ status: "ready" });
      } catch (err) {
        console.error("Failed to initialize Transformer context:", err);
        setState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "Unknown error loading transformer data",
        });
      }
    };

    init();
  }, []);

  // Query helpers
  const queryTensorStats = useCallback(
    async (tensorId: string): Promise<TensorStats | null> => {
      if (!coordinator) return null;
      try {
        const result = await coordinator.query(
          `SELECT * FROM tensor_stats WHERE tensor_id = '${tensorId}' LIMIT 1`
        );
        const rows = arrowTableToArray(result) as TensorStats[];
        return rows[0] || null;
      } catch (err) {
        console.error("queryTensorStats error:", err);
        return null;
      }
    },
    [coordinator]
  );

  const queryDimStats = useCallback(
    async (tensorId: string, head: number | null, dim: number): Promise<TensorDim | null> => {
      if (!coordinator) return null;
      try {
        const headClause = head !== null ? `AND head = ${head}` : "AND head IS NULL";
        const result = await coordinator.query(
          `SELECT * FROM tensor_dims WHERE tensor_id = '${tensorId}' ${headClause} AND dim = ${dim} LIMIT 1`
        );
        const rows = arrowTableToArray(result) as TensorDim[];
        return rows[0] || null;
      } catch (err) {
        console.error("queryDimStats error:", err);
        return null;
      }
    },
    [coordinator]
  );

  const queryHeadAggregate = useCallback(
    async (layer: number, head: number): Promise<HeadAggregate | null> => {
      if (!coordinator) return null;
      try {
        const result = await coordinator.query(
          `SELECT * FROM head_aggregates WHERE layer = ${layer} AND head = ${head} LIMIT 1`
        );
        const rows = arrowTableToArray(result);
        if (rows.length === 0) return null;
        return {
          layer: Number(rows[0].layer),
          head: Number(rows[0].head),
          total_l2: Number(rows[0].total_l2),
          avg_mean_abs: Number(rows[0].avg_mean_abs),
          max_p95_abs: Number(rows[0].max_p95_abs),
        };
      } catch (err) {
        console.error("queryHeadAggregate error:", err);
        return null;
      }
    },
    [coordinator]
  );

  const queryHeadBlockProfile = useCallback(
    async (layer: number, head: number): Promise<HeadBlockProfile | null> => {
      if (!coordinator) return null;
      try {
        const result = await coordinator.query(`
          SELECT in_block, fro_norm
          FROM tensor_blocks
          WHERE layer = ${layer} AND role = 'q' AND head = ${head}
          ORDER BY in_block
        `);
        const rows = arrowTableToArray(result);
        if (rows.length === 0) return null;
        return {
          layer,
          head,
          in_block_norms: rows.map((r) => Number(r.fro_norm)),
        };
      } catch (err) {
        console.error("queryHeadBlockProfile error:", err);
        return null;
      }
    },
    [coordinator]
  );

  const queryOProjSignature = useCallback(
    async (layer: number): Promise<OProjSignature | null> => {
      if (!coordinator) return null;
      try {
        const result = await coordinator.query(`
          SELECT out_block, in_block, fro_norm
          FROM tensor_blocks
          WHERE layer = ${layer} AND role = 'o'
          ORDER BY out_block, in_block
        `);
        const rows = arrowTableToArray(result);
        if (rows.length === 0) return null;
        
        // Build 16x16 matrix
        const matrix: number[][] = Array.from({ length: 16 }, () => Array(16).fill(0));
        rows.forEach((r) => {
          const outBlock = Number(r.out_block);
          const inBlock = Number(r.in_block);
          if (outBlock < 16 && inBlock < 16) {
            matrix[outBlock][inBlock] = Number(r.fro_norm);
          }
        });
        
        return { layer, matrix };
      } catch (err) {
        console.error("queryOProjSignature error:", err);
        return null;
      }
    },
    [coordinator]
  );

  const queryDimsForLayer = useCallback(
    async (layer: number, role: string): Promise<TensorDim[]> => {
      if (!coordinator) return [];
      try {
        const result = await coordinator.query(`
          SELECT * FROM tensor_dims
          WHERE layer = ${layer} AND role = '${role}'
          ORDER BY head, dim
        `);
        return arrowTableToArray(result) as TensorDim[];
      } catch (err) {
        console.error("queryDimsForLayer error:", err);
        return [];
      }
    },
    [coordinator]
  );

  return (
    <TransformerContext.Provider
      value={{
        state,
        coordinator,
        layerBrush,
        headBrush,
        blockBrush,
        numLayers,
        numHeads,
        numKVHeads,
        hiddenSize,
        intermediateSize,
        headDim,
        tensors,
        tensorStats,
        headAggregates,
        kvAggregates,
        queryTensorStats,
        queryDimStats,
        queryHeadAggregate,
        queryHeadBlockProfile,
        queryOProjSignature,
        queryDimsForLayer,
      }}
    >
      {children}
    </TransformerContext.Provider>
  );
}

export const useTransformer = () => useContext(TransformerContext);
