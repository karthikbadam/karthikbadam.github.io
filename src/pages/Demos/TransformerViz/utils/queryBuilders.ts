import type { Coordinator } from "@uwdata/mosaic-core";
import { getMetricCategory, getMetricInfo, type MetricCatalog } from "../config/metrics";

/**
 * Token label SQL fragment for consistent formatting across all heatmaps
 * Format: "(XX) token_text" where XX is zero-padded position
 */
export const TOKEN_LABEL_SQL = "'(' || lpad(CAST({alias}.position AS VARCHAR), 2, '0') || ') ' || t.token_text";

/**
 * Generates a sanitized view name for temp views
 */
export function generateViewName(category: string, promptId: number, metric: string): string {
  const sanitizedMetric = metric.replace(/[^a-z0-9]/gi, "_");
  return `${category}_heatmap_${promptId}_${sanitizedMetric}`;
}

/**
 * Resolves the actual column name for a metric
 * Handles special cases like normalized columns
 */
export function resolveMetricColumn(metric: string, category?: string): string {
  // For top-K tables (mlp_topk, hidden_topk), column is always "value"
  if (category === 'mlpNeurons' || category === 'hiddenTrajectory') {
    return 'value';
  }

  // For layernorm category, map metric names to actual table column names first
  // (activation_snapshot has "mean" and "variance", not norm_mean_norm etc.)
  if (category === 'layernorm') {
    if (metric === 'norm_mean') return 'mean';
    if (metric === 'norm_variance') return 'variance';
  }

  const metricInfo = getMetricInfo(metric);

  // For hidden_norm, etc., use normalized column (but don't double-append if already ends with _norm)
  if (metricInfo?.useNormalized && !metric.endsWith('_norm')) {
    return `${metric}_norm`;
  }

  return metric;
}

/**
 * Builds a token JOIN clause fragment
 */
export function buildTokenJoin(tableAlias: string): string {
  return `JOIN tokens t ON ${tableAlias}.prompt_id = t.prompt_id AND ${tableAlias}.position = t.position`;
}

/**
 * Configuration for building a heatmap view query
 */
export interface HeatmapViewConfig {
  viewName: string;
  tableName: string;
  tableAlias: string;
  promptId: number;
  metricColumn: string;
  extraColumns?: string[];
  whereClause?: string;
}

/**
 * Builds a generic heatmap view query
 * Centralizes the SQL pattern used across all 7 heatmap components
 */
export function buildHeatmapViewQuery(config: HeatmapViewConfig): string {
  const {
    viewName,
    tableName,
    tableAlias,
    promptId,
    metricColumn,
    extraColumns = [],
    whereClause = ""
  } = config;

  const tokenLabel = TOKEN_LABEL_SQL.replace("{alias}", tableAlias);
  const baseColumns = [
    `${tokenLabel} as token_label`,
    `${tableAlias}.position`,
    `${tableAlias}.layer`,
    ...extraColumns,
    `${tableAlias}.${metricColumn} as value`,
    `t.token_text`
  ];

  const where = whereClause 
    ? `WHERE ${tableAlias}.prompt_id = ${promptId} ${whereClause}`
    : `WHERE ${tableAlias}.prompt_id = ${promptId}`;

  return `
    CREATE OR REPLACE TEMP VIEW ${viewName} AS
    SELECT
      ${baseColumns.join(',\n      ')}
    FROM ${tableName} ${tableAlias}
    ${buildTokenJoin(tableAlias)}
    ${where}
  `;
}

/**
 * Helper to create a heatmap view and return the view name
 * Used by all heatmap components in their setup() callback
 */
export async function createHeatmapView(
  coordinator: Coordinator,
  config: Omit<HeatmapViewConfig, 'viewName'>
): Promise<{ viewName: string } | null> {
  const viewName = generateViewName(
    config.tableName,
    config.promptId,
    config.metricColumn
  );

  try {
    const query = buildHeatmapViewQuery({ ...config, viewName });
    await coordinator.exec(query);
    return { viewName };
  } catch (err) {
    console.error(`Error creating ${config.tableName} heatmap view:`, err);
    return null;
  }
}

/**
 * Resolves the table name and metric column for a given category/metric.
 * Shared by detail-panel query builders.
 */
function resolveTableAndColumn(category: keyof MetricCatalog, metric: string): {
  tableName: string;
  metricColumn: string;
  extraWhere: string;
  needsAvg: boolean;
} {
  switch (category) {
    case 'attention':
      return { tableName: 'attn_head_metrics', metricColumn: metric, extraWhere: '', needsAvg: true };
    case 'contribution':
      return { tableName: 'head_contrib_metrics', metricColumn: metric, extraWhere: '', needsAvg: true };
    case 'hidden':
      return { tableName: 'hidden_metrics', metricColumn: metric, extraWhere: '', needsAvg: false };
    case 'mlp':
      return { tableName: 'mlp_metrics', metricColumn: metric, extraWhere: '', needsAvg: true };
    case 'mlpNeurons':
      return { tableName: 'mlp_topk', metricColumn: 'value', extraWhere: '', needsAvg: true };
    case 'hiddenTrajectory':
      return { tableName: 'hidden_topk', metricColumn: 'value', extraWhere: '', needsAvg: true };
    case 'layernorm':
      return {
        tableName: 'activation_snapshot',
        metricColumn: metric === 'norm_mean' ? 'mean' : 'variance',
        extraWhere: " AND type = 'norm'",
        needsAvg: true,
      };
  }
}

/**
 * Builds a CREATE OR REPLACE TEMP VIEW query that aggregates a metric
 * across layers for a single token position.
 * Result columns: (layer, value)
 */
export function buildTokenDetailViewQuery(
  viewName: string,
  promptId: number,
  position: number,
  metric: string
): string | null {
  const category = getMetricCategory(metric);
  if (!category) return null;

  const { tableName, metricColumn, extraWhere, needsAvg } = resolveTableAndColumn(category, metric);

  const valueExpr = needsAvg ? `AVG(${metricColumn})` : metricColumn;
  const groupBy = needsAvg ? 'GROUP BY layer' : '';

  return `
    CREATE OR REPLACE TEMP VIEW ${viewName} AS
    SELECT layer, ${valueExpr} as value
    FROM ${tableName}
    WHERE prompt_id = ${promptId} AND position = ${position}${extraWhere}
    ${groupBy}
    ORDER BY layer
  `;
}

/**
 * Builds a CREATE OR REPLACE TEMP VIEW query that aggregates a head metric
 * across heads for a single layer.
 * Result columns: (head, value)
 * Only valid for head metrics (attention/contribution categories).
 */
export function buildLayerHeadViewQuery(
  viewName: string,
  promptId: number,
  layer: number,
  metric: string
): string | null {
  const category = getMetricCategory(metric);
  if (category !== 'attention' && category !== 'contribution') return null;

  const { tableName, metricColumn } = resolveTableAndColumn(category, metric);

  return `
    CREATE OR REPLACE TEMP VIEW ${viewName} AS
    SELECT head, AVG(${metricColumn}) as value
    FROM ${tableName}
    WHERE prompt_id = ${promptId} AND layer = ${layer}
    GROUP BY head
    ORDER BY head
  `;
}
