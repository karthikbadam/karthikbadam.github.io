import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface TokenLayerHeatmapSliceProps {
  metric: string;
  title: string;
  subtitle?: string;
  tableName: string;
  dependencies?: unknown[];
}

export function TokenLayerHeatmapSlice({
  metric,
  title,
  subtitle,
  tableName,
  dependencies = [],
}: TokenLayerHeatmapSliceProps) {
  const {
    coordinator,
    selectedPromptId,
    selectedTokenRange,
    selectedLayerRange,
  } = useTransformer();

  const setup = useCallback(async (): Promise<{ viewName: string }> => {
    if (!coordinator || selectedPromptId === null || !metric) {
      return { viewName: "empty_token_layer_heatmap" };
    }

    const viewName = `token_layer_${tableName}_${metric}`;
    const metricColumn = metric;

    let whereClause = `WHERE prompt_id = ${selectedPromptId}`;
    if (selectedTokenRange) {
      whereClause += ` AND position >= ${selectedTokenRange[0]} AND position <= ${selectedTokenRange[1]}`;
    }
    if (selectedLayerRange) {
      whereClause += ` AND layer >= ${selectedLayerRange[0]} AND layer <= ${selectedLayerRange[1]}`;
    }

    const query = `
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      SELECT position, layer, ${metricColumn} as value
      FROM ${tableName}
      ${whereClause}
      ORDER BY layer, position
    `;

    await coordinator.exec(query);
    return { viewName };
  }, [
    coordinator,
    selectedPromptId,
    metric,
    tableName,
    selectedTokenRange,
    selectedLayerRange,
  ]);

  const build = useCallback(
    (setupResult: { viewName: string }, { width, height }: ChartDimensions) => {
      if (!setupResult || setupResult.viewName === "empty_token_layer_heatmap") return null;

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
      title={title}
      subtitle={subtitle}
      setup={setup}
      build={build}
      dependencies={[selectedPromptId, metric, selectedTokenRange, selectedLayerRange, ...dependencies]}
      isReady={coordinator !== null && selectedPromptId !== null}
      loadingText="Loading heatmap..."
    />
  );
}
