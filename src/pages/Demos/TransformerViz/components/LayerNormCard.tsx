import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface LayerNormCardProps {
  layer: number | null;
  normType: "input_norm" | "post_norm" | "final_norm";
}

export function LayerNormCard({ layer, normType }: LayerNormCardProps) {
  const { coordinator } = useTransformer();

  const setup = useCallback(async () => {
    if (!coordinator) return null;
    const viewName = `layernorm_${layer !== null ? `l${layer}_` : ""}${normType}`;
    // Query layer norm weights
    const baseUrl = window.location.origin;
    const hashBase = window.location.pathname.replace(/\/$/, "");
    const dataPath = `${baseUrl}${hashBase}/data/llm`;
    
    // Layer norms are stored as single-row files with the full weight vector
    const layerNum = layer !== null ? layer : -1;
    const normFile = `raw_weights_l${layerNum}_${normType}.parquet`;
    
    // Create view showing the distribution of norm weights
    // Layer norms are stored as a single row (row_idx=0) with the full weight vector
    // DuckDB pairs UNNEST operations element-wise when they're in the same SELECT
    await coordinator.exec(`
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      SELECT 
        UNNEST(GENERATE_SERIES(0, col_end - 1)) as dim_idx,
        UNNEST(values) as weight_val
      FROM '${dataPath}/${normFile}'
      WHERE row_idx = 0
    `);
    return { viewName };
  }, [coordinator, layer, normType]);

  const build = useCallback(
    (setupResult: { viewName: string } | null, { width, height }: ChartDimensions) => {
      if (!setupResult) return null;

      return vg.plot(
        vg.rectY(vg.from(setupResult.viewName), {
          x: "dim_idx",
          y: "weight_val",
          tip: true,
        }),
        vg.colorScheme("teals"),
        vg.xLabel("Dimension Index"),
        vg.yLabel("Weight Value (gamma)"),
        vg.xTicks([0, 256, 512, 768, 1024, 1280, 1536, 1792, 2047]),
        vg.yTicks([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75]),
        vg.width(width),
        vg.height(height),
        vg.marginLeft(60),
        vg.marginBottom(40),
        vg.marginTop(30)
      );
    },
    []
  );

  const title = layer !== null 
    ? `LayerNorm ${layer} - ${normType === "input_norm" ? "Input" : "Post-Attention"}`
    : "Final LayerNorm";

  return (
    <MosaicChart
      title={title}
      subtitle="Layer normalization scale parameters"
      setup={setup}
      build={build}
      dependencies={[layer, normType]}
      isReady={coordinator !== null}
    />
  );
}
