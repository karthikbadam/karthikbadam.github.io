import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface LayerNormHeatmapProps {
  metric: "mean" | "variance";
  normType?: "input_norm" | "post_norm";
}

export function LayerNormHeatmap({ metric, normType }: LayerNormHeatmapProps) {
  const {
    coordinator,
    selectedPromptId,
    selectedTokenRange,
    selectedLayerRange,
  } = useTransformer();

  const setup = useCallback(async (): Promise<{ viewName: string }> => {
    if (!coordinator || selectedPromptId === null) {
      return { viewName: "empty_layernorm_heatmap" };
    }

    const viewName = `layernorm_${metric}_${normType || "all"}`;
    const metricColumn = metric === "mean" ? "mean" : "variance";

    let whereClause = `WHERE prompt_id = ${selectedPromptId} AND type = 'norm'`;
    if (normType) {
      whereClause += ` AND norm_type = '${normType}'`;
    }
    if (selectedTokenRange) {
      whereClause += ` AND position >= ${selectedTokenRange[0]} AND position <= ${selectedTokenRange[1]}`;
    }
    if (selectedLayerRange) {
      whereClause += ` AND layer >= ${selectedLayerRange[0]} AND layer <= ${selectedLayerRange[1]}`;
    }

    const query = `
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      SELECT position, layer, ${metricColumn} as value
      FROM activation_snapshot
      ${whereClause}
      ORDER BY layer, position
    `;

    await coordinator.exec(query);
    return { viewName };
  }, [
    coordinator,
    selectedPromptId,
    metric,
    normType,
    selectedTokenRange,
    selectedLayerRange,
  ]);

  const build = useCallback(
    (setupResult: { viewName: string }, { width, height }: ChartDimensions) => {
      if (!setupResult || setupResult.viewName === "empty_layernorm_heatmap") return null;

      return vg.plot(
        vg.cell(vg.from(setupResult.viewName), {
          x: "position",
          y: "layer",
          fill: "value",
          tip: true,
          inset: 0.5,
        }),
        vg.colorScheme("viridis"),
        vg.xLabel("Token Position"),
        vg.yLabel("Layer"),
        vg.colorLegend("right"),
        vg.width(width),
        vg.height(height),
        vg.marginLeft(60),
        vg.marginBottom(50),
        vg.marginTop(30),
        vg.marginRight(80)
      );
    },
    [metric]
  );

  return (
    <MosaicChart<{ viewName: string }>
      title={`LayerNorm ${metric === "mean" ? "Mean" : "Variance"}`}
      subtitle={normType || "All norm types"}
      setup={setup}
      build={build}
      dependencies={[selectedPromptId, metric, normType, selectedTokenRange, selectedLayerRange]}
      isReady={coordinator !== null && selectedPromptId !== null}
      loadingText="Loading LayerNorm diagnostics..."
    />
  );
}
