import * as vg from "@uwdata/vgplot";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { LoadingState } from "../types/loading";
import { getMetricCategory, isHeadMetric } from "../pages/Demos/TransformerViz/config/metrics";

/**
 * Context for Transformer activation visualization via DuckDB WASM + Mosaic vgplot
 *
 * Reorganized around a single faceted heatmap with metric selection as the primary control.
 * No modes - metric selection determines faceting strategy.
 */

type Coordinator = vg.Coordinator;

// Brush selection state
export interface BrushSelection {
  tokens: [number, number] | null;
  layers: [number, number] | null;
  heads: [number, number] | null;
}

// Selection statistics
export interface SelectionStats {
  count: number;
  mean: number;
  max: number;
  min: number;
  std: number;
}

// Top value entry
export interface TopValue {
  layer: number;
  position: number;
  head: number | null;
  tokenText: string;
  value: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VgSelection = any; // vg.Selection type

interface TransformerContextValue {
  state: LoadingState;
  coordinator: Coordinator | null;

  // Model config
  numLayers: number;
  numHeads: number;
  numKVHeads: number;

  // Prompt info
  promptTokens: Array<{ position: number; token_id: number; token_text: string; is_input: boolean; log_prob: number | null }>;
  availablePrompts: Array<{ prompt_id: number; prompt_text: string }>;
  selectedPromptId: number | null;
  setSelectedPromptId: (id: number) => void;

  // Metric selection (PRIMARY CONTROL - no modes)
  selectedMetric: string;
  setSelectedMetric: (metric: string) => void;

  // Token/Layer selection (click-based) - deprecated, use highlightedToken/highlightedLayer
  selectedToken: number | null;
  setSelectedToken: (position: number | null) => void;
  selectedLayer: number | null;
  setSelectedLayer: (layer: number | null) => void;

  // Highlighted token/layer (for DetailsPanel display)
  highlightedToken: number | null;
  setHighlightedToken: (pos: number | null) => void;
  highlightedLayer: number | null;
  setHighlightedLayer: (layer: number | null) => void;

  // Token metrics for bar charts (metric values across layers for each token)
  tokenMetrics: Map<number, number[]> | null;
  // Layer metrics for bar charts (metric values across tokens for each layer)
  layerMetrics: Map<number, number[]> | null;

  // Brush selection - vg.Selection for MosaicChart interactivity
  brushSelection: VgSelection | null;

  // Highlight selections for token and layer (for heatmap highlighting)
  $tokenHighlight: VgSelection | null;
  $layerHighlight: VgSelection | null;

  // Manual brush selection state (for UI display)
  brushSelectionState: BrushSelection;
  setBrushSelection: (selection: BrushSelection) => void;
  clearBrushSelection: () => void;

  // Selection summary (computed from brush)
  selectionStats: SelectionStats | null;
  topValues: TopValue[];

  // Query helpers
  queryFacetedHeatmapData: (promptId: number, metric: string) => Promise<Array<{
    position: number;
    layer: number;
    head: number;
    value: number;
    token_label: string;
  }>>;
  querySelectionStats: (promptId: number, metric: string, selection: BrushSelection) => Promise<{ stats: SelectionStats; topValues: TopValue[] }>;
  queryTokenAcrossLayers: (position: number, metric: string) => Promise<number[]>;
  queryLayerAcrossTokens: (layer: number, metric: string) => Promise<{ stats: SelectionStats; headBreakdown: number[]; topTokens: Array<{ tokenText: string; value: number }> }>;
}

const emptyBrushSelection: BrushSelection = { tokens: null, layers: null, heads: null };
const emptyStats: SelectionStats = { count: 0, mean: 0, max: 0, min: 0, std: 0 };

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
  selectedMetric: 'entropy',
  setSelectedMetric: () => {},
  selectedToken: null,
  setSelectedToken: () => {},
  selectedLayer: null,
  setSelectedLayer: () => {},
  highlightedToken: null,
  setHighlightedToken: () => {},
  highlightedLayer: null,
  setHighlightedLayer: () => {},
  tokenMetrics: null,
  layerMetrics: null,
  brushSelection: null,
  $tokenHighlight: null,
  $layerHighlight: null,
  brushSelectionState: emptyBrushSelection,
  setBrushSelection: () => {},
  clearBrushSelection: () => {},
  selectionStats: null,
  topValues: [],
  queryFacetedHeatmapData: async () => [],
  querySelectionStats: async () => ({ stats: emptyStats, topValues: [] }),
  queryTokenAcrossLayers: async () => [],
  queryLayerAcrossTokens: async () => ({ stats: emptyStats, headBreakdown: [], topTokens: [] }),
};

const TransformerContext = createContext<TransformerContextValue>(defaultContext);

// Parquet file names
const PARQUET_FILES = {
  activationSnapshot: "activation_snapshot.parquet",
  hiddenStates: "hidden_states.parquet",
  attentionPatterns: "attention_patterns.parquet",
  attentionScores: "attention_scores.parquet",
  attnHeadMetrics: "attn_head_metrics.parquet",
  mlpMetrics: "mlp_metrics.parquet",
  hiddenMetrics: "hidden_metrics.parquet",
  headContribMetrics: "head_contrib_metrics.parquet",
  mlpTopk: "mlp_topk.parquet",        // NEW: top-50 neurons per token/layer/stage
  hiddenTopk: "hidden_topk.parquet",  // NEW: top-50 dimensions per token/layer
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
  
  // Metric selection (PRIMARY CONTROL)
  const [selectedMetric, setSelectedMetric] = useState<string>('entropy');

  // Token/Layer selection (click-based)
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);

  // vg.Selection for MosaicChart interactivity (like StarCatalog)
  const [brushSelection] = useState<VgSelection>(() => vg.Selection.crossfilter());

  // Highlight selections for token and layer (for heatmap highlighting)
  const [tokenHighlight, setTokenHighlight] = useState<VgSelection | null>(null);
  const [layerHighlight, setLayerHighlight] = useState<VgSelection | null>(null);

  // Highlighted token/layer state (for DetailsPanel display)
  const [highlightedToken, setHighlightedToken] = useState<number | null>(null);
  const [highlightedLayer, setHighlightedLayer] = useState<number | null>(null);

  // Manual brush selection state (for UI display)
  const [brushSelectionState, setBrushSelectionState] = useState<BrushSelection>(emptyBrushSelection);

  // Token metrics for bar charts (metric values across layers for each token)
  const [tokenMetrics, setTokenMetrics] = useState<Map<number, number[]> | null>(null);
  // Layer metrics for bar charts (metric values across tokens for each layer)
  const [layerMetrics, setLayerMetrics] = useState<Map<number, number[]> | null>(null);
  
  // Selection stats (computed)
  const [selectionStats, setSelectionStats] = useState<SelectionStats | null>(null);
  const [topValues, setTopValues] = useState<TopValue[]>([]);
  
  const initRef = useRef(false);

  const clearBrushSelection = useCallback(() => {
    setBrushSelectionState(emptyBrushSelection);
    setSelectionStats(null);
    setTopValues([]);
    // Clear the vg.Selection
    if (brushSelection?.update) {
      brushSelection.update({ source: null, clauses: [] });
    }
  }, [brushSelection]);

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

        // Create highlight selections after coordinator is set up
        const $token = vg.Selection.single();
        setTokenHighlight($token);

        const $layer = vg.Selection.single();
        setLayerHighlight($layer);

        // Build base URL for parquet files
        const baseUrl = window.location.origin;
        const hashBase = window.location.pathname.replace(/\/$/, "");
        const dataPath = `${baseUrl}${hashBase}/data/llm`;

        // Install httpfs for remote parquet access
        setState({
          status: "loading-parquet",
          message: "Transformer activation data",
        });

        await coord.exec(`INSTALL httpfs; LOAD httpfs;`);
        await coord.exec(`SET threads = 1;`);
        await coord.exec(`SET memory_limit = '4GB';`);

        // Load metric tables
        const tables = [
          { name: "attn_head_metrics", file: PARQUET_FILES.attnHeadMetrics },
          { name: "mlp_metrics", file: PARQUET_FILES.mlpMetrics },
          { name: "hidden_metrics", file: PARQUET_FILES.hiddenMetrics },
          { name: "head_contrib_metrics", file: PARQUET_FILES.headContribMetrics },
          { name: "activation_snapshot", file: PARQUET_FILES.activationSnapshot },
          { name: "hidden_states", file: PARQUET_FILES.hiddenStates },
          { name: "attention_patterns", file: PARQUET_FILES.attentionPatterns },
          { name: "mlp_topk", file: PARQUET_FILES.mlpTopk },
          { name: "hidden_topk", file: PARQUET_FILES.hiddenTopk },
        ];

        for (const { name, file } of tables) {
          const query = `CREATE TABLE IF NOT EXISTS ${name} AS SELECT * FROM '${dataPath}/${file}'`;
          setState({ status: "creating-tables", table: name });
          await coord.exec(query);
        }

        // attention_scores is optional
        try {
          const attentionScoresQuery = `CREATE TABLE IF NOT EXISTS attention_scores AS SELECT * FROM '${dataPath}/${PARQUET_FILES.attentionScores}'`;
          setState({ status: "creating-tables", table: "attention_scores" });
          await coord.exec(attentionScoresQuery);
        } catch {
          console.warn("attention_scores.parquet not found (optional)");
          await coord.exec(`CREATE TABLE IF NOT EXISTS attention_scores AS SELECT CAST(NULL AS INTEGER) as prompt_id WHERE FALSE`);
        }

        // Derive numLayers from actual data
        try {
          const numLayersQuery = `SELECT MAX(layer) as num_layers FROM (SELECT layer FROM hidden_metrics UNION SELECT layer FROM attn_head_metrics) WHERE layer IS NOT NULL`;
          setState({ status: "updating-tables", message: "Deriving model configuration", query: numLayersQuery });
          const configResult = await coord.query(numLayersQuery);
          const configRows = arrowTableToArray(configResult);
          if (configRows.length > 0 && configRows[0].num_layers !== null) {
            const nl = Number(configRows[0].num_layers);
            if (nl > 0) setNumLayers(nl);
          }
        } catch (err) {
          console.warn("Could not derive numLayers from data, using default (36):", err);
        }

        // Extract available prompts
        const promptsQuery = `SELECT DISTINCT prompt_id, prompt_text FROM activation_snapshot WHERE prompt_id IS NOT NULL AND prompt_text IS NOT NULL ORDER BY prompt_id`;
        setState({ status: "updating-tables", message: "Extracting available prompts", query: promptsQuery });
        const promptsResult = await coord.query(promptsQuery);
        const promptRows = arrowTableToArray(promptsResult);
        const prompts = promptRows.map((row) => ({
          prompt_id: Number(row.prompt_id),
          prompt_text: String(row.prompt_text || ''),
        }));
        setAvailablePrompts(prompts);
        
        if (prompts.length > 0) {
          setSelectedPromptId(prompts[0].prompt_id);
        }

        // Create tokens view
        const tokensViewQuery = `CREATE VIEW IF NOT EXISTS tokens AS SELECT prompt_id, position, token_id, token_text, is_input, log_prob FROM activation_snapshot WHERE type = 'token'`;
        setState({ status: "updating-tables", message: "Creating tokens view", query: tokensViewQuery });
        await coord.exec(tokensViewQuery);

        // Fetch prompt tokens
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
        }

        setState({ status: "ready" });
      } catch (err) {
        console.error("Failed to initialize Transformer context:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error loading transformer data",
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

  // Query helper for faceted heatmap data
  const queryFacetedHeatmapData = useCallback(
    async (promptId: number, metric: string): Promise<Array<{
      position: number;
      layer: number;
      head: number;
      value: number;
      token_label: string;
    }>> => {
      if (!coordinator) return [];
      
      const category = getMetricCategory(metric);
      if (!category) {
        console.warn(`Unknown metric: ${metric}`);
        return [];
      }

      try {
        let query = '';
        
        if (category === 'attention') {
          query = `
            SELECT 
              '(' || LPAD(CAST(a.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
              a.position,
              a.layer, 
              a.head, 
              a.${metric} as value
            FROM attn_head_metrics a
            JOIN tokens t ON a.prompt_id = t.prompt_id AND a.position = t.position
            WHERE a.prompt_id = ${promptId}
            ORDER BY position, layer, head
          `;
        } else if (category === 'contribution') {
          query = `
            SELECT 
              '(' || LPAD(CAST(h.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
              h.position,
              h.layer, 
              h.head, 
              h.${metric} as value
            FROM head_contrib_metrics h
            JOIN tokens t ON h.prompt_id = t.prompt_id AND h.position = t.position
            WHERE h.prompt_id = ${promptId}
            ORDER BY position, layer, head
          `;
        } else if (category === 'hidden') {
          query = `
            SELECT 
              '(' || LPAD(CAST(hm.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
              hm.position,
              hm.layer, 
              0 as head, 
              hm.${metric} as value
            FROM hidden_metrics hm
            JOIN tokens t ON hm.prompt_id = t.prompt_id AND hm.position = t.position
            WHERE hm.prompt_id = ${promptId}
            ORDER BY position, layer
          `;
        } else if (category === 'mlp') {
          // MLP metrics now have stage column - return all stages
          query = `
            SELECT 
              '(' || LPAD(CAST(m.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
              m.position,
              m.layer, 
              0 as head,
              m.stage,
              m.${metric} as value
            FROM mlp_metrics m
            JOIN tokens t ON m.prompt_id = t.prompt_id AND m.position = t.position
            WHERE m.prompt_id = ${promptId}
            ORDER BY position, layer, stage
          `;
        } else if (category === 'layernorm') {
          const normColumn = metric === 'norm_mean' ? 'mean' : 'variance';
          query = `
            SELECT 
              '(' || LPAD(CAST(a.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
              a.position,
              a.layer, 
              0 as head, 
              a.${normColumn} as value
            FROM activation_snapshot a
            JOIN tokens t ON a.prompt_id = t.prompt_id AND a.position = t.position
            WHERE a.prompt_id = ${promptId} AND a.type = 'norm'
            ORDER BY position, layer
          `;
        }

        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result);
        return rows.map((row) => ({
          position: Number(row.position),
          layer: Number(row.layer),
          head: Number(row.head),
          value: Number(row.value),
          token_label: String(row.token_label),
        }));
      } catch (err) {
        console.error("queryFacetedHeatmapData error:", err);
        return [];
      }
    },
    [coordinator]
  );

  // Query helper for selection statistics
  const querySelectionStats = useCallback(
    async (promptId: number, metric: string, selection: BrushSelection): Promise<{ stats: SelectionStats; topValues: TopValue[] }> => {
      if (!coordinator) return { stats: emptyStats, topValues: [] };

      const category = getMetricCategory(metric);
      if (!category) return { stats: emptyStats, topValues: [] };

      try {
        // Build WHERE clause from selection
        let whereClause = `WHERE prompt_id = ${promptId}`;
        if (selection.tokens) {
          whereClause += ` AND position >= ${selection.tokens[0]} AND position <= ${selection.tokens[1]}`;
        }
        if (selection.layers) {
          whereClause += ` AND layer >= ${selection.layers[0]} AND layer <= ${selection.layers[1]}`;
        }
        if (selection.heads && isHeadMetric(metric)) {
          whereClause += ` AND head >= ${selection.heads[0]} AND head <= ${selection.heads[1]}`;
        }

        // Determine table and column
        let tableName = '';
        let metricColumn = metric;

        if (category === 'attention') {
          tableName = 'attn_head_metrics';
        } else if (category === 'contribution') {
          tableName = 'head_contrib_metrics';
        } else if (category === 'hidden') {
          tableName = 'hidden_metrics';
        } else if (category === 'mlp') {
          tableName = 'mlp_metrics';
        } else if (category === 'mlpNeurons') {
          tableName = 'mlp_topk';
          metricColumn = 'value';
        } else if (category === 'hiddenTrajectory') {
          tableName = 'hidden_topk';
          metricColumn = 'value';
        } else if (category === 'layernorm') {
          tableName = 'activation_snapshot';
          metricColumn = metric === 'norm_mean' ? 'mean' : 'variance';
          whereClause += ` AND type = 'norm'`;
        }

        if (!tableName) return { stats: emptyStats, topValues: [] };

        // Query statistics
        const statsQuery = `
          SELECT
            COUNT(*) as count,
            AVG(${metricColumn}) as mean,
            MAX(${metricColumn}) as max,
            MIN(${metricColumn}) as min,
            STDDEV(${metricColumn}) as std
          FROM ${tableName}
          ${whereClause}
        `;

        const statsResult = await coordinator.query(statsQuery);
        const statsRows = arrowTableToArray(statsResult);
        const stats: SelectionStats = statsRows.length > 0 ? {
          count: Number(statsRows[0].count) || 0,
          mean: Number(statsRows[0].mean) || 0,
          max: Number(statsRows[0].max) || 0,
          min: Number(statsRows[0].min) || 0,
          std: Number(statsRows[0].std) || 0,
        } : emptyStats;

        // Query top values
        const headColumn = isHeadMetric(metric) ? 'head' : 'NULL as head';
        const topQuery = `
          SELECT
            m.layer,
            m.position,
            ${headColumn},
            t.token_text,
            m.${metricColumn} as value
          FROM ${tableName} m
          JOIN tokens t ON m.prompt_id = t.prompt_id AND m.position = t.position
          ${whereClause.replace('prompt_id', 'm.prompt_id')}
          ORDER BY m.${metricColumn} DESC
          LIMIT 10
        `;

        const topResult = await coordinator.query(topQuery);
        const topRows = arrowTableToArray(topResult);
        const topValues: TopValue[] = topRows.map((row) => ({
          layer: Number(row.layer),
          position: Number(row.position),
          head: row.head !== null ? Number(row.head) : null,
          tokenText: String(row.token_text || ''),
          value: Number(row.value),
        }));

        return { stats, topValues };
      } catch (err) {
        console.error("querySelectionStats error:", err);
        return { stats: emptyStats, topValues: [] };
      }
    },
    [coordinator]
  );

  // Query helper for token details (metric values across layers)
  const queryTokenAcrossLayers = useCallback(
    async (position: number, metric: string): Promise<number[]> => {
      if (!coordinator || selectedPromptId === null) return [];

      const category = getMetricCategory(metric);
      if (!category) return [];

      try {
        let query = '';
        let metricColumn = metric;

        if (category === 'attention') {
          query = `SELECT layer, AVG(${metricColumn}) as value FROM attn_head_metrics WHERE prompt_id = ${selectedPromptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
        } else if (category === 'contribution') {
          query = `SELECT layer, AVG(${metricColumn}) as value FROM head_contrib_metrics WHERE prompt_id = ${selectedPromptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
        } else if (category === 'hidden') {
          query = `SELECT layer, ${metricColumn} as value FROM hidden_metrics WHERE prompt_id = ${selectedPromptId} AND position = ${position} ORDER BY layer`;
        } else if (category === 'mlp') {
          query = `SELECT layer, AVG(${metricColumn}) as value FROM mlp_metrics WHERE prompt_id = ${selectedPromptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
        } else if (category === 'mlpNeurons') {
          // For mlp_topk, aggregate activation values per layer
          query = `SELECT layer, AVG(value) as value FROM mlp_topk WHERE prompt_id = ${selectedPromptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
        } else if (category === 'hiddenTrajectory') {
          // For hidden_topk, aggregate dimension values per layer
          query = `SELECT layer, AVG(value) as value FROM hidden_topk WHERE prompt_id = ${selectedPromptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
        } else if (category === 'layernorm') {
          metricColumn = metric === 'norm_mean' ? 'mean' : 'variance';
          query = `SELECT layer, AVG(${metricColumn}) as value FROM activation_snapshot WHERE prompt_id = ${selectedPromptId} AND position = ${position} AND type = 'norm' GROUP BY layer ORDER BY layer`;
        }

        if (!query) return [];

        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result);
        return rows.map((row) => Number(row.value) || 0);
      } catch (err) {
        console.error("queryTokenAcrossLayers error:", err);
        return [];
      }
    },
    [coordinator, selectedPromptId]
  );

  // Query helper for layer details (stats across tokens)
  const queryLayerAcrossTokens = useCallback(
    async (layer: number, metric: string): Promise<{ stats: SelectionStats; headBreakdown: number[]; topTokens: Array<{ tokenText: string; value: number }> }> => {
      if (!coordinator || selectedPromptId === null) {
        return { stats: emptyStats, headBreakdown: [], topTokens: [] };
      }

      const category = getMetricCategory(metric);
      if (!category) return { stats: emptyStats, headBreakdown: [], topTokens: [] };

      try {
        let tableName = '';
        let metricColumn = metric;
        let extraWhere = '';

        if (category === 'attention') {
          tableName = 'attn_head_metrics';
        } else if (category === 'contribution') {
          tableName = 'head_contrib_metrics';
        } else if (category === 'hidden') {
          tableName = 'hidden_metrics';
        } else if (category === 'mlp') {
          tableName = 'mlp_metrics';
        } else if (category === 'mlpNeurons') {
          tableName = 'mlp_topk';
          metricColumn = 'value';
        } else if (category === 'hiddenTrajectory') {
          tableName = 'hidden_topk';
          metricColumn = 'value';
        } else if (category === 'layernorm') {
          tableName = 'activation_snapshot';
          metricColumn = metric === 'norm_mean' ? 'mean' : 'variance';
          extraWhere = ` AND type = 'norm'`;
        }

        if (!tableName) return { stats: emptyStats, headBreakdown: [], topTokens: [] };

        // Query statistics
        const statsQuery = `
          SELECT
            COUNT(*) as count,
            AVG(${metricColumn}) as mean,
            MAX(${metricColumn}) as max,
            MIN(${metricColumn}) as min,
            STDDEV(${metricColumn}) as std
          FROM ${tableName}
          WHERE prompt_id = ${selectedPromptId} AND layer = ${layer}${extraWhere}
        `;
        const statsResult = await coordinator.query(statsQuery);
        const statsRows = arrowTableToArray(statsResult);
        const stats: SelectionStats = statsRows.length > 0 ? {
          count: Number(statsRows[0].count) || 0,
          mean: Number(statsRows[0].mean) || 0,
          max: Number(statsRows[0].max) || 0,
          min: Number(statsRows[0].min) || 0,
          std: Number(statsRows[0].std) || 0,
        } : emptyStats;

        // Head breakdown (for head metrics only)
        let headBreakdown: number[] = [];
        if (isHeadMetric(metric)) {
          const headQuery = `
            SELECT head, AVG(${metricColumn}) as value
            FROM ${tableName}
            WHERE prompt_id = ${selectedPromptId} AND layer = ${layer}
            GROUP BY head ORDER BY head
          `;
          const headResult = await coordinator.query(headQuery);
          const headRows = arrowTableToArray(headResult);
          headBreakdown = headRows.map((row) => Number(row.value) || 0);
        }

        // Top tokens
        const topTokensQuery = `
          SELECT t.token_text, AVG(m.${metricColumn}) as value
          FROM ${tableName} m
          JOIN tokens t ON m.prompt_id = t.prompt_id AND m.position = t.position
          WHERE m.prompt_id = ${selectedPromptId} AND m.layer = ${layer}${extraWhere}
          GROUP BY t.token_text
          ORDER BY value DESC
          LIMIT 50
        `;
        const topResult = await coordinator.query(topTokensQuery);
        const topRows = arrowTableToArray(topResult);
        const topTokens = topRows.map((row) => ({
          tokenText: String(row.token_text || ''),
          value: Number(row.value) || 0,
        }));

        return { stats, headBreakdown, topTokens };
      } catch (err) {
        console.error("queryLayerAcrossTokens error:", err);
        return { stats: emptyStats, headBreakdown: [], topTokens: [] };
      }
    },
    [coordinator, selectedPromptId]
  );

  // Update selection stats when brush changes
  useEffect(() => {
    if (!coordinator || selectedPromptId === null) {
      setSelectionStats(null);
      setTopValues([]);
      return;
    }

    const hasSelection = brushSelectionState.tokens || brushSelectionState.layers || brushSelectionState.heads;
    if (!hasSelection) {
      setSelectionStats(null);
      setTopValues([]);
      return;
    }

    const updateStats = async () => {
      const { stats, topValues } = await querySelectionStats(selectedPromptId, selectedMetric, brushSelectionState);
      setSelectionStats(stats);
      setTopValues(topValues);
    };

    updateStats();
  }, [coordinator, selectedPromptId, selectedMetric, brushSelectionState, querySelectionStats]);

  // Query layer metrics for sparklines (metric values across tokens for each layer)
  useEffect(() => {
    if (!coordinator || selectedPromptId === null) {
      setLayerMetrics(null);
      return;
    }

    const queryLayerMetricsData = async () => {
      try {
        const category = getMetricCategory(selectedMetric);
        let tableName = '';
        let metricColumn = selectedMetric;
        let extraWhere = '';

        if (category === 'attention') {
          tableName = 'attn_head_metrics';
        } else if (category === 'contribution') {
          tableName = 'head_contrib_metrics';
        } else if (category === 'hidden') {
          tableName = 'hidden_metrics';
        } else if (category === 'mlp') {
          tableName = 'mlp_metrics';
        } else if (category === 'mlpNeurons') {
          tableName = 'mlp_topk';
          metricColumn = 'value';
        } else if (category === 'hiddenTrajectory') {
          tableName = 'hidden_topk';
          metricColumn = 'value';
        } else if (category === 'layernorm') {
          tableName = 'activation_snapshot';
          metricColumn = selectedMetric === 'norm_mean' ? 'mean' : 'variance';
          extraWhere = ` AND type = 'norm'`;
        } else {
          setLayerMetrics(null);
          return;
        }

        const query = `
          SELECT layer, position, AVG(${metricColumn}) as value
          FROM ${tableName}
          WHERE prompt_id = ${selectedPromptId}${extraWhere}
          GROUP BY layer, position
          ORDER BY layer, position
        `;

        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result);

        const layerMap = new Map<number, number[]>();
        for (const row of rows) {
          const layer = Number(row.layer);
          if (!layerMap.has(layer)) layerMap.set(layer, []);
          layerMap.get(layer)!.push(Number(row.value));
        }

        setLayerMetrics(layerMap);
      } catch (err) {
        console.error("Failed to query layer metrics:", err);
        setLayerMetrics(null);
      }
    };

    queryLayerMetricsData();
  }, [coordinator, selectedPromptId, selectedMetric]);

  // Query token metrics for bar charts (metric values across layers for each token)
  useEffect(() => {
    if (!coordinator || selectedPromptId === null) {
      setTokenMetrics(null);
      return;
    }

    const queryTokenMetricsData = async () => {
      try {
        const category = getMetricCategory(selectedMetric);
        let tableName = '';
        let metricColumn = selectedMetric;
        let extraWhere = '';

        if (category === 'attention') {
          tableName = 'attn_head_metrics';
        } else if (category === 'contribution') {
          tableName = 'head_contrib_metrics';
        } else if (category === 'hidden') {
          tableName = 'hidden_metrics';
        } else if (category === 'mlp') {
          tableName = 'mlp_metrics';
        } else if (category === 'mlpNeurons') {
          tableName = 'mlp_topk';
          metricColumn = 'value';
        } else if (category === 'hiddenTrajectory') {
          tableName = 'hidden_topk';
          metricColumn = 'value';
        } else if (category === 'layernorm') {
          tableName = 'activation_snapshot';
          metricColumn = selectedMetric === 'norm_mean' ? 'mean' : 'variance';
          extraWhere = ` AND type = 'norm'`;
        } else {
          setTokenMetrics(null);
          return;
        }

        const query = `
          SELECT position, layer, AVG(${metricColumn}) as value
          FROM ${tableName}
          WHERE prompt_id = ${selectedPromptId}${extraWhere}
          GROUP BY position, layer
          ORDER BY position, layer
        `;

        const result = await coordinator.query(query);
        const rows = arrowTableToArray(result);

        const tokenMap = new Map<number, number[]>();
        for (const row of rows) {
          const position = Number(row.position);
          if (!tokenMap.has(position)) tokenMap.set(position, []);
          tokenMap.get(position)!.push(Number(row.value));
        }

        setTokenMetrics(tokenMap);
      } catch (err) {
        console.error("Failed to query token metrics:", err);
        setTokenMetrics(null);
      }
    };

    queryTokenMetricsData();
  }, [coordinator, selectedPromptId, selectedMetric]);

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
        selectedMetric,
        setSelectedMetric,
        selectedToken,
        setSelectedToken,
        selectedLayer,
        setSelectedLayer,
        highlightedToken,
        setHighlightedToken,
        highlightedLayer,
        setHighlightedLayer,
        tokenMetrics,
        layerMetrics,
        brushSelection,
        $tokenHighlight: tokenHighlight,
        $layerHighlight: layerHighlight,
        brushSelectionState,
        setBrushSelection: setBrushSelectionState,
        clearBrushSelection,
        selectionStats,
        topValues,
        queryFacetedHeatmapData,
        querySelectionStats,
        queryTokenAcrossLayers,
        queryLayerAcrossTokens,
      }}
    >
      {children}
    </TransformerContext.Provider>
  );
}

export const useTransformer = () => useContext(TransformerContext);