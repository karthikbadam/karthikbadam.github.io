import { useCallback, useMemo, useEffect } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface HeatmapSetupResult {
  viewName: string;
}

export function MainHeatmap() {
  const {
    coordinator,
    selectedPromptId,
    selectedMetric,
    aggregationMethod,
    selectedTokenRange,
    selectedLayerRange,
    setSelectedTokenRange,
    setSelectedLayerRange,
  } = useTransformer();

  // Create selection for heatmap brushing (both X and Y axes)
  const heatmapSelection = useMemo(() => vg.Selection.crossfilter(), []);

  // Listen to selection changes from heatmap brushing
  useEffect(() => {
    const handleSelection = () => {
      const clauses = heatmapSelection?.clauses;
      if (clauses?.length && clauses[0].value) {
        // intervalXY value format: { x: [min, max], y: [min, max] }
        const value = clauses[0].value as { x?: [number, number]; y?: [number, number] };
        if (value.x && Array.isArray(value.x)) {
          setSelectedTokenRange([Math.floor(value.x[0]), Math.ceil(value.x[1])]);
        }
        if (value.y && Array.isArray(value.y)) {
          setSelectedLayerRange([Math.floor(value.y[0]), Math.ceil(value.y[1])]);
        }
      }
    };

    heatmapSelection.addEventListener("value", handleSelection);
    return () => {
      heatmapSelection.removeEventListener("value", handleSelection);
    };
  }, [heatmapSelection, setSelectedTokenRange, setSelectedLayerRange]);

  const setup = useCallback(async (): Promise<HeatmapSetupResult> => {
    if (!coordinator || selectedPromptId === null || !selectedMetric) {
      // Return a dummy view name - build will handle null case
      return { viewName: "empty_heatmap" };
    }

    // Determine which table to query based on metric
    let tableName = '';
    const metricColumn = selectedMetric;
    
    if (selectedMetric === 'hidden_norm' || selectedMetric === 'cosine_similarity_prev_layer') {
      tableName = 'hidden_metrics';
    } else if (['entropy', 'top1_mass', 'topk_mass', 'diagonal_mass', 'band_mass'].includes(selectedMetric)) {
      tableName = 'attn_head_metrics';
    } else if (['gate_sparsity_proxy', 'topk_energy_fraction', 'gate_l2_norm', 'up_l2_norm', 'down_l2_norm'].includes(selectedMetric)) {
      tableName = 'mlp_metrics';
    } else if (['contrib_l2', 'contrib_to_argmax_logit', 'contrib_to_argmax_logit_normed'].includes(selectedMetric)) {
      tableName = 'head_contrib_metrics';
    } else {
      console.warn(`Unknown metric: ${selectedMetric}`);
      return { viewName: "empty_heatmap" };
    }

    const viewName = `heatmap_${selectedPromptId}_${selectedMetric}`;

    let whereClause = `WHERE prompt_id = ${selectedPromptId}`;
    if (selectedTokenRange) {
      whereClause += ` AND position >= ${selectedTokenRange[0]} AND position <= ${selectedTokenRange[1]}`;
    }
    if (selectedLayerRange) {
      whereClause += ` AND layer >= ${selectedLayerRange[0]} AND layer <= ${selectedLayerRange[1]}`;
    }

    let query = '';
    if (tableName === 'mlp_metrics' || tableName === 'hidden_metrics') {
      // No head dimension, direct query
      query = `
        CREATE OR REPLACE TEMP VIEW ${viewName} AS
        SELECT position, layer, ${metricColumn} as value
        FROM ${tableName}
        ${whereClause}
        ORDER BY layer, position
      `;
    } else {
      // Has head dimension, need aggregation
      if (aggregationMethod === 'topk_mean') {
        // Top-k mean requires join with head_contrib_metrics
        query = `
          CREATE OR REPLACE TEMP VIEW ${viewName} AS
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
        const aggFunc = aggregationMethod.toUpperCase();
        query = `
          CREATE OR REPLACE TEMP VIEW ${viewName} AS
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

    await coordinator.exec(query);
    return { viewName };
  }, [
    coordinator,
    selectedPromptId,
    selectedMetric,
    aggregationMethod,
    selectedTokenRange,
    selectedLayerRange,
  ]);

  const build = useCallback(
    (setupResult: HeatmapSetupResult, { width, height }: ChartDimensions) => {
      if (!setupResult || setupResult.viewName === "empty_heatmap") return null;

      return vg.plot(
        vg.cell(vg.from(setupResult.viewName), {
          x: "position",
          y: "layer",
          fill: "value",
          tip: true,
          inset: 0.5,
        }),
        vg.intervalXY({ as: heatmapSelection }),
        vg.highlight({ by: heatmapSelection }),
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
    [heatmapSelection, selectedMetric]
  );

  return (
    <MosaicChart<HeatmapSetupResult>
      title="Token × Layer Heatmap"
      subtitle={selectedMetric || "Select a metric"}
      setup={setup}
      build={build}
      dependencies={[
        selectedPromptId,
        selectedMetric,
        aggregationMethod,
        selectedTokenRange,
        selectedLayerRange,
      ]}
      isReady={coordinator !== null && selectedPromptId !== null && !!selectedMetric}
      loadingText="Loading heatmap data..."
    />
  );
}
