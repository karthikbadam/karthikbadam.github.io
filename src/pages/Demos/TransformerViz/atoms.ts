import * as vg from "@uwdata/vgplot";
import { atom } from "jotai";
import { LoadingState } from "../../../types/loading";
import { getMetricCategory, isHeadMetric } from "./config/metrics";

type Coordinator = vg.Coordinator;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VgSelection = any;

export interface BrushSelection {
  tokens: [number, number] | null;
  layers: [number, number] | null;
  heads: [number, number] | null;
}

export interface SelectionStats {
  count: number;
  mean: number;
  max: number;
  min: number;
  std: number;
}

export interface TopValue {
  layer: number;
  position: number;
  head: number | null;
  tokenText: string;
  value: number;
}

export interface PromptToken {
  position: number;
  token_id: number;
  token_text: string;
  is_input: boolean;
  log_prob: number | null;
}

export interface AvailablePrompt {
  prompt_id: number;
  prompt_text: string;
}

const emptyBrushSelection: BrushSelection = {
  tokens: null,
  layers: null,
  heads: null,
};
const emptyStats: SelectionStats = {
  count: 0,
  mean: 0,
  max: 0,
  min: 0,
  std: 0,
};

const PARQUET_FILES = {
  activationSnapshot: "activation_snapshot.parquet",
  hiddenStates: "hidden_states.parquet",
  attentionPatterns: "attention_patterns.parquet",
  attentionScores: "attention_scores.parquet",
  attnHeadMetrics: "attn_head_metrics.parquet",
  mlpMetrics: "mlp_metrics.parquet",
  hiddenMetrics: "hidden_metrics.parquet",
  headContribMetrics: "head_contrib_metrics.parquet",
  mlpTopk: "mlp_topk.parquet",
  hiddenTopk: "hidden_topk.parquet",
};

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

// Infrastructure
export const loadingStateAtom = atom<LoadingState>({ status: "idle" });
export const coordinatorAtom = atom<Coordinator | null>(null);

// Model config
export const numLayersAtom = atom(36);
export const numHeadsAtom = atom(16);
export const numKVHeadsAtom = atom(4);

// Prompt selection
export const availablePromptsAtom = atom<AvailablePrompt[]>([]);
export const selectedPromptIdAtom = atom<number | null>(null);
export const promptTokensAtom = atom<PromptToken[]>([]);

// Metric (primary control)
export const selectedMetricAtom = atom<string>("entropy");

// Token / Layer selection (click-based, deprecated)
export const selectedTokenAtom = atom<number | null>(null);
export const selectedLayerAtom = atom<number | null>(null);

// Highlighted token / layer (DetailsPanel)
export const highlightedTokenAtom = atom<number | null>(null);
export const highlightedLayerAtom = atom<number | null>(null);

// Brush state
export const brushSelectionStateAtom = atom<BrushSelection>(emptyBrushSelection);

// vgplot Selection refs (set during init)
export const brushSelectionAtom = atom<VgSelection | null>(null);
export const tokenHighlightAtom = atom<VgSelection | null>(null);
export const layerHighlightAtom = atom<VgSelection | null>(null);

// Async-fetched secondary state
export const tokenMetricsAtom = atom<Map<number, number[]> | null>(null);
export const layerMetricsAtom = atom<Map<number, number[]> | null>(null);
export const selectionStatsAtom = atom<SelectionStats | null>(null);
export const topValuesAtom = atom<TopValue[]>([]);

// Derived
export const isReadyAtom = atom(
  (get) => get(loadingStateAtom).status === "ready",
);

export const hasBrushSelectionAtom = atom((get) => {
  const b = get(brushSelectionStateAtom);
  return !!(b.tokens || b.layers || b.heads);
});

// Action atoms
export const clearBrushSelectionAtom = atom(null, (get, set) => {
  set(brushSelectionStateAtom, emptyBrushSelection);
  set(selectionStatsAtom, null);
  set(topValuesAtom, []);
  const sel = get(brushSelectionAtom);
  sel?.update?.({ source: null, clauses: [] });
});

export const initializeTransformerAtom = atom(null, async (get, set) => {
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

    set(brushSelectionAtom, vg.Selection.crossfilter());
    set(tokenHighlightAtom, vg.Selection.single());
    set(layerHighlightAtom, vg.Selection.single());

    const baseUrl = window.location.origin;
    const hashBase = window.location.pathname.replace(/\/$/, "");
    const dataPath = `${baseUrl}${hashBase}/data/llm`;

    set(loadingStateAtom, {
      status: "loading-parquet",
      message: "Transformer activation data",
    });

    await coord.exec(`INSTALL httpfs; LOAD httpfs;`);
    await coord.exec(`SET threads = 1;`);
    await coord.exec(`SET memory_limit = '4GB';`);

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
      set(loadingStateAtom, { status: "creating-tables", table: name });
      await coord.exec(query);
    }

    try {
      const attentionScoresQuery = `CREATE TABLE IF NOT EXISTS attention_scores AS SELECT * FROM '${dataPath}/${PARQUET_FILES.attentionScores}'`;
      set(loadingStateAtom, {
        status: "creating-tables",
        table: "attention_scores",
      });
      await coord.exec(attentionScoresQuery);
    } catch {
      console.warn("attention_scores.parquet not found (optional)");
      await coord.exec(
        `CREATE TABLE IF NOT EXISTS attention_scores AS SELECT CAST(NULL AS INTEGER) as prompt_id WHERE FALSE`,
      );
    }

    try {
      const numLayersQuery = `SELECT MAX(layer) as num_layers FROM (SELECT layer FROM hidden_metrics UNION SELECT layer FROM attn_head_metrics) WHERE layer IS NOT NULL`;
      set(loadingStateAtom, {
        status: "updating-tables",
        message: "Deriving model configuration",
        query: numLayersQuery,
      });
      const configResult = await coord.query(numLayersQuery);
      const configRows = arrowTableToArray(configResult);
      if (configRows.length > 0 && configRows[0].num_layers !== null) {
        const nl = Number(configRows[0].num_layers);
        if (nl > 0) set(numLayersAtom, nl);
      }
    } catch (err) {
      console.warn(
        "Could not derive numLayers from data, using default (36):",
        err,
      );
    }

    const promptsQuery = `SELECT DISTINCT prompt_id, prompt_text FROM activation_snapshot WHERE prompt_id IS NOT NULL AND prompt_text IS NOT NULL ORDER BY prompt_id`;
    set(loadingStateAtom, {
      status: "updating-tables",
      message: "Extracting available prompts",
      query: promptsQuery,
    });
    const promptsResult = await coord.query(promptsQuery);
    const promptRows = arrowTableToArray(promptsResult);
    const prompts: AvailablePrompt[] = promptRows.map((row) => ({
      prompt_id: Number(row.prompt_id),
      prompt_text: String(row.prompt_text || ""),
    }));
    set(availablePromptsAtom, prompts);

    if (prompts.length > 0) {
      set(selectedPromptIdAtom, prompts[0].prompt_id);
    }

    const tokensViewQuery = `CREATE VIEW IF NOT EXISTS tokens AS SELECT prompt_id, position, token_id, token_text, is_input, log_prob FROM activation_snapshot WHERE type = 'token'`;
    set(loadingStateAtom, {
      status: "updating-tables",
      message: "Creating tokens view",
      query: tokensViewQuery,
    });
    await coord.exec(tokensViewQuery);

    const currentPromptId = prompts.length > 0 ? prompts[0].prompt_id : null;
    if (currentPromptId !== null) {
      const tokensResult = await coord.query(`
        SELECT * FROM activation_snapshot
        WHERE type = 'token' AND prompt_id = ${currentPromptId}
        ORDER BY position
      `);
      const tokenRows = arrowTableToArray(tokensResult);
      const tokens: PromptToken[] = tokenRows.map((row) => ({
        position: Number(row.position),
        token_id: Number(row.token_id),
        token_text: String(row.token_text || ""),
        is_input: Boolean(row.is_input),
        log_prob: row.log_prob !== null ? Number(row.log_prob) : null,
      }));
      set(promptTokensAtom, tokens);
    }

    set(loadingStateAtom, { status: "ready" });
  } catch (err) {
    console.error("Failed to initialize Transformer context:", err);
    set(loadingStateAtom, {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "Unknown error loading transformer data",
    });
  }
});

initializeTransformerAtom.onMount = (trigger) => {
  trigger();
};

// ----- Bridge atom: refresh promptTokens when selectedPromptId changes -----
export const refreshPromptTokensAtom = atom(null, async (get, set) => {
  const coord = get(coordinatorAtom);
  const promptId = get(selectedPromptIdAtom);
  if (!coord || promptId === null) return;
  try {
    const tokensResult = await coord.query(`
      SELECT * FROM activation_snapshot
      WHERE type = 'token' AND prompt_id = ${promptId}
      ORDER BY position
    `);
    const tokenRows = arrowTableToArray(tokensResult);
    const tokens: PromptToken[] = tokenRows.map((row) => ({
      position: Number(row.position),
      token_id: Number(row.token_id),
      token_text: String(row.token_text || ""),
      is_input: Boolean(row.is_input),
      log_prob: row.log_prob !== null ? Number(row.log_prob) : null,
    }));
    set(promptTokensAtom, tokens);
  } catch (err) {
    console.error("Failed to update prompt tokens:", err);
  }
});

// ----- Bridge atom: refresh selection stats when brush + metric + prompt changes -----
export const refreshSelectionStatsAtom = atom(null, async (get, set) => {
  const coord = get(coordinatorAtom);
  const promptId = get(selectedPromptIdAtom);
  const metric = get(selectedMetricAtom);
  const brush = get(brushSelectionStateAtom);

  if (!coord || promptId === null) {
    set(selectionStatsAtom, null);
    set(topValuesAtom, []);
    return;
  }

  const hasSelection = brush.tokens || brush.layers || brush.heads;
  if (!hasSelection) {
    set(selectionStatsAtom, null);
    set(topValuesAtom, []);
    return;
  }

  const category = getMetricCategory(metric);
  if (!category) {
    set(selectionStatsAtom, null);
    set(topValuesAtom, []);
    return;
  }

  try {
    let whereClause = `WHERE prompt_id = ${promptId}`;
    if (brush.tokens) {
      whereClause += ` AND position >= ${brush.tokens[0]} AND position <= ${brush.tokens[1]}`;
    }
    if (brush.layers) {
      whereClause += ` AND layer >= ${brush.layers[0]} AND layer <= ${brush.layers[1]}`;
    }
    if (brush.heads && isHeadMetric(metric)) {
      whereClause += ` AND head >= ${brush.heads[0]} AND head <= ${brush.heads[1]}`;
    }

    let tableName = "";
    let metricColumn = metric;
    if (category === "attention") tableName = "attn_head_metrics";
    else if (category === "contribution") tableName = "head_contrib_metrics";
    else if (category === "hidden") tableName = "hidden_metrics";
    else if (category === "mlp") tableName = "mlp_metrics";
    else if (category === "mlpNeurons") {
      tableName = "mlp_topk";
      metricColumn = "value";
    } else if (category === "hiddenTrajectory") {
      tableName = "hidden_topk";
      metricColumn = "value";
    } else if (category === "layernorm") {
      tableName = "activation_snapshot";
      metricColumn = metric === "norm_mean" ? "mean" : "variance";
      whereClause += ` AND type = 'norm'`;
    }
    if (!tableName) {
      set(selectionStatsAtom, null);
      set(topValuesAtom, []);
      return;
    }

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
    const statsResult = await coord.query(statsQuery);
    const statsRows = arrowTableToArray(statsResult);
    const stats: SelectionStats =
      statsRows.length > 0
        ? {
            count: Number(statsRows[0].count) || 0,
            mean: Number(statsRows[0].mean) || 0,
            max: Number(statsRows[0].max) || 0,
            min: Number(statsRows[0].min) || 0,
            std: Number(statsRows[0].std) || 0,
          }
        : emptyStats;

    const headColumn = isHeadMetric(metric) ? "head" : "NULL as head";
    const topQuery = `
      SELECT
        m.layer,
        m.position,
        ${headColumn},
        t.token_text,
        m.${metricColumn} as value
      FROM ${tableName} m
      JOIN tokens t ON m.prompt_id = t.prompt_id AND m.position = t.position
      ${whereClause.replace("prompt_id", "m.prompt_id")}
      ORDER BY m.${metricColumn} DESC
      LIMIT 10
    `;
    const topResult = await coord.query(topQuery);
    const topRows = arrowTableToArray(topResult);
    const topValues: TopValue[] = topRows.map((row) => ({
      layer: Number(row.layer),
      position: Number(row.position),
      head: row.head !== null ? Number(row.head) : null,
      tokenText: String(row.token_text || ""),
      value: Number(row.value),
    }));

    set(selectionStatsAtom, stats);
    set(topValuesAtom, topValues);
  } catch (err) {
    console.error("refreshSelectionStats error:", err);
  }
});

// Helper to map metric -> (table, column, extraWhere) for layer/token aggregations.
function metricMapping(
  metric: string,
): { tableName: string; metricColumn: string; extraWhere: string } | null {
  const category = getMetricCategory(metric);
  let tableName = "";
  let metricColumn = metric;
  let extraWhere = "";
  if (category === "attention") tableName = "attn_head_metrics";
  else if (category === "contribution") tableName = "head_contrib_metrics";
  else if (category === "hidden") tableName = "hidden_metrics";
  else if (category === "mlp") tableName = "mlp_metrics";
  else if (category === "mlpNeurons") {
    tableName = "mlp_topk";
    metricColumn = "value";
  } else if (category === "hiddenTrajectory") {
    tableName = "hidden_topk";
    metricColumn = "value";
  } else if (category === "layernorm") {
    tableName = "activation_snapshot";
    metricColumn = metric === "norm_mean" ? "mean" : "variance";
    extraWhere = ` AND type = 'norm'`;
  } else {
    return null;
  }
  return { tableName, metricColumn, extraWhere };
}

// ----- Bridge atom: refresh layerMetrics when (coordinator, promptId, metric) changes -----
export const refreshLayerMetricsAtom = atom(null, async (get, set) => {
  const coord = get(coordinatorAtom);
  const promptId = get(selectedPromptIdAtom);
  const metric = get(selectedMetricAtom);
  if (!coord || promptId === null) {
    set(layerMetricsAtom, null);
    return;
  }
  const m = metricMapping(metric);
  if (!m) {
    set(layerMetricsAtom, null);
    return;
  }
  try {
    const query = `
      SELECT layer, position, AVG(${m.metricColumn}) as value
      FROM ${m.tableName}
      WHERE prompt_id = ${promptId}${m.extraWhere}
      GROUP BY layer, position
      ORDER BY layer, position
    `;
    const result = await coord.query(query);
    const rows = arrowTableToArray(result);
    const layerMap = new Map<number, number[]>();
    for (const row of rows) {
      const layer = Number(row.layer);
      if (!layerMap.has(layer)) layerMap.set(layer, []);
      layerMap.get(layer)!.push(Number(row.value));
    }
    set(layerMetricsAtom, layerMap);
  } catch (err) {
    console.error("Failed to query layer metrics:", err);
    set(layerMetricsAtom, null);
  }
});

// ----- Bridge atom: refresh tokenMetrics when (coordinator, promptId, metric) changes -----
export const refreshTokenMetricsAtom = atom(null, async (get, set) => {
  const coord = get(coordinatorAtom);
  const promptId = get(selectedPromptIdAtom);
  const metric = get(selectedMetricAtom);
  if (!coord || promptId === null) {
    set(tokenMetricsAtom, null);
    return;
  }
  const m = metricMapping(metric);
  if (!m) {
    set(tokenMetricsAtom, null);
    return;
  }
  try {
    const query = `
      SELECT position, layer, AVG(${m.metricColumn}) as value
      FROM ${m.tableName}
      WHERE prompt_id = ${promptId}${m.extraWhere}
      GROUP BY position, layer
      ORDER BY position, layer
    `;
    const result = await coord.query(query);
    const rows = arrowTableToArray(result);
    const tokenMap = new Map<number, number[]>();
    for (const row of rows) {
      const position = Number(row.position);
      if (!tokenMap.has(position)) tokenMap.set(position, []);
      tokenMap.get(position)!.push(Number(row.value));
    }
    set(tokenMetricsAtom, tokenMap);
  } catch (err) {
    console.error("Failed to query token metrics:", err);
    set(tokenMetricsAtom, null);
  }
});

// ----- Imperative query helpers (used by ad-hoc detail panels) -----
// These remain functions because they're parameterized by panel-local args.
// Exposed via useTransformerQueries() hook (see hooks/useTransformerQueries.ts).

export interface FacetedHeatmapRow {
  position: number;
  layer: number;
  head: number;
  value: number;
  token_label: string;
}

export async function queryFacetedHeatmapData(
  coord: Coordinator,
  promptId: number,
  metric: string,
): Promise<FacetedHeatmapRow[]> {
  const category = getMetricCategory(metric);
  if (!category) {
    console.warn(`Unknown metric: ${metric}`);
    return [];
  }
  try {
    let query = "";
    if (category === "attention") {
      query = `
        SELECT
          '(' || LPAD(CAST(a.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
          a.position, a.layer, a.head, a.${metric} as value
        FROM attn_head_metrics a
        JOIN tokens t ON a.prompt_id = t.prompt_id AND a.position = t.position
        WHERE a.prompt_id = ${promptId}
        ORDER BY position, layer, head
      `;
    } else if (category === "contribution") {
      query = `
        SELECT
          '(' || LPAD(CAST(h.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
          h.position, h.layer, h.head, h.${metric} as value
        FROM head_contrib_metrics h
        JOIN tokens t ON h.prompt_id = t.prompt_id AND h.position = t.position
        WHERE h.prompt_id = ${promptId}
        ORDER BY position, layer, head
      `;
    } else if (category === "hidden") {
      query = `
        SELECT
          '(' || LPAD(CAST(hm.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
          hm.position, hm.layer, 0 as head, hm.${metric} as value
        FROM hidden_metrics hm
        JOIN tokens t ON hm.prompt_id = t.prompt_id AND hm.position = t.position
        WHERE hm.prompt_id = ${promptId}
        ORDER BY position, layer
      `;
    } else if (category === "mlp") {
      query = `
        SELECT
          '(' || LPAD(CAST(m.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
          m.position, m.layer, 0 as head, m.stage, m.${metric} as value
        FROM mlp_metrics m
        JOIN tokens t ON m.prompt_id = t.prompt_id AND m.position = t.position
        WHERE m.prompt_id = ${promptId}
        ORDER BY position, layer, stage
      `;
    } else if (category === "layernorm") {
      const normColumn = metric === "norm_mean" ? "mean" : "variance";
      query = `
        SELECT
          '(' || LPAD(CAST(a.position AS VARCHAR), 3, '0') || ') ' || t.token_text as token_label,
          a.position, a.layer, 0 as head, a.${normColumn} as value
        FROM activation_snapshot a
        JOIN tokens t ON a.prompt_id = t.prompt_id AND a.position = t.position
        WHERE a.prompt_id = ${promptId} AND a.type = 'norm'
        ORDER BY position, layer
      `;
    }
    const result = await coord.query(query);
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
}

export async function queryTokenAcrossLayers(
  coord: Coordinator,
  promptId: number,
  position: number,
  metric: string,
): Promise<number[]> {
  const category = getMetricCategory(metric);
  if (!category) return [];
  try {
    let query = "";
    let metricColumn = metric;
    if (category === "attention") {
      query = `SELECT layer, AVG(${metricColumn}) as value FROM attn_head_metrics WHERE prompt_id = ${promptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
    } else if (category === "contribution") {
      query = `SELECT layer, AVG(${metricColumn}) as value FROM head_contrib_metrics WHERE prompt_id = ${promptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
    } else if (category === "hidden") {
      query = `SELECT layer, ${metricColumn} as value FROM hidden_metrics WHERE prompt_id = ${promptId} AND position = ${position} ORDER BY layer`;
    } else if (category === "mlp") {
      query = `SELECT layer, AVG(${metricColumn}) as value FROM mlp_metrics WHERE prompt_id = ${promptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
    } else if (category === "mlpNeurons") {
      query = `SELECT layer, AVG(value) as value FROM mlp_topk WHERE prompt_id = ${promptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
    } else if (category === "hiddenTrajectory") {
      query = `SELECT layer, AVG(value) as value FROM hidden_topk WHERE prompt_id = ${promptId} AND position = ${position} GROUP BY layer ORDER BY layer`;
    } else if (category === "layernorm") {
      metricColumn = metric === "norm_mean" ? "mean" : "variance";
      query = `SELECT layer, AVG(${metricColumn}) as value FROM activation_snapshot WHERE prompt_id = ${promptId} AND position = ${position} AND type = 'norm' GROUP BY layer ORDER BY layer`;
    }
    if (!query) return [];
    const result = await coord.query(query);
    const rows = arrowTableToArray(result);
    return rows.map((row) => Number(row.value) || 0);
  } catch (err) {
    console.error("queryTokenAcrossLayers error:", err);
    return [];
  }
}

export async function queryLayerAcrossTokens(
  coord: Coordinator,
  promptId: number,
  layer: number,
  metric: string,
): Promise<{
  stats: SelectionStats;
  headBreakdown: number[];
  topTokens: Array<{ tokenText: string; value: number }>;
}> {
  const category = getMetricCategory(metric);
  if (!category)
    return { stats: emptyStats, headBreakdown: [], topTokens: [] };
  try {
    const m = metricMapping(metric);
    if (!m) return { stats: emptyStats, headBreakdown: [], topTokens: [] };
    const { tableName, metricColumn, extraWhere } = m;

    const statsQuery = `
      SELECT COUNT(*) as count, AVG(${metricColumn}) as mean, MAX(${metricColumn}) as max,
        MIN(${metricColumn}) as min, STDDEV(${metricColumn}) as std
      FROM ${tableName}
      WHERE prompt_id = ${promptId} AND layer = ${layer}${extraWhere}
    `;
    const statsResult = await coord.query(statsQuery);
    const statsRows = arrowTableToArray(statsResult);
    const stats: SelectionStats =
      statsRows.length > 0
        ? {
            count: Number(statsRows[0].count) || 0,
            mean: Number(statsRows[0].mean) || 0,
            max: Number(statsRows[0].max) || 0,
            min: Number(statsRows[0].min) || 0,
            std: Number(statsRows[0].std) || 0,
          }
        : emptyStats;

    let headBreakdown: number[] = [];
    if (isHeadMetric(metric)) {
      const headQuery = `
        SELECT head, AVG(${metricColumn}) as value
        FROM ${tableName}
        WHERE prompt_id = ${promptId} AND layer = ${layer}
        GROUP BY head ORDER BY head
      `;
      const headResult = await coord.query(headQuery);
      const headRows = arrowTableToArray(headResult);
      headBreakdown = headRows.map((row) => Number(row.value) || 0);
    }

    const topTokensQuery = `
      SELECT t.token_text, AVG(m.${metricColumn}) as value
      FROM ${tableName} m
      JOIN tokens t ON m.prompt_id = t.prompt_id AND m.position = t.position
      WHERE m.prompt_id = ${promptId} AND m.layer = ${layer}${extraWhere}
      GROUP BY t.token_text
      ORDER BY value DESC
      LIMIT 50
    `;
    const topResult = await coord.query(topTokensQuery);
    const topRows = arrowTableToArray(topResult);
    const topTokens = topRows.map((row) => ({
      tokenText: String(row.token_text || ""),
      value: Number(row.value) || 0,
    }));

    return { stats, headBreakdown, topTokens };
  } catch (err) {
    console.error("queryLayerAcrossTokens error:", err);
    return { stats: emptyStats, headBreakdown: [], topTokens: [] };
  }
}
