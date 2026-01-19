import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

export function EmbeddingCard() {
  const { coordinator } = useTransformer();

  const setup = useCallback(async () => {
    if (!coordinator) return null;
    const viewName = `embedding_weights`;
    // Query embedding weights (layer=-1, role=embed_tokens)
    const baseUrl = window.location.origin;
    const hashBase = window.location.pathname.replace(/\/$/, "");
    const dataPath = `${baseUrl}${hashBase}/data/llm`;
    const embedFile = `raw_weights_l-1_embed_tokens.parquet`;
    
    // Create view with raw weight values - sample 50 tokens, every 16th dimension
    // This gives us 50 × 128 = 6,400 points which is manageable
    await coordinator.exec(`
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      WITH expanded AS (
        SELECT 
          row_idx as token_idx,
          UNNEST(GENERATE_SERIES(0, col_end - 1)) as dim_idx,
          UNNEST(values) as weight_val
        FROM '${dataPath}/${embedFile}'
        WHERE row_idx < 50
      )
      SELECT token_idx, dim_idx, weight_val
      FROM expanded
      WHERE dim_idx % 16 = 0
    `);
    return { viewName };
  }, [coordinator]);

  const build = useCallback(
    (setupResult: { viewName: string } | null, { width, height }: ChartDimensions) => {
      if (!setupResult) return null;

      return vg.plot(
        vg.cell(vg.from(setupResult.viewName), {
          x: "dim_idx",
          y: "token_idx",
          fill: "weight_val",
          tip: true,
        }),
        vg.colorScheme("RdBu"),
        vg.xLabel("Hidden Dimension (sampled)"),
        vg.yLabel("Token Index"),
        vg.xTicks([]),
        vg.yTicks([]),
        vg.width(width),
        vg.height(height),
        vg.marginLeft(40),
        vg.marginBottom(20),
        vg.marginTop(40)
      );
    },
    []
  );

  return (
    <MosaicChart
      title="Embedding Weights"
      subtitle="Raw weight values (50 tokens × 128 dims sampled)"
      setup={setup}
      build={build}
      dependencies={[]}
      isReady={coordinator !== null}
    />
  );
}
