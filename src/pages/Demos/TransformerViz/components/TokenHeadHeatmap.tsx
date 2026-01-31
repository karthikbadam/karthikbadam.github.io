import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface TokenHeadHeatmapProps {
  layer: number;
  metric: string;
  title?: string;
}

export function TokenHeadHeatmap({ layer, metric, title }: TokenHeadHeatmapProps) {
  const { coordinator, selectedPromptId } = useTransformer();

  const setup = useCallback(async (): Promise<{ viewName: string }> => {
    if (!coordinator || selectedPromptId === null || !metric) {
      return { viewName: "empty_token_head_heatmap" };
    }

    const viewName = `token_head_heatmap_l${layer}_${metric}`;

    // Determine which table to query based on metric
    let tableName = '';
    
    if (['entropy', 'top1_mass', 'topk_mass', 'diagonal_mass', 'band_mass'].includes(metric)) {
      tableName = 'attn_head_metrics';
    } else if (['contrib_l2', 'contrib_to_argmax_logit', 'contrib_to_argmax_logit_normed'].includes(metric)) {
      tableName = 'head_contrib_metrics';
    } else {
      console.warn(`Unknown metric for Token×Head: ${metric}`);
      return { viewName: "empty_token_head_heatmap" };
    }

    const query = `
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      SELECT position, head, ${metric} as value
      FROM ${tableName}
      WHERE prompt_id = ${selectedPromptId} AND layer = ${layer}
      ORDER BY head, position
    `;

    await coordinator.exec(query);
    return { viewName };
  }, [coordinator, selectedPromptId, layer, metric]);

  const build = useCallback(
    (setupResult: { viewName: string }, { width, height }: ChartDimensions) => {
      if (!setupResult || setupResult.viewName === "empty_token_head_heatmap") return null;

      return vg.plot(
        vg.cell(vg.from(setupResult.viewName), {
          x: "position",
          y: "head",
          fill: "value",
          tip: true,
          inset: 0.5,
        }),
        vg.colorScheme("viridis"),
        vg.xLabel("Token Position"),
        vg.yLabel("Head"),
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
      title={title || `Token × Head Heatmap`}
      subtitle={`Layer ${layer} - ${metric}`}
      setup={setup}
      build={build}
      dependencies={[selectedPromptId, layer, metric]}
      isReady={coordinator !== null && selectedPromptId !== null}
      loadingText="Loading Token × Head heatmap..."
    />
  );
}
