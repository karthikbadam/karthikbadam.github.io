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

/**
 * Context for Transformer architecture visualization via DuckDB WASM + Mosaic vgplot
 *
 * Loads parquet tables:
 * - activation_snapshot.parquet  - Tokens + layer norm stats
 * - hidden_states.parquet        - Per-position aggregated hidden states
 * - attention_patterns.parquet   - Sparse attention weights
 * - mlp_activations.parquet      - MLP intermediate activations
 * - attention_scores.parquet     - Pre-softmax attention scores (optional, only if SAVE_ATTENTION_SCORES=True)
 * - attn_head_metrics.parquet    - Attention head metrics
 * - mlp_metrics.parquet          - MLP metrics
 * - hidden_metrics.parquet       - Hidden state metrics
 * - head_contrib_metrics.parquet - Head contribution metrics
 */

type Coordinator = vg.Coordinator;

interface TransformerContextValue {
  state: LoadingState;
  coordinator: Coordinator | null;
  
  // Model config (from model_structure table)
  numLayers: number;
  numHeads: number;
  numKVHeads: number;
  
  // Prompt info
  promptTokens: Array<{ position: number; token_id: number; token_text: string; is_input: boolean; log_prob: number | null }>;
  availablePrompts: Array<{ prompt_id: number; prompt_text: string }>;
  selectedPromptId: number | null;
  setSelectedPromptId: (id: number) => void;
  
  // Global mode (replaces independent selectors)
  selectedMode: 'overview' | 'attention' | 'mlp' | 'contribution';
  setSelectedMode: (mode: 'overview' | 'attention' | 'mlp' | 'contribution') => void;
  advancedMode: boolean;
  setAdvancedMode: (enabled: boolean) => void;
  
  // Metric selection (constrained by mode)
  selectedMetric: string;
  setSelectedMetric: (metric: string) => void;
  
  // Aggregation method (explicitly defined)
  aggregationMethod: 'mean' | 'max' | 'min' | 'topk_mean';
  setAggregationMethod: (method: 'mean' | 'max' | 'min' | 'topk_mean') => void;
  
  // Token selection (brushing + multi-token)
  selectedTokenRange: [number, number] | null;
  setSelectedTokenRange: (range: [number, number] | null) => void;
  selectedTokenSet: number[];
  setSelectedTokenSet: (tokens: number[]) => void;
  addTokenToSet: (token: number) => void;
  addRangeToSet: (range: [number, number]) => void;
  
  // Layer selection (for faceting)
  selectedLayerRange: [number, number] | null;
  setSelectedLayerRange: (range: [number, number] | null) => void;
  
  // Query helpers for heatmap visualization
  queryHiddenState: (layer: number, position: number) => Promise<{ norm: number; mean: number; std: number; top_dims: number[]; top_vals: number[] } | null>;
  queryMLPActivation: (layer: number, position: number, stage: string) => Promise<{ norm: number; sparsity: number; top_dims: number[]; top_vals: number[] } | null>;
  queryTokenLayerHeatmap: (
    promptId: number,
    metric: string,
    aggregation: 'mean' | 'max' | 'min' | 'topk_mean',
    tokenRange?: [number, number] | null,
    layerRange?: [number, number] | null
  ) => Promise<Array<{ position: number; layer: number; value: number }>>;
  queryTokenHeadHeatmap: (
    promptId: number,
    layer: number,
    metric: string
  ) => Promise<Array<{ position: number; head: number; value: number }>>;
  queryLayerSummary: (
    promptId: number,
    metric: string,
    aggregation: 'mean' | 'max' | 'min'
  ) => Promise<Array<{ layer: number; mean: number; max: number; min: number }>>;
  queryTopKHeads: (
    promptId: number,
    layer: number,
    metric: 'contrib_l2' | 'contrib_to_argmax_logit_normed',
    k: number
  ) => Promise<Array<{ head: number; position: number; value: number }>>;
}

const defaultContext: TransformerContextValue = {
  state: { status: "idle" },
  coordinator: null,
  numLayers: 36,
  numHeads: 16,
  numKVHeads: 4,
  promptTokens: [],
  availablePrompts: [],
  selectedPromptId: null,
  setSelectedPromptId: () => {},
  selectedMode: 'overview',
  setSelectedMode: () => {},
  advancedMode: false,
  setAdvancedMode: () => {},
  selectedMetric: 'hidden_norm',
  setSelectedMetric: () => {},
  aggregationMethod: 'mean',
  setAggregationMethod: () => {},
  selectedTokenRange: null,
  setSelectedTokenRange: () => {},
  selectedTokenSet: [],
  setSelectedTokenSet: () => {},
  addTokenToSet: () => {},
  addRangeToSet: () => {},
  selectedLayerRange: null,
  setSelectedLayerRange: () => {},
  queryHiddenState: async () => null,
  queryMLPActivation: async () => null,
  queryTokenLayerHeatmap: async () => [],
  queryTokenHeadHeatmap: async () => [],
  queryLayerSummary: async () => [],
  queryTopKHeads: async () => [],
};

const TransformerContext = createContext<TransformerContextValue>(defaultContext);

// Parquet file names
const PARQUET_FILES = {
  activationSnapshot: "activation_snapshot.parquet",
  hiddenStates: "hidden_states.parquet",
  attentionPatterns: "attention_patterns.parquet",
  attentionScores: "attention_scores.parquet",
  mlpActivations: "mlp_activations.parquet",
  // New metric tables
  attnHeadMetrics: "attn_head_metrics.parquet",
  mlpMetrics: "mlp_metrics.parquet",
  hiddenMetrics: "hidden_metrics.parquet",
  headContribMetrics: "head_contrib_metrics.parquet",
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
  
  // Model config
  const [numLayers, setNumLayers] = useState(36);
  const [numHeads] = useState(16);
  const [numKVHeads] = useState(4);
  
  // Prompt info
  const [promptTokens, setPromptTokens] = useState<Array<{ position: number; token_id: number; token_text: string; is_input: boolean; log_prob: number | null }>>([]);
  const [availablePrompts, setAvailablePrompts] = useState<Array<{ prompt_id: number; prompt_text: string }>>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  
  // Global mode
  const [selectedMode, setSelectedMode] = useState<'overview' | 'attention' | 'mlp' | 'contribution'>('overview');
  const [advancedMode, setAdvancedMode] = useState(false);
  
  // Metric selection
  const [selectedMetric, setSelectedMetric] = useState<string>('hidden_norm');
  
  // Aggregation method
  const [aggregationMethod, setAggregationMethod] = useState<'mean' | 'max' | 'min' | 'topk_mean'>('mean');
  
  // Token selection
  const [selectedTokenRange, setSelectedTokenRange] = useState<[number, number] | null>(null);
  const [selectedTokenSet, setSelectedTokenSet] = useState<number[]>([]);
  
  // Layer selection
  const [selectedLayerRange, setSelectedLayerRange] = useState<[number, number] | null>(null);
  
  const initRef = useRef(false);

  // Token set handlers
  const handleAddTokenToSet = useCallback((token: number) => {
    setSelectedTokenSet((prev) => {
      if (prev.includes(token)) {
        return prev.filter((t) => t !== token);
      } else {
        return [...prev, token];
      }
    });
  }, []);

  const handleAddRangeToSet = useCallback((range: [number, number]) => {
    setSelectedTokenSet((prev) => {
      const newSet = new Set(prev);
      for (let i = range[0]; i <= range[1]; i++) {
        newSet.add(i);
      }
      return Array.from(newSet);
    });
  }, []);

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

         // Load new metric tables
         const attnHeadMetricsQuery = `CREATE TABLE IF NOT EXISTS attn_head_metrics AS SELECT * FROM '${dataPath}/${PARQUET_FILES.attnHeadMetrics}'`;
         setState({
           status: "creating-tables",
           table: "attn_head_metrics",
           query: attnHeadMetricsQuery,
         });
         await coord.exec(attnHeadMetricsQuery);


        const mlpMetricsQuery = `CREATE TABLE IF NOT EXISTS mlp_metrics AS SELECT * FROM '${dataPath}/${PARQUET_FILES.mlpMetrics}'`;
        setState({
          status: "creating-tables",
          table: "mlp_metrics",
          query: mlpMetricsQuery,
        });
        await coord.exec(mlpMetricsQuery);

        const hiddenMetricsQuery = `CREATE TABLE IF NOT EXISTS hidden_metrics AS SELECT * FROM '${dataPath}/${PARQUET_FILES.hiddenMetrics}'`;
        setState({
          status: "creating-tables",
          table: "hidden_metrics",
          query: hiddenMetricsQuery,
        });
        await coord.exec(hiddenMetricsQuery);

        const headContribMetricsQuery = `CREATE TABLE IF NOT EXISTS head_contrib_metrics AS SELECT * FROM '${dataPath}/${PARQUET_FILES.headContribMetrics}'`;
        setState({
          status: "creating-tables",
          table: "head_contrib_metrics",
          query: headContribMetricsQuery,
        });
        await coord.exec(headContribMetricsQuery);


        // Skip loading raw_weights into a table - we'll query it directly when needed

        const activationSnapshotQuery = `CREATE TABLE IF NOT EXISTS activation_snapshot AS SELECT * FROM '${dataPath}/${PARQUET_FILES.activationSnapshot}'`;
        setState({
          status: "creating-tables",
          table: "activation_snapshot",
          query: activationSnapshotQuery,
        });
        await coord.exec(activationSnapshotQuery);

        const hiddenStatesQuery = `CREATE TABLE IF NOT EXISTS hidden_states AS SELECT * FROM '${dataPath}/${PARQUET_FILES.hiddenStates}'`;
        setState({
          status: "creating-tables",
          table: "hidden_states",
          query: hiddenStatesQuery,
        });
        await coord.exec(hiddenStatesQuery);

        const attentionPatternsQuery = `CREATE TABLE IF NOT EXISTS attention_patterns AS SELECT * FROM '${dataPath}/${PARQUET_FILES.attentionPatterns}'`;
        setState({
          status: "creating-tables",
          table: "attention_patterns",
          query: attentionPatternsQuery,
        });
        await coord.exec(attentionPatternsQuery);

        const mlpActivationsQuery = `CREATE TABLE IF NOT EXISTS mlp_activations AS SELECT * FROM '${dataPath}/${PARQUET_FILES.mlpActivations}'`;
        setState({
          status: "creating-tables",
          table: "mlp_activations",
          query: mlpActivationsQuery,
        });
        await coord.exec(mlpActivationsQuery);

        // attention_scores is optional (only created if SAVE_ATTENTION_SCORES=True)
        // Try to load it, but don't fail if it doesn't exist
        try {
          const attentionScoresQuery = `CREATE TABLE IF NOT EXISTS attention_scores AS SELECT * FROM '${dataPath}/${PARQUET_FILES.attentionScores}'`;
          setState({
            status: "creating-tables",
            table: "attention_scores",
            query: attentionScoresQuery,
          });
          await coord.exec(attentionScoresQuery);
        } catch (err) {
          console.warn("attention_scores.parquet not found or invalid (this is OK if SAVE_ATTENTION_SCORES=False):", err);
          // Create empty table to avoid errors in queries
          const emptyAttentionScoresQuery = `CREATE TABLE IF NOT EXISTS attention_scores AS SELECT CAST(NULL AS INTEGER) as prompt_id, CAST(NULL AS INTEGER) as layer, CAST(NULL AS INTEGER) as head, CAST(NULL AS INTEGER) as query_pos, CAST(NULL AS INTEGER) as key_pos, CAST(NULL AS DOUBLE) as score WHERE FALSE`;
          setState({
            status: "creating-tables",
            table: "attention_scores",
            query: emptyAttentionScoresQuery,
          });
          await coord.exec(emptyAttentionScoresQuery);
        }

      
        // Derive numLayers from actual data (hidden_metrics or attn_head_metrics)
        // This is more reliable than model_structure and doesn't require that file
        try {
          const numLayersQuery = `SELECT MAX(layer) + 1 as num_layers FROM (SELECT layer FROM hidden_metrics UNION SELECT layer FROM attn_head_metrics) WHERE layer IS NOT NULL`;
          setState({
            status: "updating-tables",
            message: "Deriving model configuration",
            query: numLayersQuery,
          });
          const configResult = await coord.query(numLayersQuery);
          const configRows = arrowTableToArray(configResult);
          if (configRows.length > 0 && configRows[0].num_layers !== null) {
            const nl = Number(configRows[0].num_layers);
            if (nl > 0) setNumLayers(nl);
          }
        } catch (err) {
          console.warn("Could not derive numLayers from data, using default (36):", err);
          // Keep default value of 36
        }

        // Extract available prompts
        const promptsQuery = `SELECT DISTINCT prompt_id, prompt_text FROM activation_snapshot WHERE prompt_id IS NOT NULL AND prompt_text IS NOT NULL ORDER BY prompt_id`;
        setState({
          status: "updating-tables",
          message: "Extracting available prompts",
          query: promptsQuery,
        });
        const promptsResult = await coord.query(promptsQuery);
        const promptRows = arrowTableToArray(promptsResult);
        const prompts = promptRows.map((row) => ({
          prompt_id: Number(row.prompt_id),
          prompt_text: String(row.prompt_text || ''),
        }));
        setAvailablePrompts(prompts);
        
        // Set first prompt as default if available
        if (prompts.length > 0) {
          setSelectedPromptId(prompts[0].prompt_id);
        }

        // Create tokens view for performance (reduces repeated joins)
        const tokensViewQuery = `CREATE VIEW IF NOT EXISTS tokens AS SELECT prompt_id, position, token_id, token_text, is_input, log_prob FROM activation_snapshot WHERE type = 'token'`;
        setState({
          status: "updating-tables",
          message: "Creating tokens view",
          query: tokensViewQuery,
        });
        await coord.exec(tokensViewQuery);

        // Fetch prompt tokens for selected prompt (or first prompt if none selected)
        const currentPromptId = prompts.length > 0 ? prompts[0].prompt_id : null;
        if (currentPromptId !== null) {
          const tokensResult = await coord.query(`
            SELECT * FROM activation_snapshot 
            WHERE type = 'token' AND prompt_id = ${currentPromptId}
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
        } else {
          setPromptTokens([]);
        }

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

  // Update prompt tokens when selected prompt changes
  useEffect(() => {
    if (!coordinator || selectedPromptId === null) return;
    
    const updateTokens = async () => {
      try {
        const tokensResult = await coordinator.query(`
          SELECT * FROM activation_snapshot 
          WHERE type = 'token' AND prompt_id = ${selectedPromptId}
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
      } catch (err) {
        console.error("Failed to update prompt tokens:", err);
      }
    };
    
    updateTokens();
  }, [coordinator, selectedPromptId]);

  // Query helpers for heatmap visualization
  const queryTokenLayerHeatmap = useCallback(
    async (
      promptId: number,
      metric: string,
      aggregation: 'mean' | 'max' | 'min' | 'topk_mean',
      tokenRange?: [number, number] | null,
      layerRange?: [number, number] | null
    ): Promise<Array<{ position: number; layer: number; value: number }>> => {
      if (!coordinator) return [];
      try {
        // Determine which table to query based on metric
        let tableName = '';
        const metricColumn = metric;
        
        if (metric === 'hidden_norm' || metric === 'cosine_similarity_prev_layer') {
          tableName = 'hidden_metrics';
        } else if (['entropy', 'top1_mass', 'topk_mass', 'diagonal_mass', 'band_mass'].includes(metric)) {
          tableName = 'attn_head_metrics';
        } else if (['gate_sparsity_proxy', 'topk_energy_fraction', 'gate_l2_norm', 'up_l2_norm', 'down_l2_norm'].includes(metric)) {
          tableName = 'mlp_metrics';
        } else if (['contrib_l2', 'contrib_to_argmax_logit', 'contrib_to_argmax_logit_normed'].includes(metric)) {
          tableName = 'head_contrib_metrics';
        } else {
          console.warn(`Unknown metric: ${metric}`);
          return [];
        }

        let whereClause = `WHERE prompt_id = ${promptId}`;
        if (tokenRange) {
          whereClause += ` AND position >= ${tokenRange[0]} AND position <= ${tokenRange[1]}`;
        }
        if (layerRange) {
          whereClause += ` AND layer >= ${layerRange[0]} AND layer <= ${layerRange[1]}`;
        }

        let query = '';
        if (tableName === 'mlp_metrics' || tableName === 'hidden_metrics') {
          // No head dimension, direct query
          query = `
            SELECT position, layer, ${metricColumn} as value
            FROM ${tableName}
            ${whereClause}
            ORDER BY layer, position
          `;
        } else {
          // Has head dimension, need aggregation
          if (aggregation === 'topk_mean') {
            // Top-k mean requires join with head_contrib_metrics
            query = `
              WITH ranked AS (
                SELECT 
                  a.position,
                  a.layer,
                  a.head,
                  a.${metricColumn},
                  ROW_NUMBER() OVER (PARTITION BY a.position, a.layer ORDER BY h.contrib_l2 DESC) as rank
                FROM ${tableName} a
                JOIN head_contrib_metrics h ON 
                  a.prompt_id = h.prompt_id AND 
                  a.layer = h.layer AND 
                  a.position = h.position AND 
                  a.head = h.head
                ${whereClause.replace('prompt_id', 'a.prompt_id')}
              )
              SELECT 
                position,
                layer,
                AVG(${metricColumn}) as value
              FROM ranked
              WHERE rank <= 5
              GROUP BY position, layer
              ORDER BY layer, position
            `;
          } else {
            // Simple aggregation (mean, max, min)
            const aggFunc = aggregation.toUpperCase();
            query = `
              SELECT 
                position,
                layer,
                ${aggFunc}(${metricColumn}) as value
              FROM ${tableName}
              ${whereClause}
              GROUP BY position, layer
              ORDER BY layer, position
            `;
          }
        }

        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result);
        return rows.map((row) => ({
          position: Number(row.position),
          layer: Number(row.layer),
          value: Number(row.value),
        }));
      } catch (err) {
        console.error("queryTokenLayerHeatmap error:", err);
        return [];
      }
    },
    [coordinator]
  );

  const queryTokenHeadHeatmap = useCallback(
    async (
      promptId: number,
      layer: number,
      metric: string
    ): Promise<Array<{ position: number; head: number; value: number }>> => {
      if (!coordinator) return [];
      try {
        // Determine which table to query based on metric
        let tableName = '';
        
        if (['entropy', 'top1_mass', 'topk_mass', 'diagonal_mass', 'band_mass'].includes(metric)) {
          tableName = 'attn_head_metrics';
        } else if (['contrib_l2', 'contrib_to_argmax_logit', 'contrib_to_argmax_logit_normed'].includes(metric)) {
          tableName = 'head_contrib_metrics';
        } else {
          console.warn(`Unknown metric for Token×Head: ${metric}`);
          return [];
        }

        const query = `
          SELECT position, head, ${metric} as value
          FROM ${tableName}
          WHERE prompt_id = ${promptId} AND layer = ${layer}
          ORDER BY head, position
        `;

        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result);
        return rows.map((row) => ({
          position: Number(row.position),
          head: Number(row.head),
          value: Number(row.value),
        }));
      } catch (err) {
        console.error("queryTokenHeadHeatmap error:", err);
        return [];
      }
    },
    [coordinator]
  );

  const queryLayerSummary = useCallback(
    async (
      promptId: number,
      metric: string,
      aggregation: 'mean' | 'max' | 'min'
    ): Promise<Array<{ layer: number; mean: number; max: number; min: number }>> => {
      if (!coordinator) return [];
      try {
        // Determine which table to query based on metric
        let tableName = '';
        const metricColumn = metric;
        
        if (metric === 'hidden_norm' || metric === 'cosine_similarity_prev_layer') {
          tableName = 'hidden_metrics';
        } else if (['entropy', 'top1_mass', 'topk_mass', 'diagonal_mass', 'band_mass'].includes(metric)) {
          tableName = 'attn_head_metrics';
        } else if (['gate_sparsity_proxy', 'topk_energy_fraction', 'gate_l2_norm', 'up_l2_norm', 'down_l2_norm'].includes(metric)) {
          tableName = 'mlp_metrics';
        } else if (['contrib_l2', 'contrib_to_argmax_logit', 'contrib_to_argmax_logit_normed'].includes(metric)) {
          tableName = 'head_contrib_metrics';
        } else {
          console.warn(`Unknown metric: ${metric}`);
          return [];
        }

        let query = '';
        if (tableName === 'mlp_metrics' || tableName === 'hidden_metrics') {
          // No head dimension
          query = `
            SELECT 
              layer,
              AVG(${metricColumn}) as mean,
              MAX(${metricColumn}) as max,
              MIN(${metricColumn}) as min
            FROM ${tableName}
            WHERE prompt_id = ${promptId}
            GROUP BY layer
            ORDER BY layer
          `;
        } else {
          // Has head dimension, aggregate first
          const aggFunc = aggregation.toUpperCase();
          query = `
            SELECT 
              layer,
              AVG(${metricColumn}) as mean,
              MAX(${metricColumn}) as max,
              MIN(${metricColumn}) as min
            FROM (
              SELECT 
                layer,
                position,
                ${aggFunc}(${metricColumn}) as ${metricColumn}
              FROM ${tableName}
              WHERE prompt_id = ${promptId}
              GROUP BY layer, position
            )
            GROUP BY layer
            ORDER BY layer
          `;
        }

        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result);
        return rows.map((row) => ({
          layer: Number(row.layer),
          mean: Number(row.mean),
          max: Number(row.max),
          min: Number(row.min),
        }));
      } catch (err) {
        console.error("queryLayerSummary error:", err);
        return [];
      }
    },
    [coordinator]
  );

  const queryTopKHeads = useCallback(
    async (
      promptId: number,
      layer: number,
      metric: 'contrib_l2' | 'contrib_to_argmax_logit_normed',
      k: number
    ): Promise<Array<{ head: number; position: number; value: number }>> => {
      if (!coordinator) return [];
      try {
        const query = `
          WITH ranked AS (
            SELECT 
              head,
              position,
              ${metric} as value,
              ROW_NUMBER() OVER (PARTITION BY position ORDER BY ${metric} DESC) as rank
            FROM head_contrib_metrics
            WHERE prompt_id = ${promptId} AND layer = ${layer}
          )
          SELECT 
            head,
            position,
            value
          FROM ranked
          WHERE rank <= ${k}
          ORDER BY position, head
        `;

        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result);
        return rows.map((row) => ({
          head: Number(row.head),
          position: Number(row.position),
          value: Number(row.value),
        }));
      } catch (err) {
        console.error("queryTopKHeads error:", err);
        return [];
      }
    },
    [coordinator]
  );

  // Query helpers for activation inspection
  const queryHiddenState = useCallback(
    async (layer: number, position: number): Promise<{ norm: number; mean: number; std: number; top_dims: number[]; top_vals: number[] } | null> => {
      if (!coordinator || selectedPromptId === null) return null;
      try {
        const result = await coordinator.query(`
          SELECT norm, mean, std, top_dims, top_vals
          FROM hidden_states
          WHERE prompt_id = ${selectedPromptId} AND layer = ${layer} AND position = ${position}
          LIMIT 1
        `);
        const rows = arrowTableToArray(result);
        if (rows.length === 0) return null;
        const row = rows[0];
        // Parse top_dims and top_vals from arrays
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
          norm: Number(row.norm || 0),
          mean: Number(row.mean || 0),
          std: Number(row.std || 0),
          top_dims,
          top_vals,
        };
      } catch (err) {
        console.error("queryHiddenState error:", err);
        return null;
      }
    },
    [coordinator, selectedPromptId]
  );

  const queryMLPActivation = useCallback(
    async (layer: number, position: number, stage: string): Promise<{ norm: number; sparsity: number; top_dims: number[]; top_vals: number[] } | null> => {
      if (!coordinator || selectedPromptId === null) return null;
      try {
        const result = await coordinator.query(`
          SELECT values
          FROM mlp_activations
          WHERE prompt_id = ${selectedPromptId} AND layer = ${layer} AND position = ${position} AND stage = '${stage}'
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
    [coordinator, selectedPromptId]
  );

  return (
    <TransformerContext.Provider
      value={{
        state,
        coordinator,
        numLayers,
        numHeads,
        numKVHeads,
        promptTokens,
        availablePrompts,
        selectedPromptId,
        setSelectedPromptId,
        selectedMode,
        setSelectedMode,
        advancedMode,
        setAdvancedMode,
        selectedMetric,
        setSelectedMetric,
        aggregationMethod,
        setAggregationMethod,
        selectedTokenRange,
        setSelectedTokenRange,
        selectedTokenSet,
        setSelectedTokenSet,
        addTokenToSet: handleAddTokenToSet,
        addRangeToSet: handleAddRangeToSet,
        selectedLayerRange,
        setSelectedLayerRange,
        queryHiddenState,
        queryMLPActivation,
        queryTokenLayerHeatmap,
        queryTokenHeadHeatmap,
        queryLayerSummary,
        queryTopKHeads,
      }}
    >
      {children}
    </TransformerContext.Provider>
  );
}

export const useTransformer = () => useContext(TransformerContext);
