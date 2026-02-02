import * as vg from "@uwdata/vgplot";

/**
 * Heatmap configuration by metric category
 */
export interface HeatmapConfig {
  tableName: string;
  tableAlias: string;
  extraColumns: string[];
  xField: string;
  whereClause?: string;
  title: string;
  subtitleTemplate: string;
  colorScheme: { light: string; dark: string };
  useFullSize?: boolean; // If false, use scaled dimensions
}

export const HEATMAP_CONFIGS: Record<string, HeatmapConfig> = {
  attention: {
    tableName: "attn_head_metrics",
    tableAlias: "a",
    extraColumns: ["a.head"],
    xField: "head",
    title: "Attention Patterns",
    subtitleTemplate: "{metric} | Head x Token per Layer",
    colorScheme: { light: "YlGnBu", dark: "magma" },
    useFullSize: true,
  },
  contribution: {
    tableName: "head_contrib_metrics",
    tableAlias: "h",
    extraColumns: ["h.head"],
    xField: "head",
    title: "Head Contributions",
    subtitleTemplate: "{metric} | Head x Token per Layer",
    colorScheme: { light: "blues", dark: "magma" },
    useFullSize: true,
  },
  hidden: {
    tableName: "hidden_metrics",
    tableAlias: "h",
    extraColumns: [],
    xField: "layer",
    title: "Hidden State Metrics",
    subtitleTemplate: "{metric} | Layer x Token",
    colorScheme: { light: "greens", dark: "magma" },
    useFullSize: true,
  },
  mlp: {
    tableName: "mlp_metrics",
    tableAlias: "m",
    extraColumns: ["m.stage"],
    xField: "stage",
    title: "MLP Metrics",
    subtitleTemplate: "{metric} | Stage x Token per Layer",
    colorScheme: { light: "oranges", dark: "magma" },
    useFullSize: true,
  },
  mlpNeurons: {
    tableName: "mlp_topk",
    tableAlias: "m",
    extraColumns: ["m.neuron_rank", "m.neuron_id"],
    xField: "neuron_rank",
    title: "MLP Top-K Neurons",
    subtitleTemplate: "{metric} | Neuron Rank x Token per Layer",
    colorScheme: { light: "YlGnBu", dark: "magma" },
    useFullSize: true,
  },
  hiddenTrajectory: {
    tableName: "hidden_topk",
    tableAlias: "h",
    extraColumns: ["h.dim_rank", "h.dim_id"],
    xField: "dim_rank",
    title: "Hidden Trajectory",
    subtitleTemplate: "{metric} | Dimension Rank x Token per Layer",
    colorScheme: { light: "YlGnBu", dark: "magma" },
    useFullSize: true,
  },
  layernorm: {
    tableName: "activation_snapshot",
    tableAlias: "a",
    extraColumns: ["a.norm_type"],
    xField: "norm_type",
    whereClause: "AND a.type = 'norm'",
    title: "Layer Normalization",
    subtitleTemplate: "{metric} | Norm Type x Token per Layer",
    colorScheme: { light: "YlGnBu", dark: "magma" },
    useFullSize: true,
  },
};

/**
 * Standard margin configurations for heatmaps
 */
export const HEATMAP_MARGINS = {
  faceted: {
    marginLeft: 150,
    marginRight: 30,
    marginTop: 30,
    marginBottom: 40,
  },
  compact: {
    marginLeft: 150,
    marginRight: 20,
    marginTop: 5,
    marginBottom: 25,
  },
};

/**
 * Standard cell configuration for heatmaps
 */
export const CELL_CONFIG = {
  inset: 0.05,
};

/**
 * Configuration for chart options
 */
export interface ChartOptionsConfig {
  colorScheme: string;
  width: number;
  height: number;
  margins?: typeof HEATMAP_MARGINS.faceted;
  xLabel?: string | null;
  yLabel?: string | null;
  fxLabel?: string | null;
  hideXTicks?: boolean;
}

/**
 * Type for VGPlot options
 */
type VgPlotOption = ReturnType<
  | typeof vg.width
  | typeof vg.height
  | typeof vg.colorScheme
  | typeof vg.xLabel
  | typeof vg.yLabel
  | typeof vg.fxLabel
  | typeof vg.marginLeft
  | typeof vg.marginRight
  | typeof vg.marginTop
  | typeof vg.marginBottom
  | typeof vg.fxPaddingInner
  | typeof vg.xTicks
>;

/**
 * Creates standard chart options with tighter facet spacing
 */
export function createChartOptions(config: ChartOptionsConfig): VgPlotOption[] {
  const {
    colorScheme,
    width,
    height,
    margins = HEATMAP_MARGINS.faceted,
    xLabel = null,
    yLabel = null,
    fxLabel = null,
    hideXTicks = true,
  } = config;

  const options: VgPlotOption[] = [
    vg.colorScheme(colorScheme),
    vg.xLabel(xLabel),
    vg.yLabel(yLabel),
    vg.fxLabel(fxLabel),
    vg.width(width),
    vg.height(height),
    vg.marginLeft(margins.marginLeft),
    vg.marginRight(margins.marginRight),
    vg.marginTop(margins.marginTop),
    vg.marginBottom(margins.marginBottom),
    vg.fxPaddingInner(0.01), // Tighter spacing between facets
  ];

  if (hideXTicks) {
    options.push(vg.xAxis(null));
  }

  return options;
}
