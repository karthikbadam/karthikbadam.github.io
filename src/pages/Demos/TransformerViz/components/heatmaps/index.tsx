import * as vg from "@uwdata/vgplot";
import { useCallback } from "react";
import {
  ChartDimensions,
  MosaicChart,
} from "../../../../../components/MosaicChart";
import { useColorModeValue } from "../../../../../components/ui/color-mode";
import {
  useTransformer,
} from "../../../../../contexts/TransformerContext";
import {
  createHeatmapView,
  resolveMetricColumn,
} from "../../utils/queryBuilders";
import {
  CELL_CONFIG,
  createChartOptions,
  HEATMAP_CONFIGS,
  HEATMAP_MARGINS
} from "./config";
import { getMetricCategory, getMetricInfo } from "../../config/metrics";

/**
 * Heatmap - Consolidated component for all metric category visualizations
 *
 * Renders the appropriate heatmap configuration based on the selected metric.
 * Handles all 7 metric categories:
 * - attention: Head-based metrics
 * - contribution: Head contribution metrics
 * - hidden: Hidden state metrics (layer-based)
 * - mlp: MLP stage metrics
 * - mlpNeurons: Top-K MLP neurons
 * - hiddenTrajectory: Top-K hidden dimensions
 * - layernorm: Layer normalization metrics
 */
export function Heatmap() {
  const {
    state,
    coordinator,
    selectedPromptId,
    selectedMetric,
    promptTokens,
  } = useTransformer();
  const category = getMetricCategory(selectedMetric);
  const config = HEATMAP_CONFIGS[category as keyof typeof HEATMAP_CONFIGS];
  const metricInfo = getMetricInfo(selectedMetric);

  // Select color scheme based on light/dark mode
  const colorScheme = useColorModeValue(
    config.colorScheme.light,
    config.colorScheme.dark,
  );

  const setup = useCallback(async () => {
    if (
      !coordinator ||
      selectedPromptId === null ||
      !selectedMetric ||
      !category
    ) {
      return null;
    }

    const metricColumn = resolveMetricColumn(selectedMetric, category);

    return await createHeatmapView(coordinator, {
      tableName: config.tableName,
      tableAlias: config.tableAlias,
      promptId: selectedPromptId,
      metricColumn,
      extraColumns: config.extraColumns,
      whereClause: config.whereClause,
    });
  }, [coordinator, selectedPromptId, selectedMetric, category, config]);

  const build = useCallback(
    (
      setupResult: { viewName: string } | null,
      { width, height }: ChartDimensions,
    ) => {
      if (!setupResult) return null;
      const { viewName } = setupResult;

      // Build tooltip channels based on x-axis attribute
      const tipChannels: Record<string, string> = {
        token: "token_text",
        pos: "position",
        metric: "value",
      };

      // Add x-axis attribute to tooltip if it exists
      if (config.xField !== "layer") {
        if (config.xField === "head") {
          tipChannels.head = "head";
        } else if (config.xField === "stage") {
          tipChannels.stage = "stage";
        } else if (config.xField === "neuron_rank") {
          tipChannels.neuron = "neuron_id";
        } else if (config.xField === "dim_rank") {
          tipChannels.dim = "dim_id";
        } else if (config.xField === "norm_type") {
          tipChannels.norm = "norm_type";
        }
      }

      const marks = [
        vg.cell(vg.from(viewName), {
          fx: category === "hidden" ? null : "layer",
          x: category === "hidden" ? "layer" : config.xField,
          y: "token_label",
          fill: "value",
          ...CELL_CONFIG,
          channels: tipChannels,
          tip: {
            format: {
              token: true,
              pos: true,
              metric: true,
              head: config.xField === "head",
              stage: config.xField === "stage",
              neuron: config.xField === "neuron_rank",
              dim: config.xField === "dim_rank",
              norm: config.xField === "norm_type",
              x: false,
              y: false,
              fx: false,
              fill: false,
            },
          },
        }),
        ...createChartOptions({
          colorScheme,
          width: 1.2 * width,
          height: 1.2 * height,
          margins: HEATMAP_MARGINS.faceted,
          xLabel: category === "hidden" ? "layer" : config.xField,
          yLabel: "Token",
          fxLabel: category === "hidden" ? null : "layer",
        }),
      ];

      return vg.plot(...marks);
    },
    [colorScheme, config, category],
  );

  const subtitle = config.subtitleTemplate.replace(
    "{metric}",
    metricInfo?.label || selectedMetric,
  );

  if (!selectedMetric) {
    return null;
  }

  if (!category) {
    return null;
  }

  return (
    <MosaicChart
      title={config.title}
      subtitle={subtitle}
      setup={setup}
      build={build}
      dependencies={[selectedMetric, selectedPromptId, promptTokens.length]}
      isReady={state.status === "ready"}
      containerCss={{ overflowX: "auto", overflowY: "hidden" }}
    />
  );
}
