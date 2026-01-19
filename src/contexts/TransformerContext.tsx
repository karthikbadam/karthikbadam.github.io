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
  HeadBlockProfile,
  OProjSignature,
} from "../types/transformer";

/**
 * Context for Transformer architecture visualization via DuckDB WASM + Mosaic vgplot
 *
 * Loads 6 parquet tables:
 * 1. model_structure.parquet      - Combined tensor catalog + stats + relations (~1.5k rows)
 * 2. weight_blocks.parquet        - Block-level weight decomposition (~23k rows)
 * 3. activation_snapshot.parquet  - Tokens + layer norm stats (~500 rows)
 * 4. hidden_states.parquet        - Per-position aggregated hidden states (~2M rows)
 * 5. attention_patterns.parquet   - Sparse attention weights (~150k rows)
 * 6. mlp_activations.parquet      - MLP intermediate activations (~100k rows)
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
  
  // Selection state for two-panel navigation
  selectedLayer: number | null;
  selectedModule: 'attn' | 'mlp' | 'norm' | 'embed' | null;
  selectedNormType: 'input_norm' | 'post_norm' | 'final_norm' | null;
  stackIndex: number;
  setSelection: (layer: number | null, module: 'attn' | 'mlp' | 'norm' | 'embed' | null, normType?: 'input_norm' | 'post_norm' | 'final_norm') => void;
  navigateStack: (delta: number) => void;
  
  // Model config (from model_structure table)
  numLayers: number;
  numHeads: number;
  numKVHeads: number;
  hiddenSize: number;
  intermediateSize: number;
  headDim: number;
  
  // Pre-loaded data for rendering
  tensors: Tensor[]; // Used in ArchitectureGraph for node generation
  
  // Prompt info
  promptTokens: Array<{ position: number; token_id: number; token_text: string; is_input: boolean; log_prob: number | null }>;
  numPositions: number;
  
  // Query helpers
  queryTensorStats: (tensorId: string) => Promise<TensorStats | null>;
  queryHeadBlockProfile: (layer: number, head: number) => Promise<HeadBlockProfile | null>;
  queryOProjSignature: (layer: number) => Promise<OProjSignature | null>;
  queryWeightRows: (layer: number, role: string, rowStart?: number, rowEnd?: number) => Promise<Array<{ row_idx: number; values: number[] }>>;
  queryHiddenState: (layer: number, position: number) => Promise<{ norm: number; mean: number; std: number; top_dims: number[]; top_vals: number[] } | null>;
  queryAttentionPattern: (layer: number, head: number) => Promise<Array<{ query_pos: number; key_pos: number; weight: number }>>;
  queryMLPActivation: (layer: number, position: number, stage: string) => Promise<{ norm: number; sparsity: number; top_dims: number[]; top_vals: number[] } | null>;
}

const defaultContext: TransformerContextValue = {
  state: { status: "idle" },
  coordinator: null,
  layerBrush: null,
  headBrush: null,
  blockBrush: null,
  selectedLayer: null,
  selectedModule: null,
  selectedNormType: null,
  stackIndex: 0,
  setSelection: () => {},
  navigateStack: () => {},
  numLayers: 36,
  numHeads: 16,
  numKVHeads: 4,
  hiddenSize: 2048,
  intermediateSize: 11008,
  headDim: 128,
  tensors: [],
  promptTokens: [],
  numPositions: 0,
  queryTensorStats: async () => null,
  queryHeadBlockProfile: async () => null,
  queryOProjSignature: async () => null,
  queryWeightRows: async () => [],
  queryHiddenState: async () => null,
  queryAttentionPattern: async () => [],
  queryMLPActivation: async () => null,
};

const TransformerContext = createContext<TransformerContextValue>(defaultContext);

// Parquet file names
const PARQUET_FILES = {
  modelStructure: "model_structure.parquet",
  activationSnapshot: "activation_snapshot.parquet",
  hiddenStates: "hidden_states.parquet",
  attentionPatterns: "attention_patterns.parquet",
  attentionScores: "attention_scores.parquet",
  mlpActivations: "mlp_activations.parquet",
  // raw_weights split into files by layer and role: raw_weights_l{layer}_{role}.parquet
  getRawWeightsFile: (layer: number, role: string) => `raw_weights_l${layer}_${role}.parquet`,
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
  
  // Selection state
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState<'attn' | 'mlp' | 'norm' | 'embed' | null>(null);
  const [selectedNormType, setSelectedNormType] = useState<'input_norm' | 'post_norm' | 'final_norm' | null>(null);
  const [stackIndex, setStackIndex] = useState(0);
  
  // Model config
  const [numLayers, setNumLayers] = useState(36);
  const [numHeads] = useState(16);
  const [numKVHeads] = useState(4);
  const [hiddenSize] = useState(2048);
  const [intermediateSize] = useState(11008);
  const [headDim] = useState(128);
  
  // Pre-loaded data
  const [tensors, setTensors] = useState<Tensor[]>([]);
  const [promptTokens, setPromptTokens] = useState<Array<{ position: number; token_id: number; token_text: string; is_input: boolean; log_prob: number | null }>>([]);
  const [numPositions, setNumPositions] = useState(0);
  
  const initRef = useRef(false);
  
  // Selection handlers
  const handleSetSelection = useCallback((layer: number | null, module: 'attn' | 'mlp' | 'norm' | 'embed' | null, normType?: 'input_norm' | 'post_norm' | 'final_norm') => {
    setSelectedLayer(layer);
    setSelectedModule(module);
    setSelectedNormType(normType || null);
    setStackIndex(0); // Reset stack when selection changes
  }, []);
  
  const handleNavigateStack = useCallback((delta: number) => {
    setStackIndex((prev) => {
      const maxIndex = selectedModule === 'attn' ? 3 : selectedModule === 'mlp' ? 2 : selectedModule === 'norm' || selectedModule === 'embed' ? 0 : 0;
      const newIndex = prev + delta;
      return Math.max(0, Math.min(maxIndex, newIndex));
    });
  }, [selectedModule]);

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
        await coord.exec(`SET memory_limit = '6GB';`);

        // Load all 6 parquet tables
        setState({
          status: "creating-tables",
          table: "model_structure",
          query: "Loading model structure...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS model_structure AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.modelStructure}'
        `);

        // NOTE: raw_weights.parquet is 4.5GB - too large to load entirely in browser
        // Instead, we'll query it on-demand when needed via direct parquet queries
        // Don't create a table for it - use direct file queries instead
        setState({
          status: "creating-tables",
          table: "raw_weights",
          query: "Skipping raw weights table (will query on-demand)...",
        });
        // Skip loading raw_weights into a table - we'll query it directly when needed

        setState({
          status: "creating-tables",
          table: "activation_snapshot",
          query: "Loading activation snapshot...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS activation_snapshot AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.activationSnapshot}'
        `);

        setState({
          status: "creating-tables",
          table: "hidden_states",
          query: "Loading hidden states...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS hidden_states AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.hiddenStates}'
        `);

        setState({
          status: "creating-tables",
          table: "attention_patterns",
          query: "Loading attention patterns...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS attention_patterns AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.attentionPatterns}'
        `);

        setState({
          status: "creating-tables",
          table: "mlp_activations",
          query: "Loading MLP activations...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS mlp_activations AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.mlpActivations}'
        `);

        setState({
          status: "creating-tables",
          table: "attention_scores",
          query: "Loading attention scores...",
        });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS attention_scores AS
          SELECT * FROM '${dataPath}/${PARQUET_FILES.attentionScores}'
        `);

        // Fetch model config from model_structure table
        const configResult = await coord.query(`
          SELECT 
            MAX(layer) + 1 as num_layers,
            COUNT(DISTINCT CASE WHEN role = 'q' AND layer = 0 THEN 1 END) as has_q
          FROM model_structure
          WHERE layer IS NOT NULL
        `);
        const configRows = arrowTableToArray(configResult);
        if (configRows.length > 0) {
          const nl = Number(configRows[0].num_layers);
          if (nl > 0) setNumLayers(nl);
        }

        // Fetch tensors from model_structure
        const tensorsResult = await coord.query(`SELECT * FROM model_structure ORDER BY layer, module, role`);
        const tensorsRows = arrowTableToArray(tensorsResult) as unknown as Tensor[];
        setTensors(tensorsRows);

        // Tensor stats are available via queryTensorStats, no need to pre-load

        // Fetch prompt tokens
        const tokensResult = await coord.query(`
          SELECT * FROM activation_snapshot 
          WHERE type = 'token'
          ORDER BY position
        `);
        const tokenRows = arrowTableToArray(tokensResult);
        const tokens = tokenRows.map((row) => ({
          position: Number(row.position),
          token_id: Number(row.token_id),
          token_text: String(row.token_text || ''),
          is_input: Boolean(row.is_input),
          log_prob: row.log_prob !== null ? Number(row.log_prob) : null,
        }));
        setPromptTokens(tokens);
        setNumPositions(tokens.length);

        // Head/KV aggregates can be queried on-demand, no need to pre-load

        // Create crossfilter selections
        const $layerBrush = vg.Selection.crossfilter();
        setLayerBrush($layerBrush);

        const $headBrush = vg.Selection.single();
        setHeadBrush($headBrush);

        const $blockBrush = vg.Selection.crossfilter();
        setBlockBrush($blockBrush);

        setState({ status: "ready" });
        
        // Set embedding as default selection
        handleSetSelection(null, "embed");
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
          `SELECT * FROM model_structure WHERE tensor_id = '${tensorId}' LIMIT 1`
        );
        const rows = arrowTableToArray(result);
        if (rows.length === 0) return null;
        const row = rows[0];
        return {
          tensor_id: String(row.tensor_id),
          fro_norm: Number(row.fro_norm || 0),
          mean_abs: Number(row.mean_abs || 0),
          std: Number(row.std || 0),
          p95_abs: Number(row.p95_abs || 0),
          p99_abs: Number(row.p99_abs || 0),
          zero_frac: Number(row.zero_frac || 0),
          min: Number(row.min || 0),
          max: Number(row.max || 0),
        };
      } catch (err) {
        console.error("queryTensorStats error:", err);
        return null;
      }
    },
    [coordinator]
  );

  const queryHeadBlockProfile = useCallback(
    async (layer: number, head: number): Promise<HeadBlockProfile | null> => {
      if (!coordinator) return null;
      try {
        // Query raw_weights.parquet directly (on-demand) instead of loading entire table
        const baseUrl = window.location.origin;
        const hashBase = window.location.pathname.replace(/\/$/, "");
        const dataPath = `${baseUrl}${hashBase}/data/llm`;
        
        // For raw_weights, compute block-level stats from row data
        // Each head has 128 rows (HEAD_DIM), group by input block (chunk columns into blocks of 128)
        const BLOCK_DIM = 128;
        const HEAD_DIM = 128; // 2048 / 16 = 128
        const qFile = PARQUET_FILES.getRawWeightsFile(layer, 'q');
        const result = await coordinator.query(`
          WITH head_rows AS (
            SELECT row_idx, values, col_end
            FROM '${dataPath}/${qFile}'
            WHERE row_idx >= ${head * HEAD_DIM} AND row_idx < ${(head + 1) * HEAD_DIM}
          ),
          block_stats AS (
            SELECT 
              CAST((col_end / ${BLOCK_DIM}) AS INTEGER) - 1 as in_block,
              SQRT(SUM(LIST_SUM(LIST_TRANSFORM(values, x -> x * x)))) as fro_norm
            FROM head_rows
            GROUP BY in_block
          )
          SELECT in_block, fro_norm
          FROM block_stats
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
        // Query raw_weights.parquet directly (on-demand) instead of loading entire table
        const baseUrl = window.location.origin;
        const hashBase = window.location.pathname.replace(/\/$/, "");
        const dataPath = `${baseUrl}${hashBase}/data/llm`;
        
        // For raw_weights, compute block-level stats from row data
        // O projection: out_block = row_idx / BLOCK_DIM, in_block computed from column position
        const BLOCK_DIM = 128;
        const oFile = PARQUET_FILES.getRawWeightsFile(layer, 'o');
        const result = await coordinator.query(`
          WITH expanded AS (
            SELECT 
              row_idx,
              CAST((row_idx / ${BLOCK_DIM}) AS INTEGER) as out_block,
              UNNEST(GENERATE_SERIES(0, col_end - 1)) as col_idx,
              UNNEST(values) as weight_val
            FROM '${dataPath}/${oFile}'
          ),
          block_aggregated AS (
            SELECT 
              out_block,
              CAST((col_idx / ${BLOCK_DIM}) AS INTEGER) as in_block,
              SQRT(SUM(POW(weight_val, 2))) as fro_norm
            FROM expanded
            GROUP BY out_block, in_block
          )
          SELECT out_block, in_block, fro_norm
          FROM block_aggregated
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

  const queryWeightRows = useCallback(
    async (layer: number, role: string, rowStart?: number, rowEnd?: number): Promise<Array<{ row_idx: number; values: number[] }>> => {
      if (!coordinator) return [];
      try {
        // Query raw_weights.parquet directly (on-demand) instead of loading entire table
        const baseUrl = window.location.origin;
        const hashBase = window.location.pathname.replace(/\/$/, "");
        const dataPath = `${baseUrl}${hashBase}/data/llm`;
        
        const weightFile = PARQUET_FILES.getRawWeightsFile(layer, role);
        let query = `
          SELECT row_idx, values
          FROM '${dataPath}/${weightFile}'
        `;
        if (rowStart !== undefined) {
          query += ` AND row_idx >= ${rowStart}`;
        }
        if (rowEnd !== undefined) {
          query += ` AND row_idx < ${rowEnd}`;
        }
        query += ` ORDER BY row_idx LIMIT 10000`; // Limit to prevent memory issues
        
        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result) as unknown as Record<string, unknown>[];
        return rows.map((r) => ({
          row_idx: Number(r.row_idx),
          values: Array.isArray(r.values) ? (r.values as number[]) : [],
        }));
      } catch (err) {
        console.error("queryWeightRows error:", err);
        return [];
      }
    },
    [coordinator]
  );

  const queryHiddenState = useCallback(
    async (layer: number, position: number): Promise<{ norm: number; mean: number; std: number; top_dims: number[]; top_vals: number[] } | null> => {
      if (!coordinator) return null;
      try {
        const result = await coordinator.query(`
          SELECT * FROM hidden_states
          WHERE layer = ${layer} AND position = ${position}
          LIMIT 1
        `);
        const rows = arrowTableToArray(result);
        if (rows.length === 0) return null;
        const row = rows[0];
        // Parse top_dims and top_vals from arrays (stored as JSON strings or lists)
        let top_dims: number[] = [];
        let top_vals: number[] = [];
        if (row.top_dims) {
          if (typeof row.top_dims === 'string') {
            top_dims = JSON.parse(row.top_dims);
          } else if (Array.isArray(row.top_dims)) {
            top_dims = row.top_dims.map(Number);
          }
        }
        if (row.top_vals) {
          if (typeof row.top_vals === 'string') {
            top_vals = JSON.parse(row.top_vals);
          } else if (Array.isArray(row.top_vals)) {
            top_vals = row.top_vals.map(Number);
          }
        }
        return {
          norm: Number(row.norm),
          mean: Number(row.mean),
          std: Number(row.std),
          top_dims,
          top_vals,
        };
      } catch (err) {
        console.error("queryHiddenState error:", err);
        return null;
      }
    },
    [coordinator]
  );

  const queryAttentionPattern = useCallback(
    async (layer: number, head: number): Promise<Array<{ query_pos: number; key_pos: number; weight: number }>> => {
      if (!coordinator) return [];
      try {
        const result = await coordinator.query(`
          SELECT query_pos, key_pos, weight
          FROM attention_patterns
          WHERE layer = ${layer} AND head = ${head}
          ORDER BY query_pos, key_pos
        `);
        const rows = arrowTableToArray(result) as unknown as Record<string, unknown>[];
        return rows.map((r) => ({
          query_pos: Number(r.query_pos),
          key_pos: Number(r.key_pos),
          weight: Number(r.weight),
        }));
      } catch (err) {
        console.error("queryAttentionPattern error:", err);
        return [];
      }
    },
    [coordinator]
  );

  const queryMLPActivation = useCallback(
    async (layer: number, position: number, stage: string): Promise<{ norm: number; sparsity: number; top_dims: number[]; top_vals: number[] } | null> => {
      if (!coordinator) return null;
      try {
        // Get values list and compute stats in JavaScript
        const result = await coordinator.query(`
          SELECT values
          FROM mlp_activations
          WHERE layer = ${layer} AND position = ${position} AND stage = '${stage}'
          LIMIT 1
        `);
        const rows = arrowTableToArray(result);
        if (rows.length === 0) return null;
        const row = rows[0];
        
        // Extract values array
        let values: number[] = [];
        if (row.values) {
          if (typeof row.values === 'string') {
            values = JSON.parse(row.values);
          } else if (Array.isArray(row.values)) {
            values = row.values.map(Number);
          }
        }
        
        if (values.length === 0) return null;
        
        // Compute norm (Frobenius norm)
        const norm = Math.sqrt(values.reduce((sum, val) => sum + val * val, 0));
        
        // Compute sparsity (fraction of near-zero values)
        const nearZeroCount = values.filter(val => Math.abs(val) < 1e-6).length;
        const sparsity = nearZeroCount / values.length;
        
        // Compute top dimensions and values
        const indexed = values.map((val, idx) => ({ idx, val: Math.abs(val) }));
        indexed.sort((a, b) => b.val - a.val);
        const top_k = Math.min(10, indexed.length);
        const top_dims = indexed.slice(0, top_k).map(item => item.idx);
        const top_vals = indexed.slice(0, top_k).map(item => values[item.idx]);
        
        return {
          norm,
          sparsity,
          top_dims,
          top_vals,
        };
      } catch (err) {
        console.error("queryMLPActivation error:", err);
        return null;
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
        selectedLayer,
        selectedModule,
        selectedNormType,
        stackIndex,
        setSelection: handleSetSelection,
        navigateStack: handleNavigateStack,
        numLayers,
        numHeads,
        numKVHeads,
        hiddenSize,
        intermediateSize,
        headDim,
        tensors,
        promptTokens,
        numPositions,
        queryTensorStats,
        queryHeadBlockProfile,
        queryOProjSignature,
        queryWeightRows,
        queryHiddenState,
        queryAttentionPattern,
        queryMLPActivation,
      }}
    >
      {children}
    </TransformerContext.Provider>
  );
}

export const useTransformer = () => useContext(TransformerContext);
